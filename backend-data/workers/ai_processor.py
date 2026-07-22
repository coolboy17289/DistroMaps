"""
AI Processor Worker — generates embeddings, detects duplicates, discovers relationships.

Runs as a long-lived worker process, consuming tasks from a Redis queue.

Usage:
    python -m workers.ai_processor
"""

import os
import json
import time
import logging

import psycopg2
import psycopg2.extras
import redis

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(levelname)s: %(message)s')
logger = logging.getLogger('ai-processor')

DATABASE_URL = os.environ.get('DATABASE_URL', 'postgres://distromap:changeme@localhost:5432/distromap')
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')


def get_db():
    return psycopg2.connect(DATABASE_URL)


def generate_embedding(text: str) -> list[float] | None:
    """Generate an embedding vector for the given text using OpenAI."""
    if not OPENAI_API_KEY:
        return None
    try:
        import openai
        client = openai.OpenAI(api_key=OPENAI_API_KEY)
        response = client.embeddings.create(
            model='text-embedding-ada-002',
            input=text[:8000],  # Truncate to token limit
        )
        return response.data[0].embedding
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return None


def process_new_entity(entity_id: str):
    """Generate embedding for a newly added entity."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT e.name, e.description, d.version, d.release_model, d.country
                FROM entities e
                LEFT JOIN distros d ON d.entity_id = e.id
                WHERE e.id = %s
            """, [entity_id])
            row = cur.fetchone()
            if not row:
                return

            # Build text for embedding
            parts = [row['name'] or '']
            if row.get('description'):
                parts.append(row['description'])
            if row.get('version'):
                parts.append(f"version {row['version']}")
            if row.get('release_model'):
                parts.append(f"release model: {row['release_model']}")
            if row.get('country'):
                parts.append(f"from {row['country']}")

            text = ' '.join(parts)
            embedding = generate_embedding(text)

            if embedding:
                vec_str = '[' + ','.join(str(x) for x in embedding) + ']'
                cur.execute("""
                    INSERT INTO embeddings (entity_id, embedding, model)
                    VALUES (%s, %s::vector, 'text-embedding-ada-002')
                    ON CONFLICT (entity_id) DO UPDATE SET
                        embedding = EXCLUDED.embedding,
                        model = EXCLUDED.model,
                        created_at = now()
                """, [entity_id, vec_str])
                conn.commit()
                logger.info(f"Generated embedding for {entity_id}")
    finally:
        conn.close()


def find_duplicates(threshold: float = 0.95):
    """Find potential duplicate entities based on embedding similarity."""
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT e1.entity_id AS id1, e2.entity_id AS id2,
                       1 - (e1.embedding <=> e2.embedding) AS similarity
                FROM embeddings e1
                JOIN embeddings e2 ON e2.entity_id > e1.entity_id
                WHERE 1 - (e1.embedding <=> e2.embedding) > %s
                ORDER BY similarity DESC
                LIMIT 50
            """, [threshold])
            duplicates = cur.fetchall()
            if duplicates:
                logger.info(f"Found {len(duplicates)} potential duplicates")
                for dup in duplicates:
                    logger.info(f"  {dup['id1']} <-> {dup['id2']} (similarity: {dup['similarity']:.3f})")
            return duplicates
    finally:
        conn.close()


def run():
    """Main worker loop — processes entities from Redis queue."""
    r = redis.from_url(REDIS_URL)
    logger.info("AI Processor started, waiting for tasks...")

    while True:
        try:
            # Block-wait for tasks from the queue
            task = r.brpop('ai:embed_queue', timeout=30)
            if task is None:
                continue

            _, payload = task
            data = json.loads(payload)
            entity_id = data.get('entity_id')

            if entity_id:
                process_new_entity(entity_id)

        except KeyboardInterrupt:
            logger.info("Shutting down...")
            break
        except Exception as e:
            logger.error(f"Error processing task: {e}")
            time.sleep(5)


if __name__ == '__main__':
    run()

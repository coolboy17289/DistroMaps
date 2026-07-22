-- DistroMap PostgreSQL Schema
-- Run automatically on first container start via docker-entrypoint-initdb.d

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector for AI embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- Trigram indexes for fuzzy search

-- ─── Entity Types ──────────────────────────────────────────────────────
-- Universal node type: everything in the graph is an entity.
CREATE TYPE entity_type AS ENUM (
    'distro', 'family', 'company', 'maintainer', 'technology',
    'package_manager', 'desktop_environment', 'init_system',
    'architecture', 'repository', 'documentation', 'mirror'
);

CREATE TYPE distro_status AS ENUM ('active', 'discontinued');
CREATE TYPE release_model AS ENUM ('rolling', 'fixed', 'semi-rolling', 'half-rolling', 'lts', 'static');

-- ─── Entities ──────────────────────────────────────────────────────────
CREATE TABLE entities (
    id          TEXT PRIMARY KEY,            -- stable slug: "ubuntu", "arch", "gnome"
    name        TEXT NOT NULL,               -- display name: "Ubuntu", "Arch Linux"
    type        entity_type NOT NULL,
    description TEXT,
    website     TEXT,
    wikipedia   TEXT,
    logo_url    TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,   -- flexible extra fields
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name_trgm ON entities USING gin(name gin_trgm_ops);
CREATE INDEX idx_entities_metadata ON entities USING gin(metadata);

-- ─── Distro Details ────────────────────────────────────────────────────
-- Extends entities where type = 'distro'
CREATE TABLE distros (
    entity_id       TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    status          distro_status NOT NULL DEFAULT 'active',
    founded         INTEGER,
    discontinued_at INTEGER,
    country         TEXT,
    version         TEXT,
    release_model   release_model,
    license         TEXT,
    download_url    TEXT,
    iso_checksum    TEXT,
    git_repository  TEXT,
    doc_url         TEXT,
    last_updated    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_distros_status ON distros(status);
CREATE INDEX idx_distros_country ON distros(country);

-- ─── Family Details ────────────────────────────────────────────────────
CREATE TABLE families (
    entity_id       TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    color           TEXT NOT NULL DEFAULT '#888888',
    color_secondary TEXT,
    root_distro_id  TEXT REFERENCES entities(id),
    founded         INTEGER
);

-- ─── Technologies (package managers, DEs, init systems, architectures) ─
CREATE TABLE technologies (
    entity_id   TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    tech_type   TEXT NOT NULL,  -- 'package_manager', 'desktop_env', 'init_system', 'architecture'
    homepage    TEXT
);

CREATE INDEX idx_technologies_type ON technologies(tech_type);

-- ─── Edges (Relationships) ─────────────────────────────────────────────
-- Every relationship between any two entities is an edge.
CREATE TYPE edge_type AS ENUM (
    'based_on',           -- distro → distro/family
    'belongs_to_family',  -- distro → family
    'uses_package_mgr',   -- distro → technology
    'uses_desktop',       -- distro → technology
    'uses_init',          -- distro → technology
    'supports_arch',      -- distro → technology
    'maintained_by',      -- entity → maintainer/company
    'developed_by',       -- entity → company
    'documented_at',      -- entity → documentation
    'mirrored_at',        -- entity → mirror
    'hosted_at',          -- entity → repository
    'succeeded_by',       -- distro → distro (discontinued → successor)
    'derivative_of'       -- distro → distro (general lineage)
);

CREATE TABLE edges (
    id          SERIAL PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    rel_type    edge_type NOT NULL,
    metadata    JSONB DEFAULT '{}'::jsonb,
    confidence  REAL DEFAULT 1.0,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(source_id, target_id, rel_type)
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(rel_type);

-- ─── Embeddings (AI vectors) ──────────────────────────────────────────
CREATE TABLE embeddings (
    entity_id   TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    embedding   vector(1536),     -- OpenAI ada-002 dimensions
    model       TEXT DEFAULT 'text-embedding-ada-002',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_embeddings_cosine ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─── Releases ──────────────────────────────────────────────────────────
CREATE TABLE releases (
    id          SERIAL PRIMARY KEY,
    distro_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    version     TEXT NOT NULL,
    release_date DATE,
    codename    TEXT,
    is_lts      BOOLEAN DEFAULT false,
    eol_date    DATE,
    download_url TEXT,
    checksum    TEXT,
    notes       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_releases_distro ON releases(distro_id);
CREATE INDEX idx_releases_date ON releases(release_date DESC);

-- ─── Crawl History ────────────────────────────────────────────────────
CREATE TABLE crawl_runs (
    id              SERIAL PRIMARY KEY,
    cycle_id        TEXT NOT NULL UNIQUE,
    started_at      TIMESTAMPTZ NOT NULL,
    finished_at     TIMESTAMPTZ,
    sources_queried INTEGER DEFAULT 0,
    candidates_found INTEGER DEFAULT 0,
    accepted        INTEGER DEFAULT 0,
    new_distros     INTEGER DEFAULT 0,
    updated_distros INTEGER DEFAULT 0,
    errors          JSONB DEFAULT '[]'::jsonb,
    trust_scores    JSONB DEFAULT '{}'::jsonb
);

-- ─── Suggestions (user-submitted distro suggestions) ──────────────────
CREATE TABLE suggestions (
    id          SERIAL PRIMARY KEY,
    topic       TEXT NOT NULL,
    rationale   TEXT,
    submitter   TEXT,
    validated   JSONB,
    status      TEXT DEFAULT 'pending',  -- pending, accepted, rejected
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Helper: auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Views ─────────────────────────────────────────────────────────────
CREATE VIEW distro_full AS
SELECT
    e.id, e.name, e.description, e.website, e.wikipedia, e.logo_url,
    d.status, d.founded, d.discontinued_at, d.country, d.version,
    d.release_model, d.license, d.download_url, d.iso_checksum,
    d.git_repository, d.doc_url, d.last_updated,
    f.id AS family_id, f.name AS family_name, f.color AS family_color,
    eft.target_id AS parent_id
FROM entities e
JOIN distros d ON d.entity_id = e.id
LEFT JOIN edges eft ON eft.source_id = e.id AND eft.rel_type = 'based_on'
LEFT JOIN edges efam ON efam.source_id = e.id AND efam.rel_type = 'belongs_to_family'
LEFT JOIN entities f ON efam.target_id = f.id
WHERE e.type = 'distro';

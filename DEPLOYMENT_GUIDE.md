# DistroMap Deployment Guide

## Quick Start (Development)

```bash
# 1. Clone and configure
git clone <repo-url> distromap && cd distromap
cp .env.example .env
# Edit .env with your database passwords

# 2. Start databases only
docker compose up -d postgres redis

# 3. Migrate data from JSON to PostgreSQL
cd backend-api && npm install && npm run migrate && cd ..

# 4. Start the API
cd backend-api && npm run dev &

# 5. Start the frontend
cd frontend-vue && npm install && npm run dev
# → http://localhost:5173
```

## Production Deployment (Two Ubuntu Servers)

### Prerequisites

**Both servers:**
- Ubuntu 22.04+ or 24.04 LTS
- Docker 24+ and Docker Compose v2
- SSH access with key authentication
- UFW firewall configured

**Server 1 (Main):**
- 4+ CPU cores, 8+ GB RAM
- Ports 80, 443 (public), 3001, 5432, 6379 (internal)

**Server 2 (Workers):**
- 4+ CPU cores, 8+ GB RAM
- Ports 5432, 6379 (internal only, connected via VPN/WireGuard)

### Step 1: Server 1 Setup

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Clone project
git clone <repo-url> /opt/distromap
cd /opt/distromap

# Configure environment
cp .env.example .env
nano .env  # Set strong passwords!

# Build and start Server 1 services
docker compose up -d postgres redis backend-api frontend

# Migrate existing data
docker compose exec backend-api node dist/migrate.js

# Verify
curl http://localhost:3001/api/health
# → {"status":"ok","distros":380}
```

### Step 2: Server 2 Setup

```bash
# Install Docker on Server 2
curl -fsSL https://get.docker.com | sh

# Clone project (or rsync from Server 1)
git clone <repo-url> /opt/distromap
cd /opt/distromap

# Update DATABASE_URL in .env to point to Server 1's PostgreSQL
# (requires WireGuard VPN or SSH tunnel between servers)
# Example: DATABASE_URL=postgres://distromap:pass@10.0.0.1:5432/distromap

# Start worker services
docker compose --profile workers up -d python-scrapers ai-processor
```

### Step 3: SSL with Let's Encrypt

```bash
# Install certbot on Server 1
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d distromap.io -d www.distromap.io

# Auto-renew (certbot sets this up automatically)
sudo systemctl enable certbot.timer
```

### Step 4: Set Up Cron for Scrapers

```bash
# On Server 2, add to crontab:
crontab -e

# Run crawlers daily at 3 AM
0 3 * * * cd /opt/distromap && docker compose --profile workers run --rm python-scrapers scrapy crawl distrowatch >> /var/log/distromap-crawl.log 2>&1
0 4 * * * cd /opt/distromap && docker compose --profile workers run --rm python-scrapers scrapy crawl wikipedia >> /var/log/distromap-crawl.log 2>&1
```

### Step 5: Monitoring

```bash
# Health check endpoint
curl http://localhost:3001/api/health

# Docker logs
docker compose logs -f --tail=50 backend-api

# Database size
docker compose exec postgres psql -U distromap -c "SELECT pg_size_pretty(pg_database_size('distromap'));"
```

## Backup & Restore

### Automated Backup

```bash
# Daily PostgreSQL backup (add to cron)
0 2 * * * docker compose exec -T postgres pg_dump -U distromap distromap | gzip > /backups/distromap_$(date +\%Y\%m\%d).sql.gz

# Keep 30 days of backups
find /backups -name "distromap_*.sql.gz" -mtime +30 -delete
```

### Restore

```bash
gunzip < /backups/distromap_20260101.sql.gz | docker compose exec -T postgres psql -U distromap distromap
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| API returns 500 | Check `docker compose logs backend-api` |
| Frontend shows blank | Verify `data.json` exists in `frontend-vue/public/` |
| Scrapers timeout | Check network between servers, increase `DOWNLOAD_TIMEOUT` |
| PostgreSQL connection refused | Verify `POSTGRES_PASSWORD` in `.env`, check `docker compose ps` |
| Redis connection error | Redis is optional for caching; API works without it |

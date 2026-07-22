# DistroMap Architecture

## Overview

DistroMap is an interactive knowledge graph of the Linux ecosystem — mapping distributions, families, technologies, and their relationships in a 3D visualization.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Server 1 (Main)                              │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐    ┌─────────┐  │
│  │  Nginx   │───▶│  Vue 3 SPA   │    │ PostgreSQL│    │  Redis  │  │
│  │ :80      │    │  + Three.js  │    │ + pgvector│    │  Cache  │  │
│  └────┬─────┘    │  3D Graph    │    │  :5432    │    │  :6379  │  │
│       │          └──────────────┘    └─────┬─────┘    └────┬────┘  │
│       │                                    │               │       │
│       └───── proxy /api/ ──▶ ┌───────────┐ │               │       │
│                              │ Express.js │─┘               │       │
│                              │ API :3001  │─────────────────┘       │
│                              └───────────┘                          │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       Server 2 (Workers)                            │
│                                                                     │
│  ┌────────────────┐    ┌─────────────────┐                          │
│  │  Scrapy         │    │  AI Processor   │                          │
│  │  Scrapers       │    │  Embeddings     │                          │
│  │  (Wikipedia,    │    │  Dedup          │                          │
│  │   DistroWatch,  │    │  Classification │                          │
│  │   GitHub)       │    │                 │                          │
│  └───────┬─────────┘    └────────┬────────┘                          │
│          │                       │                                   │
│          └───── PostgreSQL ──────┘                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | Vue 3, Three.js, TypeScript, Tailwind CSS |
| 3D Engine   | Three.js (WebGL), InstancedMesh     |
| Backend API | Express.js 5, TypeScript, pg, ioredis |
| Database    | PostgreSQL 16 + pgvector extension  |
| Cache       | Redis 7                             |
| Scrapers    | Python 3.12, Scrapy, BeautifulSoup  |
| AI          | OpenAI embeddings, sentence-transformers |
| Deployment  | Docker Compose, Nginx               |

## Data Model

Every object in the Linux ecosystem is a **graph node** stored as an `entity` in PostgreSQL. Every relationship is an **edge**.

```
Linux Kernel (entity: distro)
    │ based_on
    ├── Debian (entity: distro → family: debian)
    │   ├── Ubuntu (entity: distro → family: ubuntu)
    │   │   ├── Linux Mint
    │   │   ├── Pop!_OS
    │   │   └── elementary OS
    │   ├── LMDE
    │   └── Kali Linux
    ├── Arch Linux (entity: distro → family: arch)
    │   ├── Manjaro
    │   ├── EndeavourOS
    │   └── CachyOS
    └── RHEL (entity: distro → family: rhel)
        ├── Fedora
        ├── CentOS
        ├── Rocky Linux
        └── AlmaLinux
```

### Entity Types

- **distro** — A Linux distribution
- **family** — A distribution family (Debian, Arch, RHEL, etc.)
- **technology** — Package managers, desktop environments, init systems, architectures
- **company** — Corporate maintainers (Canonical, Red Hat, SUSE)
- **maintainer** — Individual or team maintainers
- **repository** — Git repos, package repos
- **documentation** — Wiki/docs links
- **mirror** — Download mirrors

### Edge Types

- `based_on` — Distro lineage (Ubuntu based_on Debian)
- `belongs_to_family` — Family membership
- `uses_package_mgr` — Technology usage
- `uses_desktop` — Desktop environment
- `uses_init` — Init system
- `supports_arch` — Architecture support
- `maintained_by` — Maintainer relationship
- `developed_by` — Company relationship
- `succeeded_by` — Successor (discontinued → new)
- `derivative_of` — General lineage

## API Routes

| Method | Path                      | Description                    |
|--------|---------------------------|--------------------------------|
| GET    | `/api/search?q=&limit=`   | Full-text + key:value search   |
| GET    | `/api/distro/:slug`       | Single distro + family         |
| GET    | `/api/path?from=&to=`     | BFS shortest path              |
| GET    | `/api/compare?ids=a,b`    | Side-by-side comparison        |
| GET    | `/api/stats`              | Aggregate statistics           |
| GET    | `/api/families`           | All families with colors       |
| GET    | `/api/graph`              | Full graph (nodes + edges)     |
| GET    | `/api/releases?distro=`   | Release history                |
| GET    | `/api/recommend?id=&n=`   | Similar distro recommendations |
| POST   | `/api/internal/ingest`    | Scraper data ingestion         |
| GET    | `/api/health`             | Health check                   |

## Project Structure

```
distromap/
├── docker-compose.yml          # Multi-container orchestration
├── .env.example                # Environment variable template
├── ARCHITECTURE.md             # This file
├── DEPLOYMENT_GUIDE.md         # Deployment instructions
├── API_DOCS.md                 # API reference
│
├── frontend-vue/               # Vue 3 + Three.js SPA
│   ├── Dockerfile              # Nginx-based production build
│   ├── nginx.conf              # Reverse proxy + SPA fallback
│   ├── src/
│   │   ├── App.vue             # Main application shell
│   │   ├── components/
│   │   │   ├── BrainGraph.vue  # 3D Three.js graph
│   │   │   ├── SearchBar.vue   # Search with filters
│   │   │   ├── SidePanel.vue   # Distro detail panel
│   │   │   └── Legend.vue      # Family color legend
│   │   ├── composables/        # Vue composables (useGraph, useKeyboard)
│   │   └── lib/                # Layout engine, API client, query parser
│   └── package.json
│
├── backend-api/                # Node.js Express API
│   ├── Dockerfile
│   ├── db/
│   │   └── init.sql            # PostgreSQL schema (auto-runs on first start)
│   ├── src/
│   │   ├── index.ts            # Express server entry
│   │   ├── routes.ts           # All API route handlers
│   │   ├── db.ts               # PostgreSQL + Redis connection pools
│   │   └── migrate.ts          # distros.json → PostgreSQL migration
│   └── package.json
│
├── backend-data/               # Python scrapers + AI workers
│   ├── Dockerfile
│   ├── scrapy.cfg
│   ├── requirements.txt
│   ├── scrapers/
│   │   ├── settings.py         # Scrapy configuration
│   │   ├── items.py            # Data schema (DistroItem)
│   │   ├── pipelines.py        # Validation, dedup, database insertion
│   │   └── spiders/
│   │       ├── distrowatch_spider.py
│   │       └── wikipedia_spider.py
│   └── workers/                # AI processing workers
│
├── shared/                     # TypeScript types shared by frontend + API
│   ├── types.ts
│   └── api-handlers.ts
│
├── scripts/                    # Data pipeline scripts
│   ├── build-data.ts           # distros.json → frontend data.json
│   ├── validate-data.ts        # Data integrity checks
│   └── autonomous-crawler.ts   # Legacy TS crawler (still functional)
│
└── data/
    └── distros.json            # Source of truth (JSON, legacy format)
```

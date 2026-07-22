# DistroMap API Documentation

Base URL: `http://localhost:3001` (development) or `https://api.distromap.io` (production)

All endpoints return JSON. No authentication required for public endpoints.

---

## GET /api/health

Health check endpoint.

**Response:**
```json
{ "status": "ok", "distros": 380 }
```

---

## GET /api/search

Full-text search with structured filters.

**Parameters:**

| Param   | Type   | Description |
|---------|--------|-------------|
| `q`     | string | Search query. Supports `key:value` filters. |
| `limit` | number | Max results (default 50, max 200) |

**Filter keys:** `family:`, `init:`, `pkg:`, `status:`, `country:`, `release:`, `license:`

**Example:**
```
GET /api/search?q=family:arch%20rolling&limit=10
GET /api/search?q=immutable&limit=5
GET /api/search?q=status:active%20init:openrc
```

**Response:**
```json
{
  "results": [
    {
      "id": "manjaro",
      "name": "Manjaro",
      "description": "User-friendly Arch derivative...",
      "status": "active",
      "family_name": "Arch",
      "family_id": "arch",
      "country": "Germany",
      "packageManager": "pacman",
      "releaseModel": "rolling"
    }
  ],
  "total": 3,
  "query": { "text": "", "family": "arch", "release": "rolling" }
}
```

---

## GET /api/distro/:slug

Get a single distribution with its family.

**Example:** `GET /api/distro/ubuntu`

**Response:**
```json
{
  "distro": {
    "id": "ubuntu",
    "name": "Ubuntu",
    "description": "Debian derivative from Canonical...",
    "status": "active",
    "founded": 2004,
    "country": "United Kingdom",
    "packageManager": "apt/dpkg",
    "releaseModel": "fixed",
    "website": "https://ubuntu.com"
  },
  "family": {
    "id": "ubuntu",
    "name": "Ubuntu",
    "color": "#e95420"
  }
}
```

---

## GET /api/path

Find shortest path between two distributions (BFS through parent/child edges).

**Parameters:**

| Param  | Type   | Description |
|--------|--------|-------------|
| `from` | string | Source distro ID (required) |
| `to`   | string | Target distro ID (required) |

**Example:** `GET /api/path?from=linuxmint&to=fedora`

**Response:**
```json
{
  "from": "linuxmint",
  "to": "fedora",
  "path": ["linuxmint", "ubuntu", "debian", "linux-kernel", "rhel", "fedora"],
  "hops": 5,
  "found": true
}
```

---

## GET /api/compare

Side-by-side comparison of distributions.

**Parameters:**

| Param | Type   | Description |
|-------|--------|-------------|
| `ids` | string | Comma-separated distro IDs (min 2) |

**Example:** `GET /api/compare?ids=ubuntu,arch,fedora`

**Response:**
```json
{
  "distros": [
    { "id": "ubuntu", "name": "Ubuntu", "status": "active", "founded": 2004, ... },
    { "id": "arch", "name": "Arch Linux", "status": "active", "founded": 2002, ... },
    { "id": "fedora", "name": "Fedora", "status": "active", "founded": 2003, ... }
  ]
}
```

---

## GET /api/stats

Aggregate statistics about the dataset.

**Response:**
```json
{
  "totalDistros": 380,
  "active": 340,
  "discontinued": 40,
  "families": 87,
  "topCountries": [{ "country": "United States", "count": 45 }],
  "topInitSystems": [{ "init": "systemd", "count": 280 }],
  "topPackageManagers": [{ "pkg": "apt/dpkg", "count": 120 }],
  "topLicenses": [{ "license": "Free", "count": 200 }]
}
```

---

## GET /api/families

List all distribution families with their brand colors.

**Response:**
```json
{
  "families": [
    { "id": "debian", "name": "Debian", "color": "#c70036", "colorSecondary": "#ff4d6d", "founded": 1993 },
    { "id": "arch", "name": "Arch", "color": "#1793d1", "colorSecondary": "#41b1e4", "founded": 2002 }
  ]
}
```

---

## GET /api/graph

Full graph data (nodes + edges) for client-side rendering.

**Response:**
```json
{
  "nodes": [
    { "id": "ubuntu", "name": "Ubuntu", "type": "distro", "family_id": "ubuntu", "family_color": "#e95420", ... }
  ],
  "edges": [
    { "source": "ubuntu", "target": "debian", "type": "based_on" }
  ],
  "meta": {
    "totalDistros": 380,
    "active": 340,
    "discontinued": 40,
    "families": 87,
    "generatedAt": "2026-07-22T12:00:00Z"
  }
}
```

---

## GET /api/releases

Release history for distributions.

**Parameters:**

| Param    | Type   | Description |
|----------|--------|-------------|
| `distro` | string | Filter by distro ID (optional) |
| `limit`  | number | Max results (default 20, max 100) |

---

## GET /api/recommend

AI-powered similar distro recommendations.

**Parameters:**

| Param   | Type   | Description |
|---------|--------|-------------|
| `id`    | string | Distro ID to find similar to (required) |
| `limit` | number | Max results (default 5, max 20) |

**Response:**
```json
{
  "recommendations": [
    { "id": "popos", "name": "Pop!_OS", "description": "...", "similarity": 0.92 }
  ],
  "method": "vector"
}
```

`method` is `"vector"` when using pgvector embeddings, `"family"` when falling back to family-based similarity.

---

## POST /api/internal/ingest

Internal endpoint for scraper data ingestion. Not publicly exposed.

**Request body:**
```json
{
  "id": "new-distro",
  "name": "New Distro",
  "description": "A new Linux distribution",
  "status": "active",
  "parent": "debian",
  "familyId": "debian",
  "packageManager": "apt/dpkg",
  "website": "https://new-distro.org",
  "confidence": 0.85,
  "metadata": { "source": "wikipedia" }
}
```

**Response:**
```json
{ "ok": true, "id": "new-distro" }
```

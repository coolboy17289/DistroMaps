# DistroMap

A visual knowledge graph of the Linux ecosystem — 193 Linux distributions across
54 families (163 active, 30 discontinued), each linking back through its
parents to the Linux kernel. Click any node for metadata, search with
`family:debian` / `init:openrc` style filters, walk the tree with arrow keys,
and contribute new distros via a Wikipedia-validated form.

![DistroMap](frontend/public/favicon.svg)

---

## Run it

**One install, one dev server, one process.**

```bash
cd /home/lihan/DistroMap/DistroMaps
npm install
npm run dev          # → http://localhost:5173
```

`npm run dev` runs `npm run build:data` (compiles the dataset) and then starts
Vite with the dev-API middleware mounted. SPA + API share one origin — no CORS
dance.

### Other scripts

```bash
npm run build        # builds SPA into frontend/dist, ready for Vercel deploy
npm run preview      # serves the production bundle locally
npm run typecheck    # tsc --noEmit (strict, no build artifact)
npm run build:data   # rebuild frontend/public/data.json from data/distros.json
```

If you only want to regenerate the dataset without starting the server:

```bash
npm run build:data
# ✓ 193 distros (163 active, 30 discontinued) across 54 families → frontend/public/data.json
```

---

## What's in the box

```
distromaps/
├── package.json              # one set of deps, shared by root + frontend via Vite
├── vite.config.ts            # Vite config + dev-API middleware plugin
├── tsconfig.json             # strict TS, single project
├── vercel.json               # Vercel: frontend/ is the project root
├── README.md
│
├── shared/                   # code shared by SPA + serverless API
│   ├── types.ts              # Distro, Family, GraphData, PathResult, StatsResponse …
│   └── api-handlers.ts       # route table (search, distro, path, stats, og, suggest)
│
├── scripts/
│   └── build-data.ts         # reads data/distros.json → writes frontend/public/data.json
│
├── data/
│   └── distros.json          # source of truth: 54 families + 193 distros
│
└── frontend/                 # Vercel project root
    ├── index.html
    ├── vite.config.ts        # alias resolution + API middleware mount
    ├── server/dev-api.ts     # Express-style middleware (dev-mode API)
    ├── api/[...all].ts       # Vercel serverless catch-all (prod-mode API)
    ├── public/
    │   ├── favicon.svg
    │   └── data.json         # built dataset (committed for `npm run dev` to work out of the box)
    └── src/
        ├── main.tsx          # React entry
        ├── App.tsx           # orchestrator: state, layout, keyboard, side panel
        ├── types.ts          # re-exports @shared/types
        ├── lib/
        │   ├── api.ts        # fetchers for /api/* + /data.json
        │   ├── query.ts      # plain-text + key:value search parser, client matcher
        │   └── graph.ts      # d3-force simulation + family-clustered layout
        ├── hooks.ts          # useGraphData, useKeyboardShortcuts
        ├── components/
        │   ├── Graph.tsx        # Canvas force-directed graph (d3-force + d3-quadtree)
        │   ├── SidePanel.tsx    # slide-in metadata + auto-generated OG card
        │   ├── SearchBar.tsx    # plain text + key:value filters
        │   ├── Legend.tsx       # family filter pills
        │   ├── Chrome.tsx       # top brand, keyboard hints
        │   └── AddDistroForm.tsx # Wikipedia-validated suggestion modal
        └── styles/global.css  # hand-crafted dark theme, no CSS framework
```

---

## Architecture

- **One TypeScript codebase**, two roles: `frontend/src/**` is the SPA; `shared/**` + `frontend/api/**` are serverless.
- **Vite is the single dev process** — `npm run dev` runs `npm run build:data` then `vite --config vite.config.ts`. The dev API is mounted via `configureServer()` middleware so SPA + API share one origin in dev.
- **Vercel** deploys from `frontend/` (`rootDirectory`) with `frontend/api/[...all].ts` as the catch-all serverless function. Build output is the static SPA bundle; the API runs as a Node 20 serverless function.
- **Dataset is built at build time** by `scripts/build-data.ts` reading `data/distros.json` and writing `frontend/public/data.json`. The SPA reads that file directly on boot (no API call roundtrip for the bulk data).

The build pipeline:

```
data/distros.json
       │  scripts/build-data.ts
       ▼
frontend/public/data.json   ← SPA reads this on boot (edge-cacheable, 1-day s-maxage)
       │  Vite + shared/api-handlers.ts
       ▼
   SPA + /api/* (12 routes — see table below)
```

---

## Adding a distro

The shortest path is to edit `data/distros.json` directly. Each distro entry:

```jsonc
{
  "id": "alpine",
  "familyId": "alpine",
  "name": "Alpine Linux",
  "status": "active",
  "founded": 2005,
  "country": "International",
  "packageManager": "apk",
  "initSystem": "OpenRC",
  "releaseModel": "rolling",
  "license": "Free",
  "website": "https://alpinelinux.org",
  "wikipedia": "https://en.wikipedia.org/wiki/Alpine_Linux",
  "description": "Security-oriented, lightweight distribution based on musl libc and BusyBox."
}
```

`parent` is optional. If absent, the family is auto-linked to `linux-kernel`.
`status` is `"active"` or `"discontinued"`. `additionalParents` lets a distro
declare multiple ancestry paths (rare — Linux Mint is the canonical example).
Then re-run `npm run build:data` (or `npm run dev` which does it on every start).

Through the UI: the **+ Add distro** button (top-right) opens a form that
validates the topic live against `https://en.wikipedia.org/api/rest_v1/` and
posts to `/api/suggest`. Suggestions land in an in-process queue (good enough
for demo — wire to durable storage before going live).

---

## API endpoints

All endpoints share the same origin as the SPA (no CORS), and all share the
same handler table (`shared/api-handlers.ts`) whether invoked by the Vite dev
middleware (`frontend/server/dev-api.ts`) or by the Vercel serverless catch-all
(`frontend/api/[...all].ts`).

| Method | Path                              | What it does                                                                       |
|--------|-----------------------------------|------------------------------------------------------------------------------------|
| GET    | `/api/search?q=...&limit=N`       | Free text + `family:` / `init:` / `pkg:` / `country:` / `status:` / `release:` / `license:` filters |
| GET    | `/api/distro?slug=…`              | One distro + its family                                                           |
| GET    | `/api/path?from=&to=`             | BFS shortest path through ancestry / descendants (bidirectional)                   |
| GET    | `/api/compare?ids=a,b,…`          | Side-by-side comparison dict                                                       |
| GET    | `/api/stats`                      | Counts + top countries / inits / package managers / licenses                        |
| GET    | `/api/families`                   | All families with their colors                                                     |
| GET    | `/api/data`                       | Full `GraphData` dump (same shape as `/data.json`)                                 |
| GET    | `/api/og/:slug`                   | Auto-generated SVG OpenGraph card for any distro                                   |
| POST   | `/api/suggest`                    | Queue a Wikipedia-validated distro suggestion `{topic, rationale?, submitter?}`    |
| GET    | `/api/health`                     | `{ status: "ok", distros: N }` for smoke tests                                     |

> 📐 The table collapses some routes for clarity: `/api/distro` is served via both `?slug=` and `/:slug` shapes, same for `/api/path`. That's 12 regex routes powering the 10 surface endpoints above.

---

## Keyboard shortcuts

| Keys            | Action                                                        |
|-----------------|---------------------------------------------------------------|
| `/` or `⌘K`     | Focus the search bar                                          |
| `F`             | Filter the canvas to the selected node's family               |
| `↑` / `↓`       | Walk to parent / first descendant                            |
| `Esc`           | Cascade: close panel → clear search → clear filter → close modal |
| `?`             | Toggle the keyboard hints overlay                             |

---

## Tech stack

- **React 18** + **TypeScript** + **Vite 5**
- **`d3-force`** for the physics; **`d3-quadtree`** for O(log n) hover hit-testing
- **Custom Canvas** rendering for all 200+ nodes + edges at 60 fps
- **One universal Node 20 serverless function** (`api/[...all].ts`) handling every `/api/*` route
- **In-process dataset build** — `npm run build:data` emits `frontend/public/data.json` (committed; `Cache-Control: public, max-age=300, s-maxage=86400`)
- **Zero CSS framework** — hand-crafted design tokens for a cohesive dark theme

---

## Deploying to Vercel

```bash
# In Vercel: New Project → import → framework = Other
# Build command: npm run build
# Output directory: frontend/dist
# Install command: npm install
```

`vercel.json` is configured with:
- `buildCommand: "npm run build"` — runs from the project root where `package.json` and `vite.config.ts` actually live
- `outputDirectory: "frontend/dist"` — matches where Vite writes, given `root: 'frontend'` inside `vite.config.ts`
- No rewrites — `frontend/api/[...all].ts` is the catch-all serverless dispatcher
- One-year immutable cache for hashed `/assets/`
- One-day edge cache for `/data.json`

---

## License

MIT — see `LICENSE`.

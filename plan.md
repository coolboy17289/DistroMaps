# DistroMap — Project Plan

## Overview

DistroMap is a visual knowledge graph (mind map) of the Linux ecosystem — 193 Linux distributions across 54 families, all tracing back to the Linux kernel. Built with React + TypeScript + Vite, deployed on Vercel.

---

## Current State

### ✅ What Works

**Frontend (SPA):**
- Mind map visualization rendered on Canvas with ~200 color-coded nodes
- All 193 distro labels visible (depth-based sizing)
- Smooth camera pan animation when clicking a node
- Auto-fit viewport on first load showing the entire graph
- Search bar with text + key:value filters (`family:`, `init:`, `pkg:`, etc.)
- Side panel showing distro metadata, connections, OG social card
- Legend with family filter pills + show/hide discontinued toggle
- Legend hover highlighting (hover pill → highlight family on graph)
- Keyboard shortcuts (/, ⌘K, F, ↑/↓, Esc, ?)
- "Add distro" modal with Wikipedia validation
- Minimalist dark theme CSS

**API Endpoints (all verified working):**
| Endpoint | Status |
|---|---|
| `GET /api/search?q=...` | ✅ Returns filtered results |
| `GET /api/distro?slug=` | ✅ Returns distro + family |
| `GET /api/distro/:slug` | ✅ Path param variant |
| `GET /api/path?from=&to=` | ✅ BFS shortest path |
| `GET /api/path/:from/:to` | ✅ Path param variant |
| `GET /api/compare?ids=a,b` | ✅ Side-by-side comparison |
| `GET /api/stats` | ✅ Aggregate statistics |
| `GET /api/families` | ✅ All families with colors |
| `GET /api/data` | ✅ Full graph data dump |
| `GET /api/og/:slug` | ✅ SVG OpenGraph card |
| `POST /api/suggest` | ✅ Wikipedia-validated suggestion |
| `GET /api/health` | ✅ Smoke test |

**Deployment:**
- Local dev: `npm run dev` → Vite on :5173 with API middleware
- Vercel: `npm run build` → static SPA + serverless function
- SPA rewrites configured (static assets excluded)
- data.json copied to api/ dir for reliable serverless access

---

## Architecture

```
data/distros.json              # Source of truth (54 families, 193 distros)
   ↓ scripts/build-data.ts     # Build-time transformation
frontend/public/data.json      # SPA fetches this on boot (or API serves it)
   ↓
frontend/src/                  # React SPA
   ├── App.tsx                 # State orchestrator
   ├── components/
   │   ├── Graph.tsx           # Canvas mind map renderer
   │   ├── SidePanel.tsx       # Distro detail panel
   │   ├── SearchBar.tsx       # Search + filter UI
   │   ├── Legend.tsx          # Family pills + toggles
   │   ├── Chrome.tsx          # Brand header + keyboard hints
   │   └── AddDistroForm.tsx   # Wikipedia-validated suggestion form
   ├── lib/
   │   ├── graph.ts            # Mind map layout engine
   │   ├── api.ts              # API fetchers
   │   ├── query.ts            # Search query parser
   │   └── favicon.ts          # Favicon image loader for canvas
   └── styles/global.css       # Minimalist dark theme

shared/                        # Shared between SPA and API
   ├── types.ts                # Distro, Family, GraphData, etc.
   └── api-handlers.ts         # All 12 API route handlers

frontend/api/[...all].ts       # Vercel serverless catch-all
frontend/server/dev-api.ts     # Vite dev middleware for API
```

**Data flow:**
1. `data/distros.json` → `scripts/build-data.ts` → `frontend/public/data.json`
2. SPA fetches `/data.json` on boot (static file, edge-cached)
3. API routes re-use same dataset via `shared/api-handlers.ts`
4. Both dev (Vite middleware) and prod (serverless) use the same route handlers

---

## Remaining Work / Improvements

### High Priority

- [ ] **Touch/mobile support** — Add touch event handlers for pan/zoom/tap on canvas (currently mouse-only)
- [ ] **Responsive layout** — Bottom legend overflows on narrow screens; side panel should collapse to full-width on mobile
- [ ] **Add frontend/api/data.json to .gitignore** — Build artifact that shouldn't be committed
- [ ] **Clean up dead code in dev API and serverless** — Both `mountApiRoutes()` and `[...all].ts` parse URL params/query before calling `r.handle()`, but the route function now re-parses internally. Those callers' parsing logic is redundant.

### Medium Priority

- [ ] **Error boundary** — Wrap the app in a React error boundary so component crashes don't blank the page
- [ ] **Graph interactivity polish** — Clicking empty space should deselect; right-click context menu?  
- [ ] **Search result highlighting on graph** — When hovering search results, highlight those nodes on the mind map
- [ ] **Loading skeleton** — Replace the simple loading orb with a more polished loading state
- [ ] **Canvas DPI handling** — Currently caps at `min(devicePixelRatio, 2)`; some high-DPI screens could benefit from sharper rendering

### Low Priority / Nice-to-have

- [ ] **Undo/redo for graph navigation** — Browser history API for back/forward through selected nodes
- [ ] **Shareable URLs** — `?distro=ubuntu` query param to link directly to a distro
- [ ] **Theme toggle** — Light/dark mode switch
- [ ] **More graph layouts** — Circular tree, hierarchical, or zoomable sunburst views
- [ ] **Offline support** — Service worker to cache data.json
- [ ] **Performance optimization** — Virtualize labels at low zoom levels (hide labels for tiny nodes)
- [ ] **Expand data** — Add more distros to reach the "380+" figure mentioned in the description

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Build data + start Vite dev server |
| `npm run build` | Build data + build SPA for production |
| `npm run build:data` | Regenerate data.json from source |
| `npm run preview` | Serve production build locally |
| `npm run typecheck` | Run TypeScript type checking |

## Deployment

**Vercel:** Import repo → framework = Other → build = `npm run build` → output = `frontend/dist` → install = `npm install`

The `vercel.json` handles:
- Node 20 runtime for API functions
- SPA rewrites (all non-API/asset paths → index.html)
- Cache headers for assets (1 year immutable) and data.json (1 day edge)

---

## Key Files Summary

| File | Purpose | ~Lines |
|---|---|---|
| `shared/types.ts` | All TypeScript interfaces | 120 |
| `shared/api-handlers.ts` | Route handlers, dataset loading, utilities | 370 |
| `scripts/build-data.ts` | Dataset build pipeline | 120 |
| `frontend/src/App.tsx` | Main app orchestrator | 210 |
| `frontend/src/components/Graph.tsx` | Mind map canvas renderer | 330 |
| `frontend/src/lib/graph.ts` | Mind map layout algorithm | 130 |
| `frontend/src/styles/global.css` | All styles (~700 lines) | 520 |
| `frontend/api/[...all].ts` | Vercel serverless entry | 40 |
| `frontend/server/dev-api.ts` | Dev API middleware | 55 |
| `data/distros.json` | Source dataset | ~2800 |

## Next Steps (Vue 3 Implementation)

- Complete the LinuxGraph.vue component to fully render the interactive 3D graph with node selection and details integration.
- Implement real-time synchronization between the graph selection and the side panel details.
- Add keyboard shortcuts for the Vue version (similar to React version: / for search, ESC to clear selection, etc.).
- Enhance the auto-researcher to fetch related distributions and show a knowledge graph of connections.
- Implement the suggestion form to actually POST to the API and show success/error states.
- Add loading states and error boundaries for API calls.
- Optimize performance: virtualize large lists, debounce expensive operations, and use requestIdleCallback for non-urgent work.
- Write unit tests for API service functions and Vue components using Vitest.
- Prepare for production: add meta tags, OG tags, and configure Vue build for Vercel static deployment.
- Conduct usability testing and iterate on UI/UX based on feedback.
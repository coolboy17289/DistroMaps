export const meta = {
  name: 'execute-distro-map-plan',
  description: 'Execute plan.md for DistroMap with grouped parallel subagents',
  phases: [
    { title: 'Scout', detail: 'Map codebase structure and current state' },
    { title: 'Implement', detail: 'Parallel agents implement grouped plan items in isolated worktrees' },
    { title: 'Report', detail: 'Synthesize diff summaries and next steps' },
  ],
}

const GROUPS = [
  {
    id: 'react-graph',
    files: ['frontend/src/components/Graph.tsx', 'frontend/src/App.tsx', 'frontend/src/components/SearchBar.tsx', 'frontend/src/styles/global.css'],
    prompt:
      'Implement these related React canvas/graph plan items together in the worktree:\n' +
      '1. Touch/mobile support: add touch pan, pinch zoom, and tap-to-select to frontend/src/components/Graph.tsx. Preserve mouse/wheel behavior. Add touch-action: none CSS.\n' +
      '2. Canvas DPI: allow devicePixelRatio up to 3 (currently capped at 2) in Graph.tsx; keep line/label widths visually consistent.\n' +
      '3. Deselect on empty click: clicking canvas background (not a node) should clear selection via onSelect(null).\n' +
      '4. Search-result graph highlight: when hovering or keyboard-navigating search results, highlight those nodes on the graph with a subtle ring/glow.\n' +
      'Update frontend/src/App.tsx and frontend/src/components/SearchBar.tsx state/props as needed, and add minimal CSS to frontend/src/styles/global.css. ' +
      'After editing, run "npm run build:data && npm run typecheck" and fix any TypeScript errors. Return a concise summary of changes and whether typecheck passed.',
  },
  {
    id: 'react-ui',
    files: ['frontend/src/App.tsx', 'frontend/src/components/SidePanel.tsx', 'frontend/src/components/Legend.tsx', 'frontend/src/components/ErrorBoundary.tsx', 'frontend/src/components/LoadingSkeleton.tsx', 'frontend/src/styles/global.css'],
    prompt:
      'Implement these related React UI plan items together in the worktree:\n' +
      '1. Responsive layout: make the bottom legend not overflow on narrow screens and make the side panel a full-width overlay on mobile (<=768px).\n' +
      '2. Loading skeleton: replace the simple loading orb in App.tsx with a polished LoadingSkeleton.tsx component and matching CSS.\n' +
      '3. Error boundary: create frontend/src/components/ErrorBoundary.tsx class component with dark-themed fallback UI and wrap the app in App.tsx.\n' +
      'Update App.tsx, SidePanel.tsx, Legend.tsx, and frontend/src/styles/global.css as needed. ' +
      'After editing, run "npm run build:data && npm run typecheck" and fix any TypeScript errors. Return a concise summary of changes and whether typecheck passed.',
  },
  {
    id: 'backend-cleanup',
    files: ['.gitignore', 'frontend/server/dev-api.ts', 'frontend/api/[...all].ts'],
    prompt:
      'Implement these backend cleanup plan items together in the worktree:\n' +
      '1. Add frontend/api/data.json to .gitignore without removing existing entries.\n' +
      '2. Clean up redundant URL parameter/query parsing in frontend/server/dev-api.ts and frontend/api/[...all].ts. The route handlers in shared/api-handlers.ts re-parse internally, so remove duplicate parsing in mountApiRoutes() and the serverless catch-all while preserving exact behavior.\n' +
      'After editing, run "npm run build:data && npm run typecheck" and fix any TypeScript errors. Return a concise summary of changes and whether typecheck passed.',
  },
  {
    id: 'vue-frontend',
    files: ['frontend-vue/src/App.vue', 'frontend-vue/src/components/LinuxGraph.vue', 'frontend-vue/src/components/SearchBar.vue', 'frontend-vue/src/components/AddDistroForm.vue', 'frontend-vue/src/components/LoadingSkeleton.vue', 'frontend-vue/src/lib/api.ts'],
    prompt:
      'Implement these Vue 3 plan items together in the worktree:\n' +
      '1. Complete LinuxGraph.vue so it fully renders the interactive graph with node selection and details integration; wire selection to App.vue side panel.\n' +
      '2. Add keyboard shortcuts matching the React version: / for search, Esc to clear selection, F for fit, arrows for search navigation, ? for help.\n' +
      '3. Improve the suggestion form to POST to /api/suggest and show clear success/error states (use existing apiService or create frontend-vue/src/lib/api.ts).\n' +
      '4. Add loading states and error handling for API calls; create LoadingSkeleton.vue and integrate it in App.vue.\n' +
      'After editing, run "cd frontend-vue && npm install && npm run typecheck || npm run build" (whichever is available) and fix any TypeScript errors. Return a concise summary of changes and whether checks passed.',
  },
]

phase('Scout')
const codebase = await parallel([
  () => agent('Read /home/lihan/DistroMap/DistroMaps/plan.md and list every actionable work item with its priority and the files it touches. Also note which items depend on each other. Return a plain text summary.', { label: 'plan-audit' }),
  () => agent('Scout the React frontend structure. Read frontend/src/App.tsx, frontend/src/components/Graph.tsx, frontend/src/components/SidePanel.tsx, frontend/src/components/SearchBar.tsx, frontend/src/components/Legend.tsx, frontend/src/styles/global.css, frontend/src/lib/graph.ts. Summarize state flow, canvas event handling, CSS layout classes, and any existing mobile/touch/responsive code.', { label: 'frontend-scout' }),
  () => agent('Scout the API layer. Read shared/api-handlers.ts, frontend/server/dev-api.ts, frontend/api/[...all].ts. Identify redundant URL/query parsing and the exact shape of the request objects passed to route handlers.', { label: 'api-scout' }),
  () => agent('Scout the Vue frontend. Read frontend-vue/src/App.vue, frontend-vue/src/components/LinuxGraph.vue, frontend-vue/src/components/SearchBar.vue, frontend-vue/src/services/apiService.ts, and list all Vue components. Note which plan items (keyboard shortcuts, suggestion form, loading/error) are missing or incomplete.', { label: 'vue-scout' }),
])

phase('Implement')
const implementations = await parallel(
  GROUPS.map(group => () =>
    agent(
      'Implement this grouped plan item in the DistroMap repo at /home/lihan/DistroMap/DistroMaps:\n' +
      'Group: ' + group.id + '\n' +
      'Affected files: ' + group.files.join(', ') + '\n' +
      'Requirements:\n' + group.prompt + '\n\n' +
      'Read all affected files, make minimal, correct changes, preserve the existing code style, and ensure TypeScript compiles. ' +
      'If a file does not exist, create it. Return a concise summary of the changes you made, files touched, and verification results.',
      {
        label: 'impl:' + group.id,
        isolation: 'worktree',
      }
    )
  )
)

phase('Report')
const report = await agent(
  'Synthesize the following implementation summaries into a final report for the user. ' +
  'For each group, list the files changed, whether typecheck/build passed, and any remaining issues or next steps. ' +
  'Keep it concise and actionable.\n\n' +
  'Implementation summaries:\n' + JSON.stringify(implementations, null, 2),
  { label: 'synthesize-report' }
)

return { codebase, implementations, report }

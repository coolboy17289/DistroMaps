export const meta = {
  name: 'execute-distro-map-plan',
  description: 'Execute plan.md for DistroMap by fanning out subagents per work item',
  phases: [
    { title: 'Scout', detail: 'Map codebase structure and current state' },
    { title: 'Implement', detail: 'Parallel agents implement each plan item in isolated worktrees' },
    { title: 'Verify', detail: 'Typecheck and build every worktree' },
    { title: 'Report', detail: 'Synthesize diff summaries and next steps' },
  ],
}

const WORK_ITEMS = [
  {
    id: 'touch-mobile',
    files: ['frontend/src/components/Graph.tsx', 'frontend/src/styles/global.css'],
    prompt: 'Add touch/mobile support to the canvas mind map in frontend/src/components/Graph.tsx and any needed CSS in frontend/src/styles/global.css. Implement single-finger pan, pinch zoom (two-finger), and tap-to-select for nodes. Preserve existing mouse behavior. Add CSS touch-action: none on the canvas container. Update event handlers cleanly and type-correctly for React/TypeScript.',
  },
  {
    id: 'responsive-layout',
    files: ['frontend/src/App.tsx', 'frontend/src/components/Graph.tsx', 'frontend/src/components/SidePanel.tsx', 'frontend/src/components/Legend.tsx', 'frontend/src/styles/global.css'],
    prompt: 'Make the DistroMap React SPA responsive. Update frontend/src/styles/global.css so the bottom legend does not overflow on narrow screens and the side panel collapses to full-width overlay on mobile (<=768px). Update App.tsx, Graph.tsx, SidePanel.tsx, Legend.tsx as needed to pass classNames or state so the layout behaves correctly. Keep the dark minimalist theme intact.',
  },
  {
    id: 'gitignore-data-artifact',
    files: ['.gitignore'],
    prompt: 'Add the build artifact frontend/api/data.json to .gitignore. Do not remove existing entries.',
  },
  {
    id: 'api-dead-code-cleanup',
    files: ['frontend/server/dev-api.ts', 'frontend/api/[...all].ts'],
    prompt: 'Clean up redundant URL parameter/query parsing in frontend/server/dev-api.ts and frontend/api/[...all].ts. The route handlers in shared/api-handlers.ts already re-parse internally, so remove duplicate parsing in mountApiRoutes() and the serverless catch-all while preserving exact behavior.',
  },
  {
    id: 'error-boundary',
    files: ['frontend/src/App.tsx', 'frontend/src/components/ErrorBoundary.tsx'],
    prompt: 'Wrap the DistroMap React app in an error boundary. Create frontend/src/components/ErrorBoundary.tsx with a class component that catches errors and renders a friendly fallback UI matching the dark theme. Update frontend/src/App.tsx to render Graph/SearchBar/SidePanel inside the boundary.',
  },
  {
    id: 'deselect-on-empty-click',
    files: ['frontend/src/components/Graph.tsx', 'frontend/src/App.tsx'],
    prompt: 'Polish graph interactivity: clicking empty canvas space should deselect the currently selected node. Update frontend/src/components/Graph.tsx canvas click handling and frontend/src/App.tsx state if needed so that a click on the background (not a node) clears selection.',
  },
  {
    id: 'search-result-highlight',
    files: ['frontend/src/components/SearchBar.tsx', 'frontend/src/components/Graph.tsx', 'frontend/src/App.tsx'],
    prompt: 'Highlight search-result nodes on the graph. Update frontend/src/components/SearchBar.tsx to communicate hovered/keyboard-navigated result slugs to the app, update frontend/src/App.tsx to track highlightedSlugs, and update frontend/src/components/Graph.tsx to draw a subtle ring or glow around matching nodes. Do not change the base node colors.',
  },
  {
    id: 'loading-skeleton',
    files: ['frontend/src/App.tsx', 'frontend/src/components/LoadingSkeleton.tsx', 'frontend/src/styles/global.css'],
    prompt: 'Replace the simple loading orb in frontend/src/App.tsx with a polished loading skeleton. Create frontend/src/components/LoadingSkeleton.tsx and add matching CSS to frontend/src/styles/global.css. The skeleton should show the brand header, a placeholder canvas area, and a placeholder side panel in the dark theme.',
  },
  {
    id: 'canvas-dpi',
    files: ['frontend/src/components/Graph.tsx'],
    prompt: 'Improve canvas DPI handling in frontend/src/components/Graph.tsx. Currently it caps at min(devicePixelRatio, 2). Allow up to 3 when devicePixelRatio is higher, and ensure label/line widths remain visually consistent after the change.',
  },
]

const VUE_ITEMS = [
  {
    id: 'vue-complete-graph',
    files: ['frontend-vue/src/components/LinuxGraph.vue', 'frontend-vue/src/App.vue'],
    prompt: 'Complete the LinuxGraph.vue component in the frontend-vue directory so it fully renders the interactive 3D graph with node selection and details integration. Wire selection state to the side panel in App.vue. Keep existing Vue 3 / TypeScript patterns.',
  },
  {
    id: 'vue-keyboard-shortcuts',
    files: ['frontend-vue/src/App.vue', 'frontend-vue/src/components/SearchBar.vue'],
    prompt: 'Add keyboard shortcuts to the Vue frontend matching the React version: / for search, ESC to clear selection, F for fit, arrows for search navigation, ? for help. Implement in App.vue and SearchBar.vue as appropriate.',
  },
  {
    id: 'vue-suggest-form',
    files: ['frontend-vue/src/components/AddDistroForm.vue', 'frontend-vue/src/lib/api.ts'],
    prompt: 'Implement the Vue suggestion form so it POSTs to the API and shows success/error states. Use the existing API utilities or create frontend-vue/src/lib/api.ts with the needed fetch helpers.',
  },
  {
    id: 'vue-loading-error',
    files: ['frontend-vue/src/App.vue', 'frontend-vue/src/components/LoadingSkeleton.vue'],
    prompt: 'Add loading states and error boundaries for API calls in the Vue frontend. Create a LoadingSkeleton.vue and integrate it in App.vue so data fetching is clearly communicated to the user.',
  },
]

phase('Scout')
const codebase = await parallel([
  () => agent('Read /home/lihan/DistroMap/DistroMaps/plan.md and list every actionable work item with its priority and the files it touches. Also note which items depend on each other. Return a plain text summary.', { label: 'plan-audit' }),
  () => agent('Scout the React frontend structure. Read frontend/src/App.tsx, frontend/src/components/Graph.tsx, frontend/src/components/SidePanel.tsx, frontend/src/components/SearchBar.tsx, frontend/src/components/Legend.tsx, frontend/src/styles/global.css, frontend/src/lib/graph.ts. Summarize state flow, canvas event handling, CSS layout classes, and any existing mobile/touch/responsive code.', { label: 'frontend-scout' }),
  () => agent('Scout the API layer. Read shared/api-handlers.ts, frontend/server/dev-api.ts, frontend/api/[...all].ts. Identify redundant URL/query parsing and the exact shape of the request objects passed to route handlers.', { label: 'api-scout' }),
  () => agent('Scout the Vue frontend. Read frontend-vue/src/App.vue, frontend-vue/src/components/LinuxGraph.vue, and list all Vue components. Note which plan items (keyboard shortcuts, suggestion form, loading/error) are missing or incomplete.', { label: 'vue-scout' }),
])

const allItems = WORK_ITEMS.concat(VUE_ITEMS)

phase('Implement')
const implementations = await pipeline(
  allItems,
  item => agent(
    'Implement this plan item in the DistroMap repo at /home/lihan/DistroMap/DistroMaps:\n' +
    'ID: ' + item.id + '\n' +
    'Affected files: ' + item.files.join(', ') + '\n' +
    'Requirement: ' + item.prompt + '\n\n' +
    'Read all affected files, make minimal, correct changes, preserve the existing code style, and ensure TypeScript compiles. ' +
    'If a file does not exist, create it. Return a concise summary of the changes you made and any files touched.',
    {
      label: 'impl:' + item.id,
      isolation: 'worktree',
    }
  )
)

phase('Verify')
const verified = await pipeline(
  implementations.filter(Boolean),
  summary => agent(
    'In the worktree for item ' + (summary && summary.id ? summary.id : 'unknown') + ', run the project commands to verify the changes: ' +
    'npm run build:data && npm run typecheck. If typecheck fails, read the errors and fix the most relevant file. ' +
    'Return whether the build/typecheck succeeded and any remaining errors.',
    { label: 'verify:' + (summary && summary.id ? summary.id : 'unknown') }
  )
)

phase('Report')
const report = await agent(
  'Synthesize the following implementation summaries and verification results into a final report for the user. ' +
  'List each plan item, the files changed, whether it verified, and any remaining issues or next steps. ' +
  'Keep it concise and actionable.\n\n' +
  'Implementation summaries:\n' + JSON.stringify(implementations, null, 2) + '\n\n' +
  'Verification results:\n' + JSON.stringify(verified, null, 2),
  { label: 'synthesize-report' }
)

return { codebase, implementations, verified, report }

export const meta = {
  name: "rewrite-distromap",
  description: "Plan and start rewriting DistroMap with Vue 3, Three.js, etc.",
  phases: [
    { title: 'Explore' },
    { title: 'Plan' },
    { title: 'Implement MVP' }
  ]
};

// Phase 1: Explore
phase('Explore');
// Explore the existing codebase structure
const fileList = await agent('List all files and directories in the project, excluding node_modules and .git', {label: 'File List', phase: 'Explore'});
const packageInfo = await agent('Read package.json to understand current dependencies', {label: 'Package Info', phase: 'Explore'});
const srcStructure = await agent('List the frontend/src directory structure', {label: 'Source Structure', phase: 'Explore'});
const readme = await agent('Read README.md to understand the project', {label: 'Readme', phase: 'Explore'});

// Wait for all
const [files, pkg, src, read] = await Promise.all([fileList, packageInfo, srcStructure, readme]);

log('Existing file list: ' + files);
log('Package info: ' + pkg);
log('Source structure: ' + src);
log('Readme excerpt: ' + read.substring(0, 500));

// Phase 2: Plan
phase('Plan');
// Based on the exploration and the user's specification, create a plan for rewriting
var promptText = "Based on the existing codebase and the user's specification for an advanced DistroMap (Vue 3, Three.js, etc.), create a detailed plan for rewriting the application. The plan should include:\n1. Setting up a new Vue 3 project with Vite, Tailwind CSS.\n2. Setting up the backend with Rust and Axum (or decide to keep the existing API if it's sufficient? The user specified Rust with Axum, Neo4j, Meilisearch, GraphQL).\n3. Creating the data model for Linux distributions.\n4. Building the interactive graph with Three.js and Sigma.js/Graphology.\n5. Implementing the UI layout as described.\n6. Adding advanced features: timeline, comparison, search, AI assistant, 3D mode.\n7. Performance considerations.\n8. Development requirements: modular architecture, TypeScript, testing, Docker.\n\nWe have an existing codebase that we can use for reference (the data models, maybe the API handlers). We should plan to migrate the data and reuse what we can.\n\nOutput the plan as a numbered list of steps.";
const plan = await agent(promptText, {label: 'Create Plan', phase: 'Plan'});

// Wait for the plan
const planText = await plan;

// Phase 3: Implement MVP
phase('Implement MVP');
// Start implementing the MVP: set up the Vue 3 project
// We'll create a new directory for the Vue project? Or we can overwrite the existing frontend?
// Since we are in ultracode, we can create a new structure in a separate directory to avoid breaking the existing one.
// Let's create a directory 'frontend-vue' and set up the project there.
const setupVue = await agent('Create a new Vue 3 project with Vite in a directory called frontend-vue, including Tailwind CSS installation', {label: 'Setup Vue Project', phase: 'Implement MVP'});
// We'll also create a basic structure for the components.
const createDirs = await agent('Create directories for components, views, stores, etc. in frontend-vue/src', {label: 'Create Directories', phase: 'Implement MVP'});
// Create a basic App.vue and main.ts
const createApp = await agent('Create a basic App.vue and main.ts in frontend-vue/src with a placeholder for the graph', {label: 'Create App Files', phase: 'Implement MVP'});
// Install Three.js and related packages
const installDeps = await agent('Install Three.js, Sigma.js, Graphology, GSAP, and other required dependencies', {label: 'Install Deps', phase: 'Implement MVP'});

// Wait for the implementation steps
const [vueSetup, dirs, appFiles, deps] = await Promise.all([setupVue, createDirs, createApp, installDeps]);

log('Vue setup: ' + vueSetup);
log('Directories created: ' + dirs);
log('App files created: ' + appFiles);
log('Dependencies installed: ' + deps);

// Return the plan and what we did
return {
  plan: planText,
  vueSetup: vueSetup,
  dirs: dirs,
  appFiles: appFiles,
  deps: deps
};
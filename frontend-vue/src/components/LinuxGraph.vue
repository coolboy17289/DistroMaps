<template>
  <div class="relative w-full h-[80vh] bg-gray-900 overflow-hidden">
    <div ref="graphContainer" class="absolute inset-0"></div>

    <!-- Loading indicator -->
    <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
      <div class="text-center text-white">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
        <p class="mt-2">Loading Linux ecosystem...</p>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-red-500/50 backdrop-blur-sm z-50 p-4 text-center text-white">
      <p>{{ error }}</p>
      <button @click="retryLoad" class="mt-4 bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
        Retry
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import Graphology from 'graphology';
import { Sigma } from 'sigma';
import apiService from '../services/apiService';

// References
const graphContainer = ref(null);
const isLoading = ref(true);
const error = ref(null);

// Three.js objects
let scene, camera, renderer, controls;
let sigmaInstance;
let graph;

// Initialize the 3D scene and graph visualization
const init = async () => {
  try {
    isLoading.value = true;
    error.value = null;

    // Fetch data from API
    const data = await apiService.fetchData();

    // Initialize Three.js scene
    initThreeJS();

    // Create and populate the graph
    createGraphFromData(data);

    // Initialize Sigma renderer
    initSigmaRenderer();

    // Start animation loop
    animate();

    isLoading.value = false;
  } catch (err) {
    console.error('Failed to initialize graph:', err);
    error.value = 'Failed to load the Linux ecosystem data. Please try again.';
    isLoading.value = false;
  }
};

const initThreeJS = () => {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a); // Dark space-like background

  // Create camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 5, 15);

  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  // Add renderer to container
  if (graphContainer.value) {
    graphContainer.value.appendChild(renderer.domElement);
  }

  // Add lights for a nice 3D effect
  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
  directionalLight.position.set(5, 10, 7);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  // Add a subtle glow effect
  const hemisphereLight = new THREE.HemisphereLight(0x0000ff, 0x00ff00, 1);
  scene.add(hemisphereLight);

  // Add controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = false;
  controls.minDistance = 5;
  controls.maxDistance = 50;
};

const createGraphFromData = (data) => {
  // Create a new graphology graph
  graph = new Graphology({
    // Allow multi-edges (multiple relationships between same nodes)
    multi: false,
    // Allow self-loops (nodes connecting to themselves)
    selfLoop: false
  });

  // Add Linux kernel as the central node
  const kernelNode = {
    key: 'linux-kernel',
    label: 'Linux Kernel',
    type: 'kernel',
    size: 40,
    color: '#ffd166', // Warm yellow
    description: 'The kernel at the heart of every distro, originally released by Linus Torvalds on 25 August 1991.',
    x: 0, y: 0, z: 0 // Initial position (will be updated by layout)
  };

  graph.addNode(kernelNode.key, kernelNode);

  // Add all distributions as nodes
  data.distros.forEach(distro => {
    // Determine color based on status
    let color = '#4cc9f0'; // Default cyan
    if (distro.status === 'discontinued') {
      color = '#f72585'; // Pink for discontinued
    } else if (distro.status === 'legacy') {
      color = '#89cff0'; // Light blue for legacy
    }

    // Determine size based on some metric if available
    const baseSize = 15;
    let factor = 1.0;
    if (distro.popularity && distro.popularity > 0) {
      factor = Math.min(2.0, 1 + Math.log(distro.popularity + 1) / 10);
    }
    const size = baseSize * factor;

    // Add the node
    graph.addNode(distro.id, {
      key: distro.id,
      label: distro.name,
      type: 'distribution',
      family: distro.family,
      size: size,
      color: color,
      description: distro.description || 'A Linux distribution.',
      status: distro.status,
      founded: distro.founded,
      country: distro.country,
      packageManager: distro.packageManager,
      initSystem: distro.initSystem,
      website: distro.website,
      wikipedia: distro.wikipedia
    });
  });

  // Add edges based on parent relationships
  data.distros.forEach(distro => {
    // Primary parent relationship
    if (distro.parent && distro.parent !== 'linux-kernel') {
      graph.addEdge(distro.parent, distro.id, {
        type: 'based-on',
        label: 'based on',
        weight: 1.0
      });
    }
    // If no parent or parent is kernel, connect to kernel
    else if (!distro.parent || distro.parent === 'linux-kernel') {
      graph.addEdge('linux-kernel', distro.id, {
        type: 'based-on',
        label: 'based on',
        weight: 1.5
      });
    }

    // Additional parent relationships (for distros with multiple influences)
    if (distro.additionalParents && Array.isArray(distro.additionalParents)) {
      distro.additionalParents.forEach(parentId => {
        if (parentId && parentId !== distro.parent) {
          graph.addEdge(parentId, distro.id, {
            type: 'influenced-by',
            label: 'influenced by',
            weight: 0.8
          });
        }
      });
    }
  });

  // Add some additional relationships based on shared characteristics
  // For demo purposes, we'll add a few connections between similar distros
  const nodes = Array.from(graph.nodes());
  nodes.forEach(nodeKey => {
    const node = graph.getNodeAttributes(nodeKey);
    if (node.type === 'distribution' && Math.random() > 0.7) {
      const potentialTargets = nodes.filter(n =>
        n !== node.key &&
        graph.getNodeAttribute(n, 'type') === 'distribution' &&
        !graph.hasEdge(nodeKey, n) &&
        !graph.hasEdge(n, nodeKey)
      );
      if (potentialTargets.length > 0) {
        const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
        graph.addEdge(nodeKey, target, {
          type: 'related-to',
          label: 'related to',
          weight: 0.5
        });
      }
    }
  });
};

const initSigmaRenderer = () => {
  // Create container for Sigma
  const sigmaContainer = document.createElement('div');
  sigmaContainer.style.position = 'absolute';
  sigmaContainer.style.top = '0';
  sigmaContainer.style.left = '0';
  sigmaContainer.style.width = '100%';
  sigmaContainer.style.height = '100%';
  sigmaContainer.style.pointerEvents = 'none'; // Let Three.js handle interactions

  if (graphContainer.value) {
    graphContainer.value.appendChild(sigmaContainer);
  }

  // Initialize Sigma with WebGL renderer for better performance
  sigmaInstance = new Sigma({
    graph,
    container: sigmaContainer,
    settings: {
      // Node styling
      defaultNodeColor: '#ffffff',
      defaultNodeBorderColor: '#000000',
      defaultNodeBorderWidth: 1.0,
      defaultNodeHoverColor: '#ffff00',
      defaultNodeClickColor: '#00ffff',
      defaultNodeLabelColor: '#ffffff',
      defaultLabelSize: 14,
      defaultLabelHoverColor: '#ffff00',
      defaultLabelClickColor: '#00ffff',
      labelSize: 'proportional',
      labelSizeRatio: 2,
      labelThreshold: 6,
      font: 'Arial',

      // Edge styling
      defaultEdgeColor: '#888888',
      defaultEdgeHoverColor: '#cccccc',
      defaultEdgeWidth: 0.5,
      edgeColor: 'default',
      edgeLabelSize: 'proportional',

      // Interaction settings
      enableEdgeHovering: true,
      enableNodeHovering: true,
      clickBehavior: 'none', // We'll handle clicks ourselves
      doubleClickEnabled: false,
      wheelEnabled: true,
      zoomEnabled: true,
      draggingEnabled: true,

      // Rendering settings
      labelRenderedIfZeroDegree: true,
      drawEdges: true,
      drawNodes: true,
      drawLabels: true,

      // Performance
      batchEdgesDrawing: true,
      resize: true
    }
  });

  // Add event listeners for node clicks
  sigmaInstance.on('clickNode', (event) => {
    const nodeKey = event.data.node.key;
    const nodeAttributes = graph.getNodeAttributes(nodeKey);
    showNodeDetails(nodeAttributes);
  });

  // Add event listeners for node hover
  sigmaInstance.on('enterNode', (event) => {
    const nodeKey = event.data.node.key;
    const nodeAttributes = graph.getNodeAttributes(nodeKey);
    showNodePreview(nodeAttributes);
  });

  sigmaInstance.on('leaveNode', () => {
    hideNodePreview();
  });
};

const showNodeDetails = (node) => {
  // Create or update the info panel with node details
  const infoPanel = document.getElementById('info-panel');
  if (!infoPanel) return;

  // Determine the icon and color based on node type
  let icon = '🐧'; // Default kernel icon
  let titleColor = '#ffd166'; // Default kernel color

  if (node.type === 'distribution') {
    icon = '🐧';
    // You could customize icons based on distribution family here
    if (node.family === 'Debian') {
      titleColor = '#a81d33';
    } else if (node.family === 'Fedora' || node.family === 'Red Hat') {
      titleColor = '#3b65bd';
    } else if (node.family === 'Arch' || node.family === 'Independent') {
      titleColor = '#1793d1';
    } else if (node.family === 'SUSE') {
      titleColor = '#2ab27b';
    } else if (node.family === 'Ubuntu') {
      titleColor = '#e95420';
    }
  }

  infoPanel.innerHTML = `
    <div class="text-center py-4">
      <h2 class="text-xl font-bold" style="color: ${titleColor};">${icon} ${node.label}</h2>
      <p class="text-sm text-gray-400 mb-4">${node.type === 'kernel' ? 'The core of all Linux operating systems' : `A ${node.family} family Linux distribution`}</p>

      ${node.founded ? `<div class="text-sm"><span class="font-medium">Founded:</span> ${node.founded}</div>` : ''}
      ${node.country ? `<div class="text-sm"><span class="font-medium">Origin:</span> ${node.country}</div>` : ''}
      ${node.packageManager ? `<div class="text-sm"><span class="font-medium">Package Manager:</span> ${node.packageManager}</div>` : ''}
      ${node.initSystem ? `<div class="text-sm"><span class="font-medium">Init System:</span> ${node.initSystem}</div>` : ''}
      ${node.website ? `<div class="text-sm"><span class="font-medium">Website:</span> <a href="${node.website}" target="_blank" class="text-cyan-400 underline">${new URL(node.website).hostname}</a></div>` : ''}
      ${node.wikipedia ? `<div class="text-sm"><span class="font-medium">Wikipedia:</span> <a href="${node.wikipedia}" target="_blank" class="text-cyan-400 underline">Wikipedia</a></div>` : ''}

      ${node.description ? `<p class="mt-4 text-sm text-gray-300 leading-relaxed">${node.description}</p>` : ''}

      ${node.status && node.status !== 'active' ? `<div class="mt-2 px-2 py-1 bg-${node.status === 'discontinued' ? 'red-600' : 'yellow-600'} text-white text-xs rounded">${node.status.toUpperCase()}</div>` : ''}
    </div>
  `;
};

const showNodePreview = (node) => {
  // Create a small tooltip-like preview on hover
  // For simplicity, we'll just update the title attribute of the canvas
  // In a more sophisticated implementation, we'd create an actual tooltip element
  if (renderer.domElement) {
    renderer.domElement.title = `${node.label}\n${node.family || ''}\n${node.status || ''}`;
  }
};

const hideNodePreview = () => {
  if (renderer.domElement) {
    renderer.domElement.title = '';
  }
};

const animate = () => {
  requestAnimationFrame(animate);

  // Update controls
  if (controls) {
    controls.update();
  }

  // Render scene
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
};

const onWindowResize = () => {
  // Update camera aspect ratio
  if (camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  // Update renderer size
  if (renderer) {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Update sigma size
  if (sigmaInstance) {
    sigmaInstance.resize();
  }
};

const retryLoad = () => {
  // Reset state and try again
  error.value = null;
  isLoading.value = true;
  // Clean up previous instance if any
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  if (scene) {
    scene = null;
  }
  if (camera) {
    camera = null;
  }
  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (graph) {
    graph.clear();
    graph = null;
  }

  // Reinitialize
  init();
};

onMounted(() => {
  init();
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowResize);
  if (sigmaInstance) {
    sigmaInstance.kill();
  }
  if (renderer) {
    renderer.dispose();
  }
  if (controls) {
    controls.dispose();
  }
});
</script>

<style scoped>
/* Ensure the container takes full space */
:root {
  --bg-color: #0a0a0a;
  --text-color: #e0e0e0;
  --accent-color: #00ffff;
  --secondary-color: #ff00ff;
}

/* Add some subtle animations */
@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}

.pulse-animate {
  animation: pulse 2s infinite;
}

/* Custom scrollbar for any future use */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #1a1a1a;
}

::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #4a4a4a;
}
</style>
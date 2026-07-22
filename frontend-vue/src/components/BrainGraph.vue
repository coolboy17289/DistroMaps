<template>
  <div class="brain-graph-wrap" :class="{ 'legend-open': legendOpen }">
    <div ref="container" class="brain-canvas"></div>
    <div ref="labelLayer" class="brain-labels"></div>

    <div class="brain-hint">
      <span>drag to orbit</span><span>scroll to zoom</span><span>right-drag to pan</span>
    </div>

    <div v-if="loading" class="brain-loading">Loading the Linux knowledge graph…</div>
    <div v-if="error" class="brain-error">
      <p>Couldn't render the graph.</p>
      <p class="brain-error-detail">{{ error }}</p>
      <button class="brain-retry" @click="reload">Retry</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useGraph } from '@/composables/useGraph';
import type { Layout3D, LayoutNode } from '@/lib/layout3d';

const g = useGraph();
const { layout, selectedId, filterFamilyId, highlightIds, hoveredFamilyId,
  searchHighlightIds, hoveredId, legendOpen, theme, loading, error } = g;

const container = ref<HTMLDivElement | null>(null);
const labelLayer = ref<HTMLDivElement | null>(null);
const reload = () => g.load();

// --- Three.js handles (kept outside reactivity) ---
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let raycaster: THREE.Raycaster;
let pointer: THREE.Vector2;
let nodeMesh: THREE.InstancedMesh | null = null;
let edgeLines: THREE.LineSegments | null = null;
let raf = 0;
let resizeObs: ResizeObserver | null = null;

// Maps instance index -> node id and back.
let idxToId: string[] = [];
let idToIdx = new Map<string, number>();
let nodeById = new Map<string, LayoutNode>();

// Camera focus animation target.
let camTargetPos = new THREE.Vector3();
let camTargetLook = new THREE.Vector3();
let camAnimating = false;
const CAM_SPEED = 0.08;

// --- Label pool ---
const LABEL_POOL = 80;
const labels: HTMLDivElement[] = [];
let labelsBuilt = false;

const tmpMatrix = new THREE.Matrix4();
const tmpColor = new THREE.Color();
const tmpVec = new THREE.Vector3();

function buildLabels() {
  if (!labelLayer.value || labelsBuilt) return;
  for (let i = 0; i < LABEL_POOL; i++) {
    const el = document.createElement('div');
    el.className = 'brain-label';
    el.style.display = 'none';
    labelLayer.value.appendChild(el);
    labels.push(el);
  }
  labelsBuilt = true;
}

function readBg(): number {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0f0f0f';
  return new THREE.Color(css).getHex();
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(readBg());
  scene.fog = new THREE.FogExp2(readBg(), 0.00045);

  const w = container.value!.clientWidth || window.innerWidth;
  const h = container.value!.clientHeight || window.innerHeight;
  camera = new THREE.PerspectiveCamera(60, w / h, 1, 6000);
  camera.position.set(0, 0, 1200);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
  renderer.setSize(w, h, false);
  container.value!.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.panSpeed = 0.7;
  controls.minDistance = 60;
  controls.maxDistance = 4000;
  controls.screenSpacePanning = true;

  raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 1 };
  pointer = new THREE.Vector2();

  // Subtle lighting — InstancedStandardMaterial looks better lit.
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(1, 1.5, 1);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
  fill.position.set(-1, -0.5, -1);
  scene.add(fill);
}

function clearGraph() {
  if (nodeMesh) {
    scene.remove(nodeMesh);
    nodeMesh.geometry.dispose();
    (nodeMesh.material as THREE.Material).dispose();
    nodeMesh = null;
  }
  if (edgeLines) {
    scene.remove(edgeLines);
    edgeLines.geometry.dispose();
    (edgeLines.material as THREE.Material).dispose();
    edgeLines = null;
  }
  idxToId = [];
  idToIdx = new Map();
  nodeById = new Map();
}

function buildGraph(l: Layout3D) {
  clearGraph();

  // --- Nodes (instanced) ---
  const geom = new THREE.IcosahedronGeometry(8, 1);
  const mat = new THREE.MeshStandardMaterial({
    metalness: 0.15,
    roughness: 0.55,
    transparent: true,
    opacity: 1,
  });
  nodeMesh = new THREE.InstancedMesh(geom, mat, l.nodes.length);
  nodeMesh.frustumCulled = false;
  nodeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(nodeMesh);

  idxToId = new Array(l.nodes.length);
  l.nodes.forEach((n, i) => {
    idxToId[i] = n.id;
    idToIdx.set(n.id, i);
    nodeById.set(n.id, n);
  });

  // --- Edges (LineSegments, vertex colors) ---
  const edgePos: number[] = [];
  const edgeCol: number[] = [];
  const edgeColorOf = new Map<string, THREE.Color>();
  for (const n of l.nodes) edgeColorOf.set(n.id, new THREE.Color(n.familyColor));
  for (const e of l.links) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    edgePos.push(s.x, s.y, s.z, t.x, t.y, t.z);
    const c = edgeColorOf.get(e.target) ?? tmpColor.set(0x888888);
    edgeCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const edgeGeom = new THREE.BufferGeometry();
  edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
  edgeGeom.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
  const edgeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
  scene.add(edgeLines);

  applyAppearance();

  // --- Initial camera framing (auto-fit) ---
  const extent = l.extent || 600;
  const fov = (camera.fov * Math.PI) / 180;
  const dist = extent / Math.tan(fov / 2) * 1.15;
  camera.position.set(dist * 0.5, dist * 0.35, dist);
  controls.target.set(0, 0, 0);
  camTargetPos.copy(camera.position);
  camTargetLook.copy(controls.target);
  camAnimating = false;
  controls.update();
}

/** Recompute per-node scale + color and per-edge color from interaction state. */
function applyAppearance() {
  if (!nodeMesh || !edgeLines || !layout.value) return;
  const l = layout.value;
  const hl = highlightIds.value;
  const sh = searchHighlightIds.value;
  const filt = filterFamilyId.value;
  const legendFam = hoveredFamilyId.value;
  const sel = selectedId.value;
  const hov = hoveredId.value;

  const hasFilter = !!filt;
  const anyHighlight = sel !== null || legendFam !== null || sh.size > 0;

  for (let i = 0; i < l.nodes.length; i++) {
    const n = l.nodes[i];
    const id = n.id;

    // Base scale by depth.
    let scale = n.id === 'linux-kernel' ? 2.6 : Math.max(0.55, 1.5 - n.depth * 0.18);
    let alpha = 1;

    const inFamily = !hasFilter || n.family === filt;
    const inLegend = !legendFam || n.family === legendFam;
    const isHl = hl.has(id);
    const isSh = sh.has(id);

    if (id === sel) scale *= 1.7;
    else if (id === hov) scale *= 1.4;
    else if (isSh) scale *= 1.2;
    else if (isHl) scale *= 1.12;

    // Dimming logic mirrors the React app's alpha rules.
    if (anyHighlight) {
      if (!isHl && !isSh && id !== hov) alpha = 0.12;
      else if (isHl) alpha = 0.95;
    }
    if (!inFamily && hasFilter) alpha *= 0.12;
    if (!inLegend && legendFam && !isHl && !isSh) alpha *= 0.2;

    tmpMatrix.makeScale(scale, scale, scale);
    tmpMatrix.setPosition(n.x, n.y, n.z);
    nodeMesh!.setMatrixAt(i, tmpMatrix);

    tmpColor.set(n.familyColor);
    if (n.id === 'linux-kernel') tmpColor.set(0xffffff);
    if (n.status === 'discontinued') {
      // Desaturate discontinued nodes a touch.
      tmpColor.lerp(new THREE.Color(0x444444), 0.35);
    }
    if (alpha < 1) tmpColor.multiplyScalar(alpha);
    nodeMesh!.setColorAt(i, tmpColor);
  }
  nodeMesh.instanceMatrix.needsUpdate = true;
  if (nodeMesh.instanceColor) nodeMesh.instanceColor.needsUpdate = true;

  // Rebuild edge colors with alpha baked in.
  const colAttr = edgeLines.geometry.getAttribute('color') as THREE.BufferAttribute;
  const posAttr = edgeLines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const edgeColorOf = new Map<string, THREE.Color>();
  for (const n of l.nodes) edgeColorOf.set(n.id, new THREE.Color(n.familyColor));
  let seg = 0;
  for (const e of l.links) {
    const s = nodeById.get(e.source);
    const t = nodeById.get(e.target);
    if (!s || !t) continue;
    let a = 0.22;
    const inAncestry = hl.has(e.source) && hl.has(e.target);
    const inSearch = sh.has(e.source) && sh.has(e.target);
    const inLegend = legendFam && s.family === legendFam && t.family === legendFam;
    if (inAncestry) a = 0.7;
    else if (inSearch) a = 0.85;
    else if (inLegend) a = 0.6;
    const c = (edgeColorOf.get(e.target) ?? tmpColor.set(0x888888)).clone();
    if (hasFilter && (s.family !== filt || t.family !== filt)) a *= 0.1;
    c.multiplyScalar(a);
    colAttr.setXYZ(seg, c.r, c.g, c.b);
    colAttr.setXYZ(seg + 1, c.r, c.g, c.b);
    seg += 2;
  }
  void posAttr;
  colAttr.needsUpdate = true;
}

function focusOn(id: string | null) {
  if (!id) { camAnimating = false; return; }
  const n = nodeById.get(id);
  if (!n) return;
  const dir = new THREE.Vector3(n.x, n.y, n.z).normalize();
  const dist = 180 + n.depth * 70;
  camTargetPos.set(n.x + dir.x * dist, n.y + dir.y * dist, n.z + dir.z * dist);
  camTargetLook.set(n.x, n.y, n.z);
  camAnimating = true;
}

function pick(clientX: number, clientY: number): string | null {
  if (!nodeMesh || !container.value) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  raycaster.params.Points = { threshold: 1 };
  const hits = raycaster.intersectObject(nodeMesh, false);
  if (hits.length && hits[0].instanceId !== undefined) {
    return idxToId[hits[0].instanceId] ?? null;
  }
  return null;
}

// --- Pointer interaction ---
let downX = 0, downY = 0, downTime = 0;
function onPointerMove(e: PointerEvent) {
  if (e.buttons !== 0) { hoveredId.value = null; return; }
  const id = pick(e.clientX, e.clientY);
  hoveredId.value = id;
  if (renderer) renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
}
function onPointerDown(e: PointerEvent) {
  downX = e.clientX; downY = e.clientY; downTime = performance.now();
}
function onPointerUp(e: PointerEvent) {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 5) return; // it was a drag
  const id = pick(e.clientX, e.clientY);
  selectedId.value = id;
}

function onResize() {
  if (!container.value || !camera || !renderer) return;
  const w = container.value.clientWidth;
  const h = container.value.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

// --- Label rendering (project 3D → 2D each frame) ---
const labelState: Array<{ id: string; node: LayoutNode; priority: number }> = [];
function updateLabels() {
  if (!labelLayer.value || !layout.value || !camera) return;
  const l = layout.value;
  const w = container.value!.clientWidth;
  const h = container.value!.clientHeight;

  // Decide which nodes get labels this frame.
  labelState.length = 0;
  const sel = selectedId.value;
  const hov = hoveredId.value;
  const sh = g.searchHoveredId.value;
  const legendFam = hoveredFamilyId.value;
  for (const n of l.nodes) {
    let priority = -1;
    if (n.id === sel) priority = 1000;
    else if (n.id === hov) priority = 900;
    else if (n.id === sh) priority = 800;
    else if (highlightIds.value.has(n.id)) priority = 500;
    else if (searchHighlightIds.value.has(n.id)) priority = 480;
    else if (legendFam && n.family === legendFam) priority = 300;
    else if (n.depth <= 1 && n.id !== 'linux-kernel') priority = 100 - n.depth * 10;
    if (priority < 0) continue;
    labelState.push({ id: n.id, node: n, priority });
  }
  // Show highest priority first, capped to pool size.
  labelState.sort((a, b) => b.priority - a.priority);
  const shown = labelState.slice(0, LABEL_POOL);

  const rect = renderer.domElement.getBoundingClientRect();
  for (let i = 0; i < LABEL_POOL; i++) {
    const el = labels[i];
    if (!el) continue;
    if (i >= shown.length) { el.style.display = 'none'; continue; }
    const { node, id } = shown[i];
    tmpVec.set(node.x, node.y, node.z).project(camera);
    if (tmpVec.z > 1 || tmpVec.z < -1) { el.style.display = 'none'; continue; }
    const x = (tmpVec.x * 0.5 + 0.5) * rect.width;
    const y = (-tmpVec.y * 0.5 + 0.5) * rect.height;
    const isSel = id === sel;
    el.style.display = 'block';
    el.style.transform = `translate(${x}px, ${y}px)`;
    el.style.setProperty('--lab-color', node.familyColor);
    el.classList.toggle('is-sel', isSel);
    el.classList.toggle('is-kernel', node.id === 'linux-kernel');
    el.textContent = node.name;
  }
}

function animate() {
  raf = requestAnimationFrame(animate);
  if (camAnimating) {
    camera.position.lerp(camTargetPos, CAM_SPEED);
    controls.target.lerp(camTargetLook, CAM_SPEED);
    if (camera.position.distanceTo(camTargetPos) < 1.5) camAnimating = false;
  }
  controls.update();
  renderer.render(scene, camera);
  updateLabels();
}

// --- Watchers ---
watch(layout, (l) => { if (l) buildGraph(l); });
watch([selectedId, filterFamilyId, highlightIds, hoveredFamilyId, searchHighlightIds, hoveredId], applyAppearance);
watch(selectedId, focusOn);
watch(theme, () => {
  if (scene) {
    const bg = readBg();
    (scene.background as THREE.Color).setHex(bg);
    (scene.fog as THREE.FogExp2).color.setHex(bg);
  }
});

onMounted(async () => {
  buildLabels();
  setupScene();
  resizeObs = new ResizeObserver(onResize);
  resizeObs.observe(container.value!);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') selectedId.value = null;
  });
  animate();
  if (!layout.value) await g.load();
  if (layout.value) buildGraph(layout.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  resizeObs?.disconnect();
  if (renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.dispose();
  }
  controls?.dispose();
  clearGraph();
});
</script>

<style scoped>
.brain-graph-wrap {
  position: absolute;
  inset: 60px 0 0;
  z-index: 10;
  transition: left 250ms cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}
.brain-graph-wrap.legend-open { left: var(--sidebar-w, 220px); }
.brain-graph-wrap:not(.legend-open) { left: 0; }
.brain-canvas { position: absolute; inset: 0; }
.brain-canvas :deep(canvas) { display: block; cursor: grab; }
.brain-labels {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.brain-hint {
  position: absolute;
  top: 8px; left: 12px;
  display: flex; gap: 10px;
  font-size: 10px;
  color: var(--text-dim);
  pointer-events: none;
}
.brain-loading, .brain-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--bg);
  color: var(--text-muted);
  font-size: 13px;
  z-index: 20;
}
.brain-error-detail { font-size: 11px; color: var(--text-dim); max-width: 360px; }
.brain-retry {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--bg-elevated);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}

.brain-label {
  position: absolute;
  top: 0; left: 0;
  transform-origin: 0 50%;
  padding: 1px 6px;
  margin-left: 14px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text);
  background: var(--bg-elevated);
  border: 1px solid var(--line);
  border-left: 2px solid var(--lab-color, #888);
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0.92;
  box-shadow: 0 1px 4px rgba(0,0,0,0.25);
}
.brain-label.is-sel {
  opacity: 1;
  font-weight: 600;
  color: var(--lab-color, #fff);
}
.brain-label.is-kernel { border-left-color: #ffd166; }

@media (max-width: 720px) {
  .brain-graph-wrap.legend-open { left: 0; }
  .brain-hint { display: none; }
}
</style>
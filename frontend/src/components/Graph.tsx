import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMindMap, type GraphNode, type GraphLink } from '@/lib/graph';
import type { GraphData } from '@shared/types';

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface GraphProps {
  data: GraphData;
  selectedId: string | null;
  filterFamilyId: string | null;
  highlightIds: Set<string>;
  /** Family id being hovered in the legend */
  hoveredFamilyId?: string | null;
  /** Set of distro ids highlighted by search result hover */
  searchHighlightIds?: Set<string>;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}

const HIT_RADIUS = 18;

export function Graph({ data, selectedId, filterFamilyId, highlightIds, hoveredFamilyId, searchHighlightIds, onSelect, onHover }: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const targetTransformRef = useRef<Transform | null>(null);
  const mouseRef = useRef({
    x: -1, y: -1,
    dragging: false,
    lastX: 0, lastY: 0,
    movedSinceDown: false,
  });
  const hoveredIdRef = useRef<string | null>(null);
  const visualRef = useRef({ selectedId, filterFamilyId, highlightIds, hoveredFamilyId, searchHighlightIds });
  visualRef.current = { selectedId, filterFamilyId, highlightIds, hoveredFamilyId, searchHighlightIds };
  const fitDoneRef = useRef(false);

  const [size, setSize] = useState({ w: 800, h: 600 });

  // Build mind map layout — computed once per data change
  const layout = useMemo(() => buildMindMap(data), [data]);
  const nodes = layout.nodes;
  const links = layout.links;

  // Compute a transform that fits all nodes in the viewport
  const fitTransform = useCallback((W: number, H: number): Transform => {
    if (!nodes.length) return { x: W / 2, y: H / 2, k: 1 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const pad = 80;
    const graphW = maxX - minX + pad * 2;
    const graphH = maxY - minY + pad * 2;
    const k = Math.min(W / graphW, H / graphH, 1.2);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return {
      x: W / 2 - cx * k,
      y: H / 2 - cy * k,
      k: Math.max(0.25, k),
    };
  }, [nodes]);

  // Resize observer
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(480, Math.floor(r.width)), h: Math.max(360, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Animate camera to selected node
  useEffect(() => {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return;
    const t = transformRef.current;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const targetK = Math.max(0.6, t.k);
    targetTransformRef.current = {
      x: cx - node.x * targetK,
      y: cy - node.y * targetK,
      k: targetK,
    };
  }, [selectedId, nodes, size.w, size.h]);

  // Canvas setup + RAF loop + initial auto-fit
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = size.w;
    const H = size.h;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Auto-fit viewport to show all nodes on initial load
    // Only do this if transform is still at the default (not yet modified by user)
    if (!fitDoneRef.current && W > 480 && H > 360) {
      const t = fitTransform(W, H);
      transformRef.current = t;
      fitDoneRef.current = true;
    }

    let raf: number;

    function frame() {
      // Smooth camera animation toward target
      const target = targetTransformRef.current;
      if (target) {
        const cur = transformRef.current;
        const speed = 0.08;
        const dx = target.x - cur.x;
        const dy = target.y - cur.y;
        const dk = target.k - cur.k;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(dk) < 0.005) {
          transformRef.current = { ...target };
          targetTransformRef.current = null;
        } else {
          transformRef.current = {
            x: cur.x + dx * speed,
            y: cur.y + dy * speed,
            k: cur.k + dk * speed,
          };
        }
      }

      const v = visualRef.current;
      drawMindMap(ctx!, nodes, links, transformRef.current, W, H, hoveredIdRef.current, v.selectedId, v.filterFamilyId, v.highlightIds, v.hoveredFamilyId, v.searchHighlightIds);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [size.w, size.h, nodes, links, fitTransform]);

  // Hit test
  const hitTest = useCallback((wx: number, wy: number): GraphNode | null => {
    let closest: GraphNode | null = null;
    let closestDist = HIT_RADIUS;
    for (const node of nodes) {
      const dx = node.x - wx;
      const dy = node.y - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const r = node.id === 'linux-kernel' ? 30 : Math.max(8, HIT_RADIUS - (node.depth * 2));
      if (dist < r && dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }
    return closest;
  }, [nodes]);

  // Pointer + Touch handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function toWorld(clientX: number, clientY: number) {
      const r = canvas!.getBoundingClientRect();
      const sx = clientX - r.left;
      const sy = clientY - r.top;
      const t = transformRef.current;
      return { sx, sy, wx: (sx - t.x) / t.k, wy: (sy - t.y) / t.k };
    }

    // --- Mouse handlers ---

    function onMouseMove(e: MouseEvent) {
      const m = mouseRef.current;
      const { wx, wy } = toWorld(e.clientX, e.clientY);
      m.x = wx;
      m.y = wy;
      if (m.dragging) {
        const dx = e.clientX - m.lastX;
        const dy = e.clientY - m.lastY;
        m.lastX = e.clientX;
        m.lastY = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 3) m.movedSinceDown = true;
        transformRef.current = { ...transformRef.current, x: transformRef.current.x + dx, y: transformRef.current.y + dy };
        return;
      }
      const hit = hitTest(wx, wy);
      const id = hit?.id ?? null;
      if (id !== hoveredIdRef.current) {
        hoveredIdRef.current = id;
        canvas!.style.cursor = hit ? 'pointer' : 'grab';
        onHover(id);
      }
    }

    function onMouseDown(e: MouseEvent) {
      targetTransformRef.current = null;
      mouseRef.current.dragging = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
      mouseRef.current.movedSinceDown = false;
      canvas!.style.cursor = 'grabbing';
    }

    function onMouseUp(e: MouseEvent) {
      const m = mouseRef.current;
      if (!m.dragging) return;
      m.dragging = false;
      if (m.movedSinceDown) {
        canvas!.style.cursor = 'grab';
        return;
      }
      const { wx, wy } = toWorld(e.clientX, e.clientY);
      const hit = hitTest(wx, wy);
      canvas!.style.cursor = 'grab';
      onSelect(hit?.id ?? null);
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      targetTransformRef.current = null;
      const t = transformRef.current;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const { sx, sy } = toWorld(e.clientX, e.clientY);
      const newK = Math.max(0.3, Math.min(3, t.k * factor));
      const wx = (sx - t.x) / t.k;
      const wy = (sy - t.y) / t.k;
      transformRef.current = { x: sx - wx * newK, y: sy - wy * newK, k: newK };
    }

    // --- Touch handlers ---

    let touchStartDist = 0;
    let touchStartTransform: Transform | null = null;
    let touchLastTouches: { x: number; y: number }[] = [];
    let touchMoved = false;

    function onTouchStart(e: TouchEvent) {
      targetTransformRef.current = null;
      if (e.touches.length === 1) {
        // Single finger: initiate pan
        mouseRef.current.dragging = true;
        mouseRef.current.lastX = e.touches[0].clientX;
        mouseRef.current.lastY = e.touches[0].clientY;
        mouseRef.current.movedSinceDown = false;
        touchMoved = false;
        touchLastTouches = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }];
      } else if (e.touches.length === 2) {
        // Two fingers: prepare for pinch-zoom
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        touchStartTransform = { ...transformRef.current };
        touchLastTouches = [
          { x: e.touches[0].clientX, y: e.touches[0].clientY },
          { x: e.touches[1].clientX, y: e.touches[1].clientY },
        ];
      }
    }

    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length === 1) {
        const tx = e.touches[0].clientX;
        const ty = e.touches[0].clientY;
        const dx = tx - mouseRef.current.lastX;
        const dy = ty - mouseRef.current.lastY;
        mouseRef.current.lastX = tx;
        mouseRef.current.lastY = ty;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          mouseRef.current.movedSinceDown = true;
          touchMoved = true;
        }
        transformRef.current = { ...transformRef.current, x: transformRef.current.x + dx, y: transformRef.current.y + dy };
      } else if (e.touches.length === 2 && touchStartTransform) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const scale = dist / touchStartDist;
        const newK = Math.max(0.3, Math.min(3, touchStartTransform.k * scale));
        // Zoom toward center of two touches
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const r = canvas!.getBoundingClientRect();
        const sx = cx - r.left;
        const sy = cy - r.top;
        const wx = (sx - touchStartTransform.x) / touchStartTransform.k;
        const wy = (sy - touchStartTransform.y) / touchStartTransform.k;
        transformRef.current = { x: sx - wx * newK, y: sy - wy * newK, k: newK };
        touchMoved = true;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (e.touches.length === 0 && !touchMoved) {
        // Tap: treat as click
        const touch = (e as TouchEvent).changedTouches[0];
        const { wx, wy } = toWorld(touch.clientX, touch.clientY);
        const hit = hitTest(wx, wy);
        onSelect(hit?.id ?? null);
      }
      if (e.touches.length === 0) {
        mouseRef.current.dragging = false;
        touchMoved = false;
      }
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.style.cursor = 'grab';
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [hitTest, onSelect, onHover]);

  return (
    <div ref={wrapRef} className="graph-wrap">
      <canvas ref={canvasRef} className="graph-canvas" />
      <div className="graph-hint">
        <span>Drag to pan</span>
        <span>Scroll to zoom</span>
        <span>Click a node to inspect</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                          Mind Map Canvas Drawing                           */
/* -------------------------------------------------------------------------- */

function drawMindMap(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  links: GraphLink[],
  transform: Transform,
  W: number,
  H: number,
  hoveredId: string | null,
  selectedId: string | null,
  filterFamilyId: string | null,
  highlightIds: Set<string>,
  hoveredFamilyId?: string | null,
  searchHighlightIds?: Set<string>,
) {
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.translate(transform.x, transform.y);
  ctx.scale(transform.k, transform.k);

  const filtered = filterFamilyId !== null;
  const legendHoverFamily = hoveredFamilyId ?? null;

  // ---- Edges: organic bezier branches from parent to child ----
  for (const link of links) {
    const src = nodes.find((n) => n.id === link.source);
    const tgt = nodes.find((n) => n.id === link.target);
    if (!src || !tgt) continue;

    const isHighlighted = highlightIds.has(src.id) && highlightIds.has(tgt.id);
    const isLegendHovered = legendHoverFamily && src.family === legendHoverFamily && tgt.family === legendHoverFamily;
    const isSearchHighlighted = searchHighlightIds?.has(src.id) && searchHighlightIds?.has(tgt.id);
    const dimmed = (filtered && src.family !== filterFamilyId && src.id !== 'linux-kernel') ||
                   (legendHoverFamily && src.family !== legendHoverFamily && src.id !== 'linux-kernel');

    ctx.globalAlpha = isLegendHovered ? 0.6 : isSearchHighlighted ? 0.85 : dimmed ? 0.1 : isHighlighted ? 0.7 : 0.25;
    ctx.strokeStyle = tgt.familyColor;
    ctx.lineWidth = isHighlighted || isLegendHovered || isSearchHighlighted ? 1.5 : src.id === 'linux-kernel' ? 1.2 : 0.8;
    ctx.beginPath();
    drawBezierBranch(ctx, src.x, src.y, tgt.x, tgt.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- Nodes ----
  for (const node of nodes) {
    const isKernel = node.id === 'linux-kernel';
    const isSelected = node.id === selectedId;
    const isHovered = node.id === hoveredId;
    const isHighlighted = highlightIds.has(node.id);
    const isLegendHovered = legendHoverFamily && node.family === legendHoverFamily;
    const isSearchHighlighted = searchHighlightIds?.has(node.id);
    const dimmed = (filtered && node.family !== filterFamilyId && !isKernel) ||
                   (legendHoverFamily && node.family !== legendHoverFamily && !isKernel);

    if (dimmed && !isHighlighted && !isLegendHovered && !isSearchHighlighted) continue;

    const baseR = isKernel ? 22 : Math.max(4, 7 - node.depth * 1);
    const radius = isSelected ? baseR * 1.6 : isHovered ? baseR * 1.3 : isLegendHovered ? baseR * 1.2 : isSearchHighlighted ? baseR * 1.15 : isHighlighted ? baseR * 1.1 : baseR;
    const alpha = dimmed && !isLegendHovered ? 0.15 : 1;

    ctx.globalAlpha = alpha;

    // Glow
    if (isHovered || isSelected || isLegendHovered || isSearchHighlighted) {
      const glowR = radius * 2.5;
      const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
      g.addColorStop(0, isSelected ? 'rgba(255,255,255,0.25)' : isSearchHighlighted ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

    if (isKernel) {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#0f0f0f';
      ctx.font = `${radius * 0.9}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✦', node.x, node.y + 1);
    } else {
      ctx.fillStyle = node.familyColor;
      ctx.fill();
      if (isSelected || isHovered) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
      }
      // Search highlight ring
      if (isSearchHighlighted && !isSelected && !isHovered) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
      }
    }

    // Label
    const labelSize = isKernel ? 13 : isSelected ? 12 : isHovered || isHighlighted || isSearchHighlighted ? 11 : Math.max(8, 11 - node.depth);
    ctx.font = `${isKernel ? 600 : 500} ${labelSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const labelX = node.x + radius + 6;
    const labelY = node.y;

    const tw = ctx.measureText(node.name).width;
    ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
    roundRect(ctx, labelX - 3, labelY - labelSize * 0.6, tw + 6, labelSize * 1.2, 3);
    ctx.fill();

    ctx.fillStyle = isKernel || isSelected ? '#ffffff' : isHovered ? '#e0e0e0' : isSearchHighlighted ? '#ffffff' : node.familyColor;
    ctx.fillText(node.name, labelX, labelY);
  }

  ctx.restore();
}

function drawBezierBranch(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number,
  x2: number, y2: number,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return;

  // Control point pulls outward from center to create organic curve
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  // Control point pulls outward from parent->child direction for organic curve
  const pull = dist * 0.15;
  const angle = Math.atan2(dy, dx);
  const cx = midX + Math.cos(angle + Math.PI / 2) * pull;
  const cy = midY + Math.sin(angle + Math.PI / 2) * pull;

  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

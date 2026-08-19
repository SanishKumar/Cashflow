/**
 * The money graph — the app's primary surface.
 *
 * Rendered to a single canvas rather than SVG or DOM nodes. A settlement
 * network is a physics simulation plus a few hundred moving particles, and
 * pushing that through the DOM costs a layout pass per frame. One canvas keeps
 * a sixty-firm network at 60fps on a laptop, which is what makes clearing feel
 * instant instead of merely fast.
 *
 * Everything here is hand-rolled: force layout, curved edges, particle flow.
 * A graph library would bring a megabyte of code to do less.
 */

import { useEffect, useRef } from "react";

export type EdgeState = "live" | "cleared" | "new" | "reduced";

export interface GraphParty {
  id: string;
  label: string;
  /** Positive = owed money, negative = owes money. Minor units. */
  net: number;
}

export interface GraphObligation {
  from: string;
  to: string;
  amount: number;
  state: EdgeState;
}

interface MoneyGraphProps {
  parties: GraphParty[];
  obligations: GraphObligation[];
  /** Pauses particle flow — used while a network is loading. */
  quiet?: boolean;
  onSelect?: (partyId: string | null) => void;
  selected?: string | null;
  className?: string;
}

interface Node {
  id: string;
  label: string;
  net: number;
  /** Position on the seeding ring, used until the force layout takes over. */
  seat: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** Eases in so nodes do not pop when a network changes. */
  alpha: number;
}

interface Edge {
  from: number;
  to: number;
  amount: number;
  state: EdgeState;
  /** Eases toward 1 for live edges, 0 for cleared ones. */
  alpha: number;
  width: number;
}

interface Palette {
  credit: string;
  debit: string;
  neutral: string;
  edge: string;
  edgeNew: string;
  edgeReduced: string;
  ink: string;
  inkSoft: string;
  plate: string;
}

function readPalette(root: HTMLElement): Palette {
  const styles = getComputedStyle(root);
  const read = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    credit: read("--graph-credit", "#2dd4a7"),
    debit: read("--graph-debit", "#e8a33d"),
    neutral: read("--graph-neutral", "#5b6472"),
    edge: read("--graph-edge", "#3b4552"),
    edgeNew: read("--graph-edge-new", "#f4707f"),
    edgeReduced: read("--graph-edge-reduced", "#e8a33d"),
    ink: read("--graph-ink", "#e8edf4"),
    inkSoft: read("--graph-ink-soft", "#8b95a5"),
    plate: read("--graph-plate", "#12161c"),
  };
}

/** Quadratic bezier evaluated at t. */
function bezier(p0: number, c: number, p1: number, t: number): number {
  const inv = 1 - t;
  return inv * inv * p0 + 2 * inv * t * c + t * t * p1;
}

export function MoneyGraph({
  parties,
  obligations,
  quiet = false,
  onSelect,
  selected = null,
  className = "",
}: MoneyGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const indexRef = useRef<Map<string, number>>(new Map());
  const dragRef = useRef<{ node: number; dx: number; dy: number } | null>(null);
  const hoverRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const paletteRef = useRef<Palette | null>(null);
  const selectedRef = useRef<string | null>(selected);
  const quietRef = useRef(quiet);
  const wakeRef = useRef<(() => void) | null>(null);

  // Mirrored into refs so the animation loop can read the latest values
  // without being torn down and rebuilt on every prop change.
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    quietRef.current = quiet;
  }, [quiet]);

  // Rebuild the simulation when the network changes, keeping positions for
  // parties that already exist so the layout does not jump between modes.
  useEffect(() => {
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const index = new Map<string, number>();

    const largest = Math.max(1, ...parties.map((party) => Math.abs(party.net)));

    const nodes: Node[] = parties.map((party, i) => {
      const kept = previous.get(party.id);
      const weight = Math.abs(party.net) / largest;

      return {
        id: party.id,
        label: party.label,
        net: party.net,
        seat: i,
        x: kept?.x ?? Number.NaN,
        y: kept?.y ?? Number.NaN,
        vx: kept?.vx ?? 0,
        vy: kept?.vy ?? 0,
        radius: 10 + Math.sqrt(weight) * 15,
        alpha: kept?.alpha ?? 0,
      };
    });

    nodes.forEach((node, i) => index.set(node.id, i));

    const heaviest = Math.max(1, ...obligations.map((item) => item.amount));
    const edges: Edge[] = [];
    for (const item of obligations) {
      const from = index.get(item.from);
      const to = index.get(item.to);
      if (from === undefined || to === undefined || from === to) continue;
      edges.push({
        from,
        to,
        amount: item.amount,
        state: item.state,
        alpha: item.state === "new" ? 0 : 1,
        width: 0.7 + Math.sqrt(item.amount / heaviest) * 1.9,
      });
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    indexRef.current = index;
    wakeRef.current?.();
  }, [parties, obligations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    paletteRef.current = readPalette(document.documentElement);

    let frame = 0;
    let running = true;
    let asleep = false;
    // Frames of near-zero motion before physics is allowed to stop.
    let calmFrames = 0;
    // Forces the physics pass to run even when the layout looks still, which
    // is how a resized stage gets its nodes back on screen.
    let settleFrames = 0;

    const wake = (): void => {
      calmFrames = 0;
      if (asleep && running) {
        asleep = false;
        frame = requestAnimationFrame(step);
      }
    };
    wakeRef.current = wake;

    const resize = (): void => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width === 0 || height === 0) return;

      const previous = sizeRef.current;
      sizeRef.current = { width, height };

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      if (previous.width > 0 && (previous.width !== width || previous.height !== height)) {
        const shiftX = (width - previous.width) / 2;
        const shiftY = (height - previous.height) / 2;

        for (const node of nodesRef.current) {
          if (Number.isNaN(node.x)) continue;
          const margin = node.radius + 6;
          node.x = Math.max(margin, Math.min(width - margin, node.x + shiftX));
          node.y = Math.max(margin, Math.min(height - margin, node.y + shiftY));
        }
      }

      settleFrames = 90;
      wakeRef.current?.();
    };

    resize();
    const observer = new ResizeObserver(resize);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    const themeWatcher = new MutationObserver(() => {
      paletteRef.current = readPalette(document.documentElement);
    });
    themeWatcher.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const step = (time: number): void => {
      if (!running) return;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const palette = paletteRef.current;
      const { width, height } = sizeRef.current;
      if (!palette || width === 0) {
        frame = requestAnimationFrame(step);
        return;
      }

      const centreX = width / 2;
      const centreY = height / 2;

      let energy = 0;
      for (const node of nodes) energy += node.vx * node.vx + node.vy * node.vy;
      for (const edge of edges) {
        const target = edge.state === "cleared" ? 0 : 1;
        energy += Math.abs(target - edge.alpha);
      }
      for (const node of nodes) energy += 1 - node.alpha;

      if (settleFrames > 0) settleFrames -= 1;
      const stirring = energy > 0.05 || dragRef.current !== null || settleFrames > 0;
      calmFrames = stirring ? 0 : calmFrames + 1;

      const span = Math.min(width, height);
      const rest = Math.max(96, (span / Math.sqrt(nodes.length + 2)) * 0.92);
      const ring = span * 0.3;
      for (const node of nodes) {
        if (!Number.isNaN(node.x)) continue;
        const angle = (node.seat / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
        node.x = centreX + Math.cos(angle) * ring;
        node.y = centreY + Math.sin(angle) * ring;
      }

      // ── Forces ────────────────────────────────────────────
      // Repulsion is O(n²); at the group sizes this app deals with that is
      // cheaper than building a quadtree every frame. It is skipped entirely
      // once the layout has settled.
      if (stirring) for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i]!;
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j]!;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          if (distance < 0.01) {
            // Perfectly coincident nodes have no direction to separate along.
            dx = (Math.random() - 0.5) * 0.1;
            dy = (Math.random() - 0.5) * 0.1;
            distance = 0.1;
          }
          const push = (a.radius + b.radius + rest * 0.42) / distance;
          if (push > 1) {
            const force = (push - 1) * 1.15;
            const ux = dx / distance;
            const uy = dy / distance;
            a.vx -= ux * force;
            a.vy -= uy * force;
            b.vx += ux * force;
            b.vy += uy * force;
          }
        }
      }

      if (stirring) for (const edge of edges) {
        if (edge.alpha < 0.05) continue;
        const a = nodes[edge.from]!;
        const b = nodes[edge.to]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const force = (distance - rest) * 0.0021 * edge.alpha;
        const ux = dx / distance;
        const uy = dy / distance;
        a.vx += ux * force;
        a.vy += uy * force;
        b.vx -= ux * force;
        b.vy -= uy * force;
      }

      const drag = dragRef.current;
      if (stirring) for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]!;
        node.vx += (centreX - node.x) * 0.0022;
        node.vy += (centreY - node.y) * 0.0022;
        node.vx *= 0.86;
        node.vy *= 0.86;

        if (!drag || drag.node !== i) {
          node.x += node.vx;
          node.y += node.vy;
        }
        node.alpha += (1 - node.alpha) * 0.12;
      }

      if (stirring) for (const edge of edges) {
        const target = edge.state === "cleared" ? 0 : 1;
        edge.alpha += (target - edge.alpha) * 0.09;
      }

      // ── Paint ─────────────────────────────────────────────
      context.clearRect(0, 0, width, height);

      const selectedIndex = selectedRef.current
        ? indexRef.current.get(selectedRef.current) ?? null
        : null;
      const focus = selectedIndex ?? hoverRef.current;

      for (const edge of edges) {
        if (edge.alpha < 0.02) continue;
        const a = nodes[edge.from]!;
        const b = nodes[edge.to]!;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        // Opposing obligations bow apart so both stay readable.
        const bend = Math.min(46, distance * 0.16) * (edge.from < edge.to ? 1 : -1);
        const cx = (a.x + b.x) / 2 + (-dy / distance) * bend;
        const cy = (a.y + b.y) / 2 + (dx / distance) * bend;

        const involved = focus === null || edge.from === focus || edge.to === focus;
        const stroke =
          edge.state === "new"
            ? palette.edgeNew
            : edge.state === "reduced"
              ? palette.edgeReduced
              : palette.edge;

        context.globalAlpha = edge.alpha * (involved ? 0.95 : 0.18);
        context.strokeStyle = stroke;
        context.lineWidth = edge.width;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo(cx, cy, b.x, b.y);
        context.stroke();

        // Money in motion: particles run debtor → creditor along the curve.
        if (!quietRef.current && !reduceMotion && edge.state !== "cleared" && involved) {
          const count = 1 + Math.min(3, Math.floor(edge.width));
          const speed = 0.00013;
          for (let i = 0; i < count; i += 1) {
            const t = ((time * speed + i / count) % 1 + 1) % 1;
            const px = bezier(a.x, cx, b.x, t);
            const py = bezier(a.y, cy, b.y, t);
            context.globalAlpha = edge.alpha * (1 - Math.abs(t - 0.5) * 1.2) * 0.9;
            context.fillStyle = stroke;
            context.beginPath();
            context.arc(px, py, edge.width * 0.55 + 0.7, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      context.globalAlpha = 1;

      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i]!;
        const isFocus = focus === i;
        const tone =
          node.net > 0 ? palette.credit : node.net < 0 ? palette.debit : palette.neutral;

        context.globalAlpha = node.alpha * (focus === null || isFocus ? 1 : 0.32);

        // A bone-white plate under a hairline stroke: a plotted specimen, not a
        // button. The system forbids shadows, so selection is a concentric ring.
        context.fillStyle = palette.plate;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();

        context.strokeStyle = tone;
        context.lineWidth = 1;
        context.stroke();

        // Filled centre marks a creditor; a debtor stays hollow. Larger nodes
        // carry initials instead, so the dot would only collide with them.
        if (node.net > 0 && node.radius <= 13) {
          context.fillStyle = tone;
          context.beginPath();
          context.arc(node.x, node.y, Math.max(1.8, node.radius * 0.3), 0, Math.PI * 2);
          context.fill();
        }

        if (isFocus) {
          context.strokeStyle = tone;
          context.lineWidth = 1;
          context.setLineDash([2, 3]);
          context.beginPath();
          context.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        }

        if (node.radius > 13) {
          context.fillStyle = palette.ink;
          context.font = `600 ${Math.round(node.radius * 0.72)}px Inter, system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y);
        }

        context.fillStyle = isFocus ? palette.ink : palette.inkSoft;
        context.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(node.label, node.x, node.y + node.radius + 6);
      }

      context.globalAlpha = 1;

      if (!stirring && (reduceMotion || quietRef.current) && calmFrames > 30) {
        asleep = true;
        return;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);

    // A hidden tab should cost nothing at all.
    const onVisibility = (): void => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        asleep = true;
      } else {
        wake();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ── Pointer ─────────────────────────────────────────────
    const pick = (event: PointerEvent): number | null => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const nodes = nodesRef.current;
      for (let i = nodes.length - 1; i >= 0; i -= 1) {
        const node = nodes[i]!;
        if (Math.hypot(node.x - x, node.y - y) <= node.radius + 6) return i;
      }
      return null;
    };

    const onPointerDown = (event: PointerEvent): void => {
      wake();
      const hit = pick(event);
      if (hit === null) {
        onSelect?.(null);
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const node = nodesRef.current[hit]!;
      dragRef.current = {
        node: hit,
        dx: node.x - (event.clientX - rect.left),
        dy: node.y - (event.clientY - rect.top),
      };
      canvas.setPointerCapture(event.pointerId);
      onSelect?.(node.id);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const drag = dragRef.current;
      if (drag) {
        const node = nodesRef.current[drag.node];
        if (node) {
          node.x = event.clientX - rect.left + drag.dx;
          node.y = event.clientY - rect.top + drag.dy;
          node.vx = 0;
          node.vy = 0;
        }
        return;
      }
      hoverRef.current = pick(event);
      canvas.style.cursor = hoverRef.current === null ? "default" : "grab";
    };

    const onPointerUp = (event: PointerEvent): void => {
      dragRef.current = null;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onPointerCancel = (event: PointerEvent): void => {
      onPointerUp(event);
    };

    const onPointerLeave = (): void => {
      hoverRef.current = null;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerCancel);
    canvas.addEventListener("lostpointercapture", onPointerCancel);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      running = false;
      wakeRef.current = null;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      observer.disconnect();
      themeWatcher.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerCancel);
      canvas.removeEventListener("lostpointercapture", onPointerCancel);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [onSelect]);

  return <canvas ref={canvasRef} className={`block h-full w-full touch-none ${className}`} />;
}

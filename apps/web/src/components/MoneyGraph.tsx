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

/** What the plan on screen means for one party when someone cannot pay. */
export interface PartyFate {
  failed: boolean;
  /** Order it fails in. Later waves are revealed later. */
  wave: number;
  /** Would have failed as owed, and does not under this plan. */
  saved: boolean;
  /** Would have survived as owed, and does not under this plan. */
  sunk: boolean;
}

export interface GraphParty {
  id: string;
  label: string;
  /** Positive = owed money, negative = owes money. Minor units. */
  net: number;
  /** Where the party belongs across the stage, 0 to 1. Omit for a free layout. */
  lane?: number;
  fate?: PartyFate;
}

export interface GraphObligation {
  from: string;
  to: string;
  amount: number;
  state: EdgeState;
  /** Share of this obligation that will not be paid, 0 to 1. */
  unpaid?: number;
}

/** Room to leave clear at each edge, for panels that float over the stage. */
export interface StageInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface MoneyGraphProps {
  parties: GraphParty[];
  obligations: GraphObligation[];
  /** Pauses particle flow — used while a network is loading. */
  quiet?: boolean;
  onSelect?: (partyId: string | null) => void;
  selected?: string | null;
  /** Names for the lanes, drawn as axis labels. */
  laneLabels?: string[];
  inset?: StageInset;
  /** Change this to play the cascade again from the first wave. */
  replay?: number;
  className?: string;
}

interface Node {
  id: string;
  label: string;
  net: number;
  /** Position on the seeding ring, used until the force layout takes over. */
  seat: number;
  lane: number | null;
  /** Position within its lane, for seeding. */
  laneSeat: number;
  laneSize: number;
  /** True when the whole label fits on the plate and need not sit below it. */
  inside: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Plate radius on a roomy stage. */
  size: number;
  /** Plate radius as drawn, after fitting to the stage it is actually on. */
  radius: number;
  /** Eases in so nodes do not pop when a network changes. */
  alpha: number;
  fate: PartyFate | null;
  /** 0 standing, 1 fallen. Eases toward the fate once its wave is due. */
  fall: number;
  /** When this party's wave reaches it, on the animation clock. */
  fallsAt: number;
  /** A ring that spreads from a party at the moment it falls. */
  pulse: number;
}

interface Edge {
  from: number;
  to: number;
  amount: number;
  state: EdgeState;
  unpaid: number;
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
  saved: string;
}

/** Gap between one wave of failures and the next, so the cascade can be read. */
const WAVE_MS = 420;
const NO_INSET: StageInset = { top: 0, right: 0, bottom: 0, left: 0 };

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
    saved: read("--graph-saved", "#85c093"),
  };
}

/**
 * Decides the order of parties within each lane.
 *
 * Left alone, parties sit in whatever order they arrived and the obligations
 * between lanes cross each other more than they need to. Sorting each lane by
 * where its parties' counterparties sit in the other lanes, and repeating in
 * both directions until it settles, is the standard way to untangle a layered
 * drawing. It cannot remove every crossing, but it removes the gratuitous ones.
 */
function seatLanes(
  parties: readonly GraphParty[],
  obligations: readonly GraphObligation[]
): Map<string, number> {
  const laneOf = new Map<string, number>();
  const lanes = new Map<number, string[]>();
  for (const party of parties) {
    if (party.lane === undefined) continue;
    laneOf.set(party.id, party.lane);
    const members = lanes.get(party.lane);
    if (members) members.push(party.id);
    else lanes.set(party.lane, [party.id]);
  }

  // Counterparties in other lanes. Same-lane obligations say nothing about
  // which end of the lane a party belongs at.
  const across = new Map<string, string[]>();
  const link = (party: string, other: string): void => {
    const known = across.get(party);
    if (known) known.push(other);
    else across.set(party, [other]);
  };
  for (const { from, to } of obligations) {
    const a = laneOf.get(from);
    const b = laneOf.get(to);
    if (a === undefined || b === undefined || a === b) continue;
    link(from, to);
    link(to, from);
  }

  // Where each party sits along its lane, 0 to 1.
  const along = new Map<string, number>();
  const place = (members: string[]): void => {
    members.forEach((id, i) => along.set(id, members.length > 1 ? i / (members.length - 1) : 0.5));
  };
  for (const members of lanes.values()) place(members);

  const order = [...lanes.keys()].sort((a, b) => a - b);
  for (let sweep = 0; sweep < 8; sweep += 1) {
    const pass = sweep % 2 === 0 ? order : [...order].reverse();
    for (const lane of pass) {
      const members = lanes.get(lane)!;
      const scored = members.map((id, i) => {
        const others = across.get(id);
        if (!others || others.length === 0) return { id, i, pull: along.get(id)! };
        let sum = 0;
        for (const other of others) sum += along.get(other)!;
        return { id, i, pull: sum / others.length };
      });
      scored.sort((a, b) => a.pull - b.pull || a.i - b.i);
      const sorted = scored.map((item) => item.id);
      lanes.set(lane, sorted);
      place(sorted);
    }
  }

  const seats = new Map<string, number>();
  for (const members of lanes.values()) members.forEach((id, i) => seats.set(id, i));
  return seats;
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
  laneLabels,
  inset = NO_INSET,
  replay = 0,
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
  const insetRef = useRef<StageInset>(inset);
  const laneLabelsRef = useRef<string[] | undefined>(laneLabels);
  const wakeRef = useRef<(() => void) | null>(null);
  const replayRef = useRef(replay);
  const seatsRef = useRef<{ key: string; seats: Map<string, number> } | null>(null);

  // Mirrored into refs so the animation loop can read the latest values
  // without being torn down and rebuilt on every prop change.
  useEffect(() => {
    selectedRef.current = selected;
    wakeRef.current?.();
  }, [selected]);

  useEffect(() => {
    quietRef.current = quiet;
  }, [quiet]);

  useEffect(() => {
    laneLabelsRef.current = laneLabels;
  }, [laneLabels]);

  const { top, right, bottom, left } = inset;
  useEffect(() => {
    insetRef.current = { top, right, bottom, left };
    wakeRef.current?.();
  }, [top, right, bottom, left]);

  // Rebuild the simulation when the network changes, keeping positions for
  // parties that already exist so the layout does not jump between modes.
  useEffect(() => {
    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const index = new Map<string, number>();
    const now = performance.now();
    const replaying = replayRef.current !== replay;
    replayRef.current = replay;

    const largest = Math.max(1, ...parties.map((party) => Math.abs(party.net)));
    // A crowded stage needs smaller plates or they start to touch.
    const scale = parties.length > 40 ? 0.62 : parties.length > 14 ? 0.78 : 1;
    // Short codes can be written on the plate itself. That needs a plate big
    // enough to hold three characters, so the smallest ones grow a little.
    const coded = parties.length > 14 && parties.length <= 40 && parties.every((party) => party.label.length <= 3);

    const laneCount = new Map<number, number>();
    for (const party of parties) {
      if (party.lane !== undefined) laneCount.set(party.lane, (laneCount.get(party.lane) ?? 0) + 1);
    }

    // Seats are worked out once per network and then kept. Changing the plan
    // changes which obligations exist, and re-sorting on that would shuffle
    // every column each time a mode was picked.
    const membership = parties.map((party) => party.id).join("\u0000");
    if (seatsRef.current?.key !== membership) {
      seatsRef.current = { key: membership, seats: seatLanes(parties, obligations) };
    }
    const seats = seatsRef.current.seats;

    const nodes: Node[] = parties.map((party, i) => {
      const kept = previous.get(party.id);
      const weight = Math.abs(party.net) / largest;
      const fate = party.fate ?? null;
      const failed = fate?.failed ?? false;
      const laneSeat = seats.get(party.id) ?? 0;

      // A party already down stays down across a mode change. One that has
      // just been brought down waits for its wave, so the order reads.
      const alreadyDown = (kept?.fall ?? 0) > 0.5 && !replaying;
      const wave = Math.max(1, fate?.wave ?? 1);

      return {
        id: party.id,
        label: party.label,
        net: party.net,
        seat: i,
        lane: party.lane ?? null,
        laneSeat,
        laneSize: party.lane !== undefined ? laneCount.get(party.lane) ?? 1 : 1,
        x: kept?.x ?? Number.NaN,
        y: kept?.y ?? Number.NaN,
        vx: kept?.vx ?? 0,
        vy: kept?.vy ?? 0,
        size: coded ? 11.5 + Math.sqrt(weight) * 9 : (10 + Math.sqrt(weight) * 15) * scale,
        radius: kept?.radius ?? 0,
        inside: coded,
        alpha: kept?.alpha ?? 0,
        fate,
        fall: replaying ? 0 : kept?.fall ?? 0,
        fallsAt: failed && !alreadyDown ? now + 160 + (wave - 1) * WAVE_MS : now,
        pulse: kept?.pulse ?? 0,
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
        unpaid: item.unpaid ?? 0,
        alpha: item.state === "new" ? 0 : 1,
        width: 0.7 + Math.sqrt(item.amount / heaviest) * 1.9,
      });
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;
    indexRef.current = index;
    wakeRef.current?.();
  }, [parties, obligations, replay]);

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
    let lastFrame = 0;

    const wake = (): void => {
      calmFrames = 0;
      settleFrames = Math.max(settleFrames, 30);
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
      wakeRef.current?.();
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

      // The stage is whatever the floating panels leave uncovered.
      const pad = insetRef.current;
      const stageLeft = Math.min(pad.left, width * 0.4);
      const stageTop = Math.min(pad.top, height * 0.4);
      const stageWidth = Math.max(160, width - stageLeft - Math.min(pad.right, width * 0.4));
      const stageHeight = Math.max(160, height - stageTop - Math.min(pad.bottom, height * 0.4));
      const centreX = stageLeft + stageWidth / 2;
      const centreY = stageTop + stageHeight / 2;

      // Plates shrink on a small stage, so a crowded network still has air
      // in it on a phone.
      const fit = Math.max(
        0.6,
        Math.min(1, Math.sqrt((stageWidth * stageHeight) / (Math.max(1, nodes.length) * 5200)))
      );
      for (const node of nodes) node.radius = node.size * fit;

      // Lanes run across the stage when it is wide and down it when it is
      // tall, so a supply chain reads the same way on a phone.
      const laned = nodes.some((node) => node.lane !== null);
      const across = stageWidth >= stageHeight * 0.9;
      const laneMargin = across ? 44 : 40;
      const laneAt = (lane: number): number =>
        across
          ? stageLeft + laneMargin + lane * (stageWidth - laneMargin * 2)
          : stageTop + laneMargin + lane * (stageHeight - laneMargin * 2);

      // ── Failures, one wave at a time ──────────────────────
      // Eased by elapsed time rather than per frame. A browser that throttles
      // a background tab to a frame a second would otherwise leave the
      // cascade hanging half-drawn until the tab was looked at again.
      const elapsed = lastFrame === 0 ? 16 : Math.min(400, time - lastFrame);
      lastFrame = time;
      const ease = 1 - Math.exp(-elapsed / 95);
      const fade = Math.exp(-elapsed / 230);

      let falling = 0;
      for (const node of nodes) {
        const target = node.fate?.failed ? 1 : 0;
        if (reduceMotion) {
          node.fall = target;
          node.pulse = 0;
          continue;
        }
        if (target === 1 && time < node.fallsAt) {
          falling += 1;
          continue;
        }
        const before = node.fall;
        node.fall += (target - node.fall) * ease;
        if (Math.abs(target - node.fall) < 0.004) node.fall = target;
        if (target === 1 && before < 0.08 && node.fall >= 0.08) node.pulse = 1;
        node.pulse *= fade;
        if (node.pulse < 0.02) node.pulse = 0;
        falling += Math.abs(target - node.fall) + node.pulse;
      }

      let energy = falling;
      for (const node of nodes) energy += node.vx * node.vx + node.vy * node.vy;
      for (const edge of edges) {
        const target = edge.state === "cleared" ? 0 : 1;
        energy += Math.abs(target - edge.alpha);
      }
      for (const node of nodes) energy += 1 - node.alpha;

      if (settleFrames > 0) settleFrames -= 1;
      const stirring = energy > 0.05 || dragRef.current !== null || settleFrames > 0;
      calmFrames = stirring ? 0 : calmFrames + 1;

      const span = Math.min(stageWidth, stageHeight);
      const rest = Math.max(laned ? 64 : 96, (span / Math.sqrt(nodes.length + 2)) * 0.92);
      // Breathing room between plates. Lanes pack parties in single file, so
      // they are given less of it than a free layout.
      const gap = laned ? 12 : rest * 0.42;
      const ring = span * 0.3;

      // Where a party in a lane belongs: its lane across the stage, and its
      // seat along it. A lane with more parties than fit in single file is
      // dealt into two ranks, alternating.
      const seatOf = (node: Node): [number, number] => {
        const spread = (across ? stageHeight : stageWidth) * 0.86;
        const middle = across ? centreY : centreX;
        const along = middle + ((node.laneSeat + 0.5) / node.laneSize - 0.5) * spread;
        const tight = spread / node.laneSize < node.radius * 2 + gap;
        const rank = tight ? (node.laneSeat % 2 === 0 ? -1 : 1) * (node.radius + 2) : 0;
        const lane = laneAt(node.lane ?? 0) + rank;
        return across ? [lane, along] : [along, lane];
      };

      for (const node of nodes) {
        if (!Number.isNaN(node.x)) continue;
        if (node.lane !== null) {
          [node.x, node.y] = seatOf(node);
          continue;
        }
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
          const push = (a.radius + b.radius + gap) / distance;
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

      // In lanes every party has a seat, and springs would only pull the
      // columns out of true.
      if (stirring && !laned) for (const edge of edges) {
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
        if (node.lane !== null) {
          const [seatX, seatY] = seatOf(node);
          node.vx += (seatX - node.x) * 0.03;
          node.vy += (seatY - node.y) * 0.03;
        } else {
          node.vx += (centreX - node.x) * 0.0022;
          node.vy += (centreY - node.y) * 0.0022;
        }
        node.vx *= 0.86;
        node.vy *= 0.86;

        if (!drag || drag.node !== i) {
          node.x += node.vx;
          node.y += node.vy;
          // Nothing drifts under a panel or off the stage.
          const margin = node.radius + 4;
          const floor = stageTop + stageHeight - margin - 14;
          if (node.x < stageLeft + margin) node.x = stageLeft + margin;
          if (node.x > stageLeft + stageWidth - margin) node.x = stageLeft + stageWidth - margin;
          if (node.y < stageTop + margin) node.y = stageTop + margin;
          if (node.y > floor) node.y = floor;
        }
        node.alpha += (1 - node.alpha) * 0.12;
      }

      if (stirring) for (const edge of edges) {
        const target = edge.state === "cleared" ? 0 : 1;
        edge.alpha += (target - edge.alpha) * 0.09;
      }

      // ── Paint ─────────────────────────────────────────────
      context.clearRect(0, 0, width, height);

      const labels = laneLabelsRef.current;
      if (laned && labels && labels.length > 1) {
        context.globalAlpha = 1;
        context.fillStyle = palette.inkSoft;
        context.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
        context.textBaseline = "top";
        for (let i = 0; i < labels.length; i += 1) {
          const position = laneAt(i / (labels.length - 1));
          const text = `[ ${labels[i]!.toUpperCase().split("").join(" ")} ]`;
          if (across) {
            context.textAlign = "center";
            context.fillText(text, position, stageTop + 2);
          } else {
            context.textAlign = "left";
            context.fillText(text, stageLeft + 6, position - 30);
          }
        }
      }

      const selectedIndex = selectedRef.current
        ? indexRef.current.get(selectedRef.current) ?? null
        : null;
      const focus = selectedIndex ?? hoverRef.current;
      // On a crowded stage, names only appear where attention is.
      const crowded = nodes.length > 40;

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

        // Money a fallen party owes is drawn as a broken line: it is still
        // owed, and it is not coming.
        const broken = edge.unpaid > 0.02 ? a.fall : 0;
        const dense = edges.length > 60 && focus === null ? 0.5 : 0.95;

        context.globalAlpha = edge.alpha * (involved ? dense : 0.12) * (1 - broken * 0.3);
        context.strokeStyle = stroke;
        context.lineWidth = edge.width;
        if (broken > 0.5) context.setLineDash([2, 4]);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.quadraticCurveTo(cx, cy, b.x, b.y);
        context.stroke();
        if (broken > 0.5) context.setLineDash([]);

        // Money in motion: particles run debtor → creditor along the curve,
        // thinned by however much of it will not arrive.
        const arriving = 1 - edge.unpaid * broken;
        if (
          !quietRef.current &&
          !reduceMotion &&
          edge.state !== "cleared" &&
          involved &&
          arriving > 0.05
        ) {
          const count = Math.max(1, Math.round((1 + Math.min(3, Math.floor(edge.width))) * arriving));
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
        const visible = node.alpha * (focus === null || isFocus ? 1 : 0.32);

        // A bone-white plate under a hairline stroke: a plotted specimen, not a
        // button. The system forbids shadows, so selection is a concentric ring.
        context.globalAlpha = visible;
        context.fillStyle = palette.plate;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.fill();

        // A fallen party is the same plate inked in. No new colour: failure
        // is shown as the absence of light, which keeps the one alarm hue
        // meaning one thing.
        if (node.fall > 0.01) {
          context.globalAlpha = visible * node.fall;
          context.fillStyle = palette.ink;
          context.beginPath();
          context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          context.fill();
        }

        context.globalAlpha = visible;
        context.strokeStyle = node.fall > 0.5 ? palette.ink : tone;
        context.lineWidth = 1;
        context.beginPath();
        context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        context.stroke();

        if (node.pulse > 0) {
          context.globalAlpha = visible * node.pulse * 0.55;
          context.strokeStyle = palette.ink;
          context.lineWidth = 1;
          context.beginPath();
          context.arc(node.x, node.y, node.radius + (1 - node.pulse) * 26, 0, Math.PI * 2);
          context.stroke();
        }

        // What this plan did to the party, relative to leaving things alone.
        // Moss for a rescue. The alarm hue for a party the plan itself sank,
        // which is the same kind of harm as being handed a stranger.
        const sunk = node.fate?.sunk ? node.fall : 0;
        if (node.fate?.saved || sunk > 0.05) {
          context.globalAlpha = visible * (node.fate?.saved ? 1 : sunk);
          context.strokeStyle = node.fate?.saved ? palette.saved : palette.edgeNew;
          context.lineWidth = 2;
          context.beginPath();
          context.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
          context.stroke();
        }

        context.globalAlpha = visible;

        // Filled centre marks a creditor; a debtor stays hollow. Larger nodes
        // carry initials instead, so the dot would only collide with them.
        if (node.net > 0 && node.radius <= 13 && node.fall < 0.5 && !node.inside) {
          context.fillStyle = tone;
          context.beginPath();
          context.arc(node.x, node.y, Math.max(1.8, node.radius * 0.3), 0, Math.PI * 2);
          context.fill();
        }

        if (isFocus) {
          context.strokeStyle = node.fall > 0.5 ? palette.ink : tone;
          context.lineWidth = 1;
          context.setLineDash([2, 3]);
          context.beginPath();
          context.arc(node.x, node.y, node.radius + 8.5, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        }

        if (node.inside) {
          const size = node.radius * (node.label.length > 2 ? 0.62 : 0.74);
          context.fillStyle = node.fall > 0.5 ? palette.plate : palette.ink;
          context.font = `600 ${Math.max(8, Math.round(size))}px Inter, system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(node.label, node.x, node.y + 0.5);
        } else if (node.radius > 13) {
          context.fillStyle = node.fall > 0.5 ? palette.plate : palette.ink;
          context.font = `600 ${Math.round(node.radius * 0.72)}px Inter, system-ui, sans-serif`;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(node.label.slice(0, 2).toUpperCase(), node.x, node.y);
        }

        if (!node.inside && (!crowded || isFocus)) {
          context.fillStyle = isFocus ? palette.ink : palette.inkSoft;
          context.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
          context.textAlign = "center";
          context.textBaseline = "top";
          context.fillText(node.label, node.x, node.y + node.radius + 6);
        }
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
      const hit = pick(event);
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        wake();
      }
      canvas.style.cursor = hit === null ? "default" : "grab";
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

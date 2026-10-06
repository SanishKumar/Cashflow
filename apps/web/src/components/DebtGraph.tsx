// ──────────────────────────────────────────────
// Debt Network Graph — v2.1 with data sync fix
// ──────────────────────────────────────────────

import { Fragment, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
  MarkerType,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Settlement, GroupMember } from "../types/index";
import { useMedia } from "../hooks/useMedia";

interface DebtGraphProps {
  settlements: Settlement[];
  members: GroupMember[];
  currency: string;
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Custom Node ────────────────────────────────

const HANDLE = "!bg-primary !border-surface-container !w-2.5 !h-2.5 !rounded-full";

const SIDES = [
  { side: "top", position: Position.Top },
  { side: "right", position: Position.Right },
  { side: "bottom", position: Position.Bottom },
  { side: "left", position: Position.Left },
] as const;

type Side = (typeof SIDES)[number]["side"];

/** The side of a card that faces another, and the side of the other that faces back. */
function facing(from: { x: number; y: number }, to: { x: number; y: number }): [Side, Side] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? ["right", "left"] : ["left", "right"];
  return dy > 0 ? ["bottom", "top"] : ["top", "bottom"];
}

interface NodeData {
  label: string;
  initials: string;
  netExposure: number;
  colorIndex: number;
  currency: string;
  [key: string]: unknown;
}

function EntityNode({ data }: NodeProps<Node<NodeData>>) {
  const isPositive = data.netExposure > 0.01;
  const isNegative = data.netExposure < -0.01;
  
  const formattedExposure = new Intl.NumberFormat('en-US', { style: 'currency', currency: data.currency }).format(Math.abs(data.netExposure));

  return (
    <div className="glass-panel p-4 w-[200px] cursor-grab active:cursor-grabbing hover:border-outline transition-colors">
      {/* A way in and a way out on every side, so a debt can leave from the
          side that faces whoever it is owed to. */}
      {SIDES.map(({ side, position }) => (
        <Fragment key={side}>
          <Handle id={`in-${side}`} type="target" position={position} className={HANDLE} />
          <Handle id={`out-${side}`} type="source" position={position} className={HANDLE} />
        </Fragment>
      ))}

      <div className="flex items-center gap-3 mb-3">
        <div className={`avatar avatar-md avatar-${data.colorIndex % 6}`}>
          {data.initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-on-surface truncate">{data.label}</div>
        </div>
      </div>

      <div className="pt-2 border-t border-glass-border">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-on-surface-variant font-medium uppercase">Net</span>
          <span className={`text-data font-bold ${isPositive ? "text-positive" : isNegative ? "text-negative" : "text-neutral"}`}>
            {isPositive ? "+" : isNegative ? "-" : ""}{formattedExposure}
          </span>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = { entity: EntityNode };

function computeLayout(count: number) {
  const radius = Math.max(180, count * 55);
  const cx = 400, cy = 300;
  return (i: number) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
}

// ── Main Component ─────────────────────────────

export function DebtGraph({ settlements, members, currency }: DebtGraphProps) {
  const netExposure = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) map.set(m.userId, 0);
    for (const s of settlements) {
      map.set(s.to, (map.get(s.to) ?? 0) + s.amount);
      map.set(s.from, (map.get(s.from) ?? 0) - s.amount);
    }
    return map;
  }, [settlements, members]);

  const getPos = useMemo(() => computeLayout(members.length), [members.length]);

  const builtNodes: Node<NodeData>[] = useMemo(() =>
    members.map((m, i) => ({
      id: m.userId,
      type: "entity",
      position: getPos(i),
      data: {
        label: m.user.name,
        initials: getInitials(m.user.name),
        netExposure: netExposure.get(m.userId) ?? 0,
        colorIndex: i,
        currency,
      },
    })),
    [members, getPos, netExposure, currency]
  );

  const builtEdges: Edge[] = useMemo(() => {
    const seats = new Map(members.map((m, i) => [m.userId, getPos(i)]));

    return settlements.map((s, i) => {
      const from = seats.get(s.from);
      const to = seats.get(s.to);
      const [out, into] = from && to ? facing(from, to) : (["bottom", "top"] as const);

      return {
        id: `e-${i}`,
        source: s.from,
        target: s.to,
        sourceHandle: `out-${out}`,
        targetHandle: `in-${into}`,
        animated: true,
        label: new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(s.amount),
        labelStyle: { fill: "var(--color-on-surface)", fontFamily: "ui-monospace, Cascadia Code, Consolas, monospace", fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: "var(--color-surface-container)", stroke: "var(--color-outline-variant)", strokeWidth: 1, rx: 6, ry: 6 },
        labelBgPadding: [8, 4] as [number, number],
        style: { stroke: s.amount > 500 ? "var(--color-tertiary)" : "var(--color-primary)", strokeWidth: Math.max(1.5, Math.min(3, s.amount / 300)) },
        markerEnd: { type: MarkerType.ArrowClosed, color: s.amount > 500 ? "var(--color-tertiary)" : "var(--color-primary)", width: 18, height: 18 },
      };
    });
  }, [settlements, members, getPos, currency]);

  // FIX: Sync state when props change — useNodesState initial value is only read once
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => { setNodes(builtNodes); }, [builtNodes, setNodes]);
  useEffect(() => { setEdges(builtEdges); }, [builtEdges, setEdges]);

  // The map only fits itself once, on load. Its region changes size whenever
  // the balances are folded away or brought back, and without a refit that
  // leaves the nodes parked off screen.
  const wrapper = useRef<HTMLDivElement>(null);
  const flow = useRef<ReactFlowInstance<Node<NodeData>, Edge> | null>(null);
  const settled = settlements.length === 0 && members.length > 0;
  // A phone has no width to spend on margins.
  const padding = useMedia("(max-width: 767px)") ? 0.12 : 0.3;

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void flow.current?.fitView({ padding });
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [settled, padding]);

  if (settled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-glow-secondary flex items-center justify-center">
          <span className="material-symbols-outlined text-secondary text-[32px]">check_circle</span>
        </div>
        <p className="text-[14px] font-medium text-on-surface">All settled!</p>
        <p className="text-[13px] text-on-surface-variant">No outstanding debts in this group.</p>
      </div>
    );
  }

  return (
    <div ref={wrapper} className="flex-1 min-h-0 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={(instance) => { flow.current = instance; }}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.5} color="var(--color-outline-variant)" />
      </ReactFlow>

      {/* Stats Overlay. On a phone the balances sheet under the map carries
          the same totals, and the map needs the room more. */}
      <div className="absolute bottom-4 left-4 z-20 glass-panel-sm px-4 py-3 hidden md:flex gap-6">
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Settlements</div>
          <div className="text-data-lg text-on-surface">{settlements.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Total Flow</div>
          <div className="text-data-lg text-secondary">{new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(settlements.reduce((s, x) => s + x.amount, 0))}</div>
        </div>
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Nodes</div>
          <div className="text-data-lg text-on-surface">{members.length}</div>
        </div>
      </div>
    </div>
  );
}

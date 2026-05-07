// ──────────────────────────────────────────────
// Debt Network Graph — v2.1 with data sync fix
// ──────────────────────────────────────────────

import { useMemo, useEffect } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Settlement, GroupMember } from "../types/index";

interface DebtGraphProps {
  settlements: Settlement[];
  members: GroupMember[];
}

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ── Custom Node ────────────────────────────────

interface NodeData {
  label: string;
  initials: string;
  netExposure: number;
  colorIndex: number;
  [key: string]: unknown;
}

function EntityNode({ data }: NodeProps<Node<NodeData>>) {
  const isPositive = data.netExposure > 0.01;
  const isNegative = data.netExposure < -0.01;

  return (
    <div className="glass-panel p-4 w-[200px] cursor-grab active:cursor-grabbing hover:border-outline transition-colors">
      <Handle type="target" position={Position.Top} className="!bg-primary !border-surface-container !w-2.5 !h-2.5 !rounded-full" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !border-surface-container !w-2.5 !h-2.5 !rounded-full" />
      <Handle type="target" position={Position.Left} className="!bg-primary !border-surface-container !w-2.5 !h-2.5 !rounded-full" />
      <Handle type="source" position={Position.Right} className="!bg-primary !border-surface-container !w-2.5 !h-2.5 !rounded-full" />

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
            {isPositive ? "+" : isNegative ? "-" : ""}${Math.abs(data.netExposure).toFixed(2)}
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

export function DebtGraph({ settlements, members }: DebtGraphProps) {
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
      },
    })),
    [members, getPos, netExposure]
  );

  const builtEdges: Edge[] = useMemo(() =>
    settlements.map((s, i) => ({
      id: `e-${i}`,
      source: s.from,
      target: s.to,
      animated: true,
      label: `$${s.amount.toFixed(2)}`,
      labelStyle: { fill: "#e2e4f0", fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "#161821", stroke: "#353849", strokeWidth: 1, rx: 6, ry: 6 },
      labelBgPadding: [8, 4] as [number, number],
      style: { stroke: s.amount > 500 ? "#fb7185" : "#8b9cf7", strokeWidth: Math.max(1.5, Math.min(3, s.amount / 300)) },
      markerEnd: { type: MarkerType.ArrowClosed, color: s.amount > 500 ? "#fb7185" : "#8b9cf7", width: 18, height: 18 },
    })),
    [settlements]
  );

  // FIX: Sync state when props change — useNodesState initial value is only read once
  const [nodes, setNodes, onNodesChange] = useNodesState(builtNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(builtEdges);

  useEffect(() => { setNodes(builtNodes); }, [builtNodes, setNodes]);
  useEffect(() => { setEdges(builtEdges); }, [builtEdges, setEdges]);

  if (settlements.length === 0 && members.length > 0) {
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
    <div className="flex-1 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={0.5} color="#353849" />
      </ReactFlow>

      {/* Stats Overlay */}
      <div className="absolute bottom-4 left-4 z-20 glass-panel-sm px-4 py-3 flex gap-6">
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Settlements</div>
          <div className="text-data-lg text-on-surface">{settlements.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Total Flow</div>
          <div className="text-data-lg text-secondary">${settlements.reduce((s, x) => s + x.amount, 0).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[10px] text-on-surface-variant uppercase font-medium">Nodes</div>
          <div className="text-data-lg text-on-surface">{members.length}</div>
        </div>
      </div>
    </div>
  );
}

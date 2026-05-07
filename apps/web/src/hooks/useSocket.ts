// ──────────────────────────────────────────────
// useSocket — Real-time WebSocket hook
// ──────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { getSocket, joinGroup, leaveGroup } from "../lib/socket";
import type { Settlement, Transaction } from "../types/index";

interface UseSocketReturn {
  connected: boolean;
  latency: number;
  lastTransaction: Transaction | null;
  settlements: Settlement[];
}

/**
 * Manages WebSocket connection for a specific group.
 * Auto-joins room on mount, leaves on unmount.
 * Provides real-time settlement and transaction updates.
 */
export function useSocket(
  groupId: string | undefined,
  onSettlementsUpdate?: (settlements: Settlement[]) => void
): UseSocketReturn {
  const [connected, setConnected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [lastTransaction, setLastTransaction] = useState<Transaction | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const pingInterval = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (!groupId) return;

    const socket = getSocket();

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    const handleTransactionCreated = (data: {
      transaction: Transaction;
      settlements: Settlement[];
    }) => {
      setLastTransaction(data.transaction);
      setSettlements(data.settlements);
      onSettlementsUpdate?.(data.settlements);
    };

    const handleSettlementsUpdated = (newSettlements: Settlement[]) => {
      setSettlements(newSettlements);
      onSettlementsUpdate?.(newSettlements);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("transaction:created", handleTransactionCreated);
    socket.on("settlements:updated", handleSettlementsUpdated);

    // Join group room
    joinGroup(groupId);
    setConnected(socket.connected);

    // Measure latency
    pingInterval.current = setInterval(() => {
      const start = Date.now();
      socket.volatile.emit("group:join", groupId);
      setLatency(Date.now() - start);
    }, 5000);

    return () => {
      leaveGroup(groupId);
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("transaction:created", handleTransactionCreated);
      socket.off("settlements:updated", handleSettlementsUpdated);
      if (pingInterval.current) clearInterval(pingInterval.current);
    };
  }, [groupId, onSettlementsUpdate]);

  return { connected, latency, lastTransaction, settlements };
}

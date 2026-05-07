// ──────────────────────────────────────────────
// Debt Solver — TypeScript Fallback
// (Will be replaced by WASM solver in Phase 2)
// ──────────────────────────────────────────────
// This is a direct port of the original Max Heap algorithm
// from the legacy heap.js / script.js codebase.
// Mathematical integrity is preserved exactly.
// ──────────────────────────────────────────────

import type { DebtEdge, Settlement } from "../types/api.js";

/**
 * Max Binary Heap for [amount, userId] tuples.
 * Identical to the original BinaryHeap in heap.js,
 * ported to TypeScript with strict typing.
 */
class MaxHeap {
  private heap: [number, string][] = [];

  insert(value: [number, string]): void {
    this.heap.push(value);
    this.bubbleUp();
  }

  size(): number {
    return this.heap.length;
  }

  empty(): boolean {
    return this.size() === 0;
  }

  extractMax(): [number, string] {
    const max = this.heap[0];
    const last = this.heap.pop()!;
    if (!this.empty()) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return max;
  }

  private bubbleUp(): void {
    let index = this.size() - 1;

    while (index > 0) {
      const element = this.heap[index];
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];

      if (parent[0] >= element[0]) break;

      this.heap[index] = parent;
      this.heap[parentIndex] = element;
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const left = 2 * index + 1;
    const right = 2 * index + 2;
    let largest = index;
    const length = this.size();

    if (left < length && this.heap[left][0] > this.heap[largest][0]) {
      largest = left;
    }
    if (right < length && this.heap[right][0] > this.heap[largest][0]) {
      largest = right;
    }

    if (largest !== index) {
      const tmp = this.heap[largest];
      this.heap[largest] = this.heap[index];
      this.heap[index] = tmp;
      this.sinkDown(largest);
    }
  }
}

/**
 * Core debt minimization algorithm using Max Heaps.
 *
 * Algorithm (preserving original logic from script.js):
 * 1. Compute net balance for each person from all debt edges.
 * 2. Split into positive (creditors) and negative (debtors) heaps.
 * 3. Greedily match largest creditor with largest debtor.
 * 4. Settle min(credit, debt) and re-insert remainder.
 * 5. Repeat until both heaps are empty.
 *
 * Time complexity: O(N log N) where N = number of unique users.
 * This produces an optimal settlement with at most N-1 transactions.
 *
 * @param edges - Array of directed debt edges {from, to, amount}
 * @param userNames - Map of userId to display name (for output)
 * @returns Array of minimized settlements
 */
export function minimizeDebts(
  edges: DebtEdge[],
  userNames: Map<string, string>
): Settlement[] {
  if (edges.length === 0) return [];

  // Step 1: Compute net balance per user
  const balances = new Map<string, number>();

  for (const edge of edges) {
    balances.set(edge.to, (balances.get(edge.to) ?? 0) + edge.amount);
    balances.set(edge.from, (balances.get(edge.from) ?? 0) - edge.amount);
  }

  // Step 2: Split into creditor (positive) and debtor (negative) heaps
  const creditorHeap = new MaxHeap();
  const debtorHeap = new MaxHeap();

  for (const [userId, balance] of balances) {
    if (balance > 0) {
      creditorHeap.insert([balance, userId]);
    } else if (balance < 0) {
      debtorHeap.insert([-balance, userId]); // store as positive for max-heap
    }
  }

  // Step 3: Greedily match and settle
  const settlements: Settlement[] = [];
  const remainders = new Map<string, number>();

  // Initialize remainders from balances
  for (const [userId, balance] of balances) {
    remainders.set(userId, Math.abs(balance));
  }

  while (!creditorHeap.empty() && !debtorHeap.empty()) {
    const [creditAmt, creditorId] = creditorHeap.extractMax();
    const [debtAmt, debtorId] = debtorHeap.extractMax();

    const settleAmount = Math.min(creditAmt, debtAmt);

    settlements.push({
      from: debtorId,
      fromName: userNames.get(debtorId) ?? debtorId,
      to: creditorId,
      toName: userNames.get(creditorId) ?? creditorId,
      amount: Math.round(settleAmount * 100) / 100, // round to cents
    });

    // Update remainders
    const newCredit = creditAmt - settleAmount;
    const newDebt = debtAmt - settleAmount;

    remainders.set(creditorId, newCredit);
    remainders.set(debtorId, newDebt);

    if (newCredit > 0.01) {
      creditorHeap.insert([newCredit, creditorId]);
    }
    if (newDebt > 0.01) {
      debtorHeap.insert([newDebt, debtorId]);
    }
  }

  return settlements;
}

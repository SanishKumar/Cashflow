// ──────────────────────────────────────────────
// Shared Types (mirrors backend API types)
// ──────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  createdAt: string;
  members: GroupMember[];
  _count: { transactions: number };
}

export interface GroupMember {
  id: string;
  userId: string;
  role: "ADMIN" | "MEMBER" | "AUDITOR";
  joinedAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
}

export interface Transaction {
  id: string;
  groupId: string;
  paidById: string;
  paidBy: { id: string; name: string; email: string };
  amount: number;
  description: string;
  status: string;
  originalCurrency?: string | null;
  exchangeRate?: number | null;
  createdAt: string;
  debtShares: DebtShare[];
}

export interface DebtShare {
  id: string;
  owedById: string;
  owedBy: { id: string; name: string; email: string };
  amount: number;
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface UserBalance {
  userId: string;
  name: string;
  netBalance: number;
}

export interface GroupBalances {
  groupId: string;
  balances: UserBalance[];
  settlements: Settlement[];
  solver: {
    engine: "wasm" | "typescript";
    strategy: "exact" | "greedy";
    exact: boolean;
    activeBalances: number;
  };
}

export interface LedgerTransactionSummary {
  id: string;
  groupId: string;
  groupName: string;
  groupCurrency: string;
  amount: number;
  description: string;
  createdAt: string;
  paidBy: { id: string; name: string };
}

export type SettlementPaymentStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED";

export interface SettlementPayment {
  id: string;
  groupId: string;
  fromUserId: string;
  toUserId: string;
  fromUser: { id: string; name: string; email: string };
  toUser: { id: string; name: string; email: string };
  amount: number;
  currency: string;
  status: SettlementPaymentStatus;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  groupId: string | null;
  action: string;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; avatarUrl: string | null };
  group?: { id: string; name: string } | null;
}

export interface MonthlyVolume {
  month: string;
  volume: number;
}

export interface PendingSettlementGroup {
  groupId: string;
  groupName: string;
  pendingCount: number;
}

export interface DashboardGroupPreview {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  memberCount: number;
  expenseCount: number;
}

export interface DashboardSettlementAction {
  groupId: string;
  groupName: string;
  currency: string;
  fromUserId: string;
  fromName: string;
  toUserId: string;
  toName: string;
  amount: number;
  state: "OPEN" | "PENDING_CONFIRMATION";
}

export interface DashboardPendingConfirmation {
  id: string;
  groupId: string;
  groupName: string;
  fromUserId: string;
  fromName: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface DashboardStats {
  totalGroups: number;
  totalTransactions: number;
  pendingSettlements: number;
  pendingGroups: PendingSettlementGroup[];
  groups: DashboardGroupPreview[];
  outgoingSettlements: DashboardSettlementAction[];
  incomingSettlements: DashboardSettlementAction[];
  pendingConfirmations: DashboardPendingConfirmation[];
  recentActivity: AuditLogEntry[];
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  price: number;
}

export interface ReceiptData {
  vendor: string;
  date: string;
  total: number;
  subtotal?: number;
  tax?: number;
  tip?: number;
  currency: string;
  category: string;
  items: ReceiptItem[];
  confidence: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}


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
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

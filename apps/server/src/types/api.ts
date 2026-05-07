// ──────────────────────────────────────────────
// Shared TypeScript Interfaces for API Layer
// ──────────────────────────────────────────────

import { z } from "zod";

// ── Zod Validation Schemas ─────────────────────

export const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Invalid email format"),
  avatarUrl: z.string().url().optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(1, "Group name is required").max(100),
  description: z.string().max(500).optional(),
  memberIds: z.array(z.string()).optional(),
});

export const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export const AddMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export const CreateTransactionSchema = z.object({
  paidById: z.string().min(1, "Payer ID is required"),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required").max(500),
  shares: z
    .array(
      z.object({
        owedById: z.string().min(1),
        amount: z.number().positive(),
      })
    )
    .min(1, "At least one debt share is required"),
});

// ── TypeScript Types (derived from Zod) ────────

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;
export type AddMemberInput = z.infer<typeof AddMemberSchema>;
export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

// ── API Response Types ─────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// ── Settlement Types ───────────────────────────

export interface DebtEdge {
  from: string; // userId
  to: string; // userId
  amount: number;
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export interface GroupBalances {
  groupId: string;
  balances: UserBalance[];
  settlements: Settlement[];
}

export interface UserBalance {
  userId: string;
  name: string;
  netBalance: number; // positive = owed money, negative = owes money
}

// ── Socket Event Types ─────────────────────────

export interface ServerToClientEvents {
  "transaction:created": (data: {
    transaction: TransactionWithShares;
    settlements: Settlement[];
  }) => void;
  "settlements:updated": (settlements: Settlement[]) => void;
  "member:joined": (member: { userId: string; name: string }) => void;
  "member:left": (data: { userId: string }) => void;
}

export interface ClientToServerEvents {
  "group:join": (groupId: string) => void;
  "group:leave": (groupId: string) => void;
}

// ── Composite Types ────────────────────────────

export interface TransactionWithShares {
  id: string;
  groupId: string;
  paidById: string;
  paidBy: { id: string; name: string; email: string };
  amount: number;
  description: string;
  createdAt: Date;
  debtShares: {
    id: string;
    owedById: string;
    owedBy: { id: string; name: string; email: string };
    amount: number;
  }[];
}

export interface GroupWithMembers {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  members: {
    id: string;
    userId: string;
    joinedAt: Date;
    user: { id: string; name: string; email: string; avatarUrl: string | null };
  }[];
  _count: { transactions: number };
}

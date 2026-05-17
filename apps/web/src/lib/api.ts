// ──────────────────────────────────────────────
// API Client — Identity-Aware
// ──────────────────────────────────────────────

import type {
  ApiResponse,
  User,
  Group,
  Transaction,
  GroupBalances,
  AuditLogEntry,
} from "../types/index";

const API_URL = import.meta.env.VITE_API_URL || "";
const BASE_URL = `${API_URL}/api`;

function getAuthHeaders(): Record<string, string> {
  const userId = localStorage.getItem("currentUserId");
  return userId ? { "X-User-Id": userId } : {};
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...options.headers,
    },
    ...options,
  });

  const data: ApiResponse<T> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data.data as T;
}

// ── User API ───────────────────────────────

export const userApi = {
  list: () => request<User[]>("/users"),
  get: (id: string) => request<User>(`/users/${id}`),
  create: (data: { name: string; email: string }) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),
};

// ── Group API ──────────────────────────────

export const groupApi = {
  list: () => request<Group[]>("/groups"),
  get: (id: string) => request<Group>(`/groups/${id}`),
  create: (data: { name: string; description?: string; memberIds?: string[], currency?: string }) =>
    request<Group>("/groups", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: string, data: { name?: string; description?: string }) =>
    request<Group>(`/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    request<void>(`/groups/${id}`, { method: "DELETE" }),
  addMember: (groupId: string, userId: string) =>
    request<unknown>(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  removeMember: (groupId: string, userId: string) =>
    request<void>(`/groups/${groupId}/members/${userId}`, { method: "DELETE" }),
};

// ── Transaction API ────────────────────────

export const transactionApi = {
  list: (groupId: string) =>
    request<Transaction[]>(`/groups/${groupId}/transactions`),
  get: (groupId: string, id: string) =>
    request<Transaction>(`/groups/${groupId}/transactions/${id}`),
  create: (
    groupId: string,
    data: {
      paidById: string;
      amount: number;
      description: string;
      currency?: string;
      status?: "COMPLETED" | "PENDING" | "REJECTED";
      shares: { owedById: string; amount: number }[];
    }
  ) =>
    request<Transaction>(`/groups/${groupId}/transactions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (groupId: string, id: string) =>
    request<void>(`/groups/${groupId}/transactions/${id}`, { method: "DELETE" }),
  updateStatus: (groupId: string, id: string, status: "COMPLETED" | "PENDING" | "REJECTED") =>
    request<Transaction>(`/groups/${groupId}/transactions/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

// ── Settlement API ─────────────────────────

export const settlementApi = {
  get: (groupId: string) =>
    request<GroupBalances>(`/groups/${groupId}/settlements`),
};

// ── Audit Log API ──────────────────────────

export const auditLogApi = {
  list: () => request<AuditLogEntry[]>("/audit-logs"),
  listByGroup: (groupId: string) =>
    request<AuditLogEntry[]>(`/audit-logs/group/${groupId}`),
};

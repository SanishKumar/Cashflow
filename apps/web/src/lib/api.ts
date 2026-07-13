/**
 * API Client — JWT-Aware with Auto-Refresh
 *
 * All requests include the JWT access token in the Authorization header.
 * On 401 responses, automatically attempts to refresh the token using
 * the stored refresh token before retrying the original request.
 *
 * Token storage:
 * - Access token: in-memory (cleared on page refresh)
 * - Refresh token: Secure HttpOnly cookie, inaccessible to JavaScript
 */

import type {
  ApiResponse,
  User,
  Group,
  Transaction,
  GroupBalances,
  AuditLogEntry,
  DashboardStats,
  ReceiptData,
  SettlementPayment,
  LedgerTransactionSummary,
} from "../types/index";

// Production API traffic stays on the Vercel origin and is reverse-proxied to
// Render. This keeps the HttpOnly refresh cookie first-party. VITE_API_URL is
// still used by the Socket.io client for its direct realtime connection.
const API_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "");
const BASE_URL = `${API_URL}/api`;

// In-memory token storage (not persisted — refresh token handles persistence)
let accessToken: string | null = null;
const SESSION_MARKER_KEY = "cashflow-session-present";

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasSessionMarker(): boolean {
  return localStorage.getItem(SESSION_MARKER_KEY) === "1";
}

export function setSessionMarker(present: boolean): void {
  if (present) {
    localStorage.setItem(SESSION_MARKER_KEY, "1");
  } else {
    localStorage.removeItem(SESSION_MARKER_KEY);
  }
}

export function clearAuth() {
  accessToken = null;
  localStorage.removeItem(SESSION_MARKER_KEY);
  localStorage.removeItem("refreshToken"); // remove credentials left by older clients
  localStorage.removeItem("currentUserId"); // legacy cleanup
}

// Track whether a refresh is in-flight to prevent concurrent refreshes.
// The returned profile also avoids a follow-up /auth/me request on page load.
let refreshPromise: Promise<User | null> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the safe user profile if successful, null otherwise.
 */
async function tryRefresh(): Promise<User | null> {
  if (!hasSessionMarker()) return null;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!response.ok) {
      clearAuth();
      return null;
    }

    const data = await response.json();
    if (data.success && data.data?.user) {
      setAccessToken(data.data.accessToken);
      setSessionMarker(true);
      return data.data.user as User;
    }

    clearAuth();
    return null;
  } catch {
    clearAuth();
    return null;
  }
}

/**
 * Core request function with auth header injection and auto-refresh.
 */
async function request<T>(
  url: string,
  options: RequestInit = {},
  retryOnAuth = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });

  // Handle 401: try refreshing the token once
  if (response.status === 401 && retryOnAuth) {
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const refreshedUser = await refreshPromise;
    if (refreshedUser) {
      // Retry the original request with the new token (no more retries)
      return request<T>(url, options, false);
    }

    // Refresh failed — redirect to login
    clearAuth();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  const data: ApiResponse<T> = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data.data as T;
}

/** Upload a multipart form while preserving the same JWT refresh behavior as JSON requests. */
async function upload<T>(url: string, formData: FormData, retryOnAuth = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (response.status === 401 && retryOnAuth) {
    if (!refreshPromise) {
      refreshPromise = tryRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    if (await refreshPromise) return upload<T>(url, formData, false);

    clearAuth();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  const data: ApiResponse<T> = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }
  return data.data as T;
}

// Auth API (public endpoints)
export const authApi = {
  register: async (data: { name: string; email: string; password: string }) => {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "Registration failed");
    }
    return json.data as {
      user: User;
      accessToken: string;
      expiresIn: number;
    };
  },

  login: async (data: { email: string; password: string }) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "Login failed");
    }
    return json.data as {
      user: User;
      accessToken: string;
      expiresIn: number;
    };
  },

  logout: async () => {
    if (hasSessionMarker()) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });
      } catch {
        // Best-effort logout
      }
    }
    clearAuth();
  },

  restoreSession: async () => {
    const user = await tryRefresh();
    if (!user) {
      throw new Error("Session expired. Please log in again.");
    }
    return user;
  },

  me: () => request<User>("/auth/me"),
};

// User API
export const userApi = {
  lookup: (email: string) =>
    request<Pick<User, "id" | "name" | "email" | "avatarUrl">>("/users/lookup", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  me: () => request<User>("/users/me"),
  updateMe: (data: { name?: string; email?: string; avatarUrl?: string | null }) =>
    request<User>("/users/me", { method: "PATCH", body: JSON.stringify(data) }),
};

// Group API
export const groupApi = {
  list: () => request<Group[]>("/groups"),
  get: (id: string) => request<Group>(`/groups/${id}`),
  create: (data: { name: string; description?: string; memberIds?: string[]; currency?: string }) =>
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
  changeRole: (groupId: string, userId: string, role: "ADMIN" | "MEMBER" | "AUDITOR") =>
    request<unknown>(`/groups/${groupId}/members/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
};

// Transaction API
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
      shares: { owedById: string; amount: number }[];
    }
  ) =>
    request<Transaction>(`/groups/${groupId}/transactions`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  delete: (groupId: string, id: string) =>
    request<void>(`/groups/${groupId}/transactions/${id}`, { method: "DELETE" }),
};

export const receiptApi = {
  scan: (file: File) => {
    const formData = new FormData();
    formData.append("receipt", file);
    formData.append("ocrConsent", "true");
    return upload<ReceiptData>("/receipts/scan", formData);
  },
};

// Settlement API
export const settlementApi = {
  get: (groupId: string) =>
    request<GroupBalances>(`/groups/${groupId}/settlements`),
};

export const settlementPaymentApi = {
  list: (groupId: string, status?: "PENDING" | "CONFIRMED" | "REJECTED" | "CANCELLED") =>
    request<SettlementPayment[]>(`/groups/${groupId}/settlement-payments${status ? `?status=${status}` : ""}`),
  create: (groupId: string, data: { toUserId: string; amount: number; note?: string }) =>
    request<SettlementPayment>(`/groups/${groupId}/settlement-payments`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  confirm: (groupId: string, paymentId: string, note?: string) =>
    decideSettlementPayment(groupId, paymentId, "confirm", note),
  reject: (groupId: string, paymentId: string, note?: string) =>
    decideSettlementPayment(groupId, paymentId, "reject", note),
  cancel: (groupId: string, paymentId: string, note?: string) =>
    decideSettlementPayment(groupId, paymentId, "cancel", note),
};

function decideSettlementPayment(
  groupId: string,
  paymentId: string,
  action: "confirm" | "reject" | "cancel",
  note?: string
) {
  return request<SettlementPayment>(`/groups/${groupId}/settlement-payments/${paymentId}/${action}`, {
    method: "PATCH",
    body: JSON.stringify({ ...(note ? { note } : {}) }),
  });
}

// Audit Log API
export const auditLogApi = {
  list: (params?: { page?: number; limit?: number; actions?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.actions) searchParams.set("actions", params.actions);
    const query = searchParams.toString();
    return request<{ items: AuditLogEntry[]; total: number; page: number; totalPages: number }>(
      `/audit-logs${query ? `?${query}` : ""}`
    );
  },
  listByGroup: (groupId: string, params?: { page?: number; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const query = searchParams.toString();
    return request<{ items: AuditLogEntry[]; total: number; page: number; totalPages: number }>(
      `/audit-logs/group/${groupId}${query ? `?${query}` : ""}`
    );
  },
};

// Export API
export const exportApi = {
  downloadCsv: async (groupId: string, filename: string = "ledger.csv") => {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const response = await fetch(`${BASE_URL}/groups/${groupId}/export/csv`, { headers });
    if (!response.ok) throw new Error("Failed to export CSV");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  downloadPdf: async (groupId: string, filename: string = "settlements.pdf") => {
    const headers: Record<string, string> = {};
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

    const response = await fetch(`${BASE_URL}/groups/${groupId}/export/pdf`, { headers });
    if (!response.ok) throw new Error("Failed to export PDF");

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
};

// Dashboard API
export const dashboardApi = {
  getStats: () => request<DashboardStats>("/dashboard/stats"),
};

export const ledgerApi = {
  transactions: (page: number = 1, limit: number = 50) =>
    request<{ items: LedgerTransactionSummary[]; total: number; page: number; limit: number; totalPages: number }>(
      `/ledger/transactions?page=${page}&limit=${limit}`
    ),
};


/**
 * API Client — JWT-Aware with Auto-Refresh
 *
 * All requests include the JWT access token in the Authorization header.
 * On 401 responses, automatically attempts to refresh the token using
 * the stored refresh token before retrying the original request.
 *
 * Token storage:
 * - Access token: in-memory (cleared on page refresh)
 * - Refresh token: localStorage (persists across sessions)
 */

import type {
  ApiResponse,
  User,
  Group,
  Transaction,
  GroupBalances,
  AuditLogEntry,
  DashboardStats,
} from "../types/index";

const API_URL = import.meta.env.VITE_API_URL || "";
const BASE_URL = `${API_URL}/api`;

// In-memory token storage (not persisted — refresh token handles persistence)
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem("refreshToken");
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem("refreshToken", token);
  } else {
    localStorage.removeItem("refreshToken");
  }
}

export function clearAuth() {
  accessToken = null;
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUserId"); // legacy cleanup
}

// Track whether a refresh is in-flight to prevent concurrent refreshes
let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns true if successful, false otherwise.
 */
async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearAuth();
      return false;
    }

    const data = await response.json();
    if (data.success && data.data) {
      setAccessToken(data.data.accessToken);
      setRefreshToken(data.data.refreshToken);
      return true;
    }

    clearAuth();
    return false;
  } catch {
    clearAuth();
    return false;
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

    const refreshed = await refreshPromise;
    if (refreshed) {
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

// Auth API (public endpoints)
export const authApi = {
  register: async (data: { name: string; email: string; password: string }) => {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "Registration failed");
    }
    return json.data as {
      user: User;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  },

  login: async (data: { email: string; password: string }) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || "Login failed");
    }
    return json.data as {
      user: User;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  },

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
      } catch {
        // Best-effort logout
      }
    }
    clearAuth();
  },

  me: () => request<User>("/auth/me"),
};

// User API
export const userApi = {
  list: () => request<User[]>("/users"),
  get: (id: string) => request<User>(`/users/${id}`),
  delete: (id: string) =>
    request<void>(`/users/${id}`, { method: "DELETE" }),
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

// Settlement API
export const settlementApi = {
  get: (groupId: string) =>
    request<GroupBalances>(`/groups/${groupId}/settlements`),
};

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


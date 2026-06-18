/**
 * User Context — JWT-Aware Authentication State
 *
 * Manages the current user's authentication lifecycle:
 * - On mount: checks for stored refresh token and attempts to restore session
 * - login/register: stores tokens and user profile
 * - logout: clears tokens and redirects to login
 * - Auto-refresh: handles transparent token rotation via the API client
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { authApi, setAccessToken, setRefreshToken, getRefreshToken, clearAuth } from "../lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface UserContextType {
  currentUser: User | null;
  currentUserId: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from refresh token on mount
  useEffect(() => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      setLoading(false);
      return;
    }

    // Try to restore session by fetching user profile
    // The API client will auto-refresh the access token using the stored refresh token
    authApi
      .me()
      .then((user) => {
        setCurrentUser(user);
        setLoading(false);
      })
      .catch(() => {
        // Invalid or expired session — clear everything
        clearAuth();
        setCurrentUser(null);
        setLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    setCurrentUser(result.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.register({ name, email, password });
    setAccessToken(result.accessToken);
    setRefreshToken(result.refreshToken);
    setCurrentUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setCurrentUser(null);
  }, []);

  return (
    <UserContext.Provider
      value={{
        currentUser,
        currentUserId: currentUser?.id ?? null,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

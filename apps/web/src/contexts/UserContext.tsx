/**
 * User Context — JWT-Aware Authentication State
 *
 * Manages the current user's authentication lifecycle:
 * - On mount: checks a non-sensitive session marker and restores via HttpOnly cookie
 * - login/register: stores the short-lived access token in memory
 * - logout: clears tokens and redirects to login
 * - Auto-refresh: handles transparent token rotation via the API client
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { authApi, setAccessToken, setSessionMarker, hasSessionMarker, clearAuth } from "../lib/api";

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
  const restoreStarted = useRef(false);

  // Restore the session from the HttpOnly refresh cookie when a session marker exists.
  useEffect(() => {
    if (restoreStarted.current) return;
    restoreStarted.current = true;

    if (!hasSessionMarker()) {
      setLoading(false);
      return;
    }

    // Try to restore session by fetching user profile
    // The API client will auto-refresh the access token using the stored refresh token
    authApi
      .restoreSession()
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
    setSessionMarker(true);
    setCurrentUser(result.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await authApi.register({ name, email, password });
    setAccessToken(result.accessToken);
    setSessionMarker(true);
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

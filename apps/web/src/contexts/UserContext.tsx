// ──────────────────────────────────────────────
// User Context — Singular Identity Management
// ──────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

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
  login: (userId: string) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(
    () => localStorage.getItem("currentUserId")
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUserId) {
      setLoading(false);
      return;
    }

    // Fetch the current user's profile
    import("../lib/api").then(({ userApi }) => {
      userApi.get(currentUserId)
        .then(user => {
          setCurrentUser(user);
          setLoading(false);
        })
        .catch(() => {
          // Invalid userId in localStorage — clear it
          localStorage.removeItem("currentUserId");
          setCurrentUserId(null);
          setCurrentUser(null);
          setLoading(false);
        });
    });
  }, [currentUserId]);

  const login = (userId: string) => {
    localStorage.setItem("currentUserId", userId);
    setCurrentUserId(userId);
  };

  const logout = () => {
    localStorage.removeItem("currentUserId");
    setCurrentUserId(null);
    setCurrentUser(null);
  };

  return (
    <UserContext.Provider value={{ currentUser, currentUserId, loading, login, logout }}>
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

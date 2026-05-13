import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

interface UserContextType {
  viewingAsId: string | null;
  setViewingAsId: (id: string | null) => void;
  users: User[];
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [viewingAsId, setViewingAsId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    import("../lib/api").then(({ userApi }) => {
      userApi.list()
        .then(users => {
          if (users && users.length > 0) {
            setUsers(users);
            setViewingAsId(users[0].id);
          }
        })
        .catch(console.error);
    });
  }, []);

  return (
    <UserContext.Provider value={{ viewingAsId, setViewingAsId, users }}>
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

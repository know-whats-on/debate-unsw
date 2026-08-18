"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { clientAuth } from "@/lib/firebase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    return onAuthStateChanged(clientAuth(), (user) =>
      setState({ user, loading: false })
    );
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Returns a fetch that attaches the instructor's Firebase ID token. */
export function useAuthedFetch() {
  const { user } = useAuth();
  return async (input: string, init?: RequestInit) => {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  };
}

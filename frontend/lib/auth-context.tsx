"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, setCsrfToken } from "./api-client";
import type { AuthState, User } from "./types";

type Status = "loading" | "anonymous" | "authenticated";

interface AuthValue {
  status: Status;
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string) => Promise<User>;
  verifyEmail: (code: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<User | null>(null);

  const adopt = useCallback((state: AuthState) => {
    setCsrfToken(state.csrf_token);
    setUser(state.user);
    setStatus("authenticated");
    return state.user;
  }, []);

  const clear = useCallback(() => {
    setCsrfToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  useEffect(() => {
    api<AuthState>("/auth/me")
      .then(adopt)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) clear();
        else clear(); // API unreachable: treat as signed out; pages show their own errors
      });
  }, [adopt, clear]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      login: async (email, password) =>
        adopt(await api<AuthState>("/auth/login", { method: "POST", body: { email, password } })),
      register: async (email, password, display_name) =>
        adopt(
          await api<AuthState>("/auth/register", {
            method: "POST",
            body: { email, password, display_name },
          }),
        ),
      verifyEmail: async (code) =>
        adopt(await api<AuthState>("/auth/email/verify", { method: "POST", body: { code } })),
      logout: async () => {
        try {
          await api("/auth/logout", { method: "POST" });
        } finally {
          clear();
        }
      },
    }),
    [status, user, adopt, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

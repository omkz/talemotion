"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/lib/api/auth";
import {
  getCurrentUser,
  logout as logoutRequest,
} from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PUBLIC_PATHS = new Set(["/", "/login", "/register"]);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!PUBLIC_PATHS.has(pathname));

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) {
      return;
    }
    const controller = new AbortController();
    getCurrentUser(controller.signal)
      .then(setUserState)
      .catch((error: unknown) => {
        setUserState(null);
        if (error instanceof ApiError && error.status === 401) {
          const next = encodeURIComponent(pathname);
          router.replace(`/login?next=${next}`);
        }
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [pathname, router]);

  const setUser = useCallback((nextUser: AuthUser) => {
    setUserState(nextUser);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUserState(null);
    router.replace("/login");
    router.refresh();
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, setUser, logout }),
    [loading, logout, setUser, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}

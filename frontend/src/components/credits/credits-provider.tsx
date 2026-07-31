"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  getCreditBalance,
  type CreditBalance,
  type CreditOperation,
} from "@/lib/api/credits";

interface CreditsContextValue {
  credits: CreditBalance | null;
  loading: boolean;
  refresh: () => Promise<void>;
  estimate: (
    operations: Partial<Record<CreditOperation, number>>,
  ) => number;
  canAfford: (amount: number) => boolean;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits(null);
      return;
    }
    setLoading(true);
    try {
      setCredits(await getCreditBalance());
    } catch {
      // Keep the last known balance; generation APIs remain authoritative.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void getCreditBalance(controller.signal)
      .then(setCredits)
      .catch(() => undefined);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, user]);

  const estimate = useCallback(
    (operations: Partial<Record<CreditOperation, number>>) =>
      Object.entries(operations).reduce(
        (total, [operation, quantity]) =>
          total +
          (credits?.rates[operation as CreditOperation] ?? 0) *
            (quantity ?? 0),
        0,
      ),
    [credits],
  );

  const canAfford = useCallback(
    (amount: number) => credits === null || credits.available >= amount,
    [credits],
  );

  const value = useMemo(
    () => ({ credits, loading, refresh, estimate, canAfford }),
    [canAfford, credits, estimate, loading, refresh],
  );

  return (
    <CreditsContext.Provider value={value}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const context = useContext(CreditsContext);
  if (!context) {
    throw new Error("useCredits must be used within CreditsProvider.");
  }
  return context;
}

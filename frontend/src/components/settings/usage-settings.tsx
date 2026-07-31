"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useCredits } from "@/components/credits/credits-provider";
import {
  getCreditTransactions,
  getUsageRecords,
  type CreditTransaction,
  type UsageRecord,
} from "@/lib/api/credits";
import { SettingsSectionCard } from "./settings-section-card";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function UsageSettings() {
  const { credits, loading } = useCredits();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [usage, setUsage] = useState<UsageRecord[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getCreditTransactions(controller.signal),
      getUsageRecords(controller.signal),
    ]).then(([nextTransactions, nextUsage]) => {
      setTransactions(nextTransactions);
      setUsage(nextUsage);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-5">
      <SettingsSectionCard
        title="Credit balance"
        description="Internal credits meter provider-backed generation. Payment processing is not available yet."
      >
        <div className="grid gap-3 py-4 sm:grid-cols-3">
          {[
            ["Balance", credits?.balance],
            ["Reserved", credits?.reserved],
            ["Available", credits?.available],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-semibold">
                {loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Coins className="size-4 text-accent" />
                    {Number(value ?? 0).toLocaleString()}
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </SettingsSectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SettingsSectionCard
          title="Recent transactions"
          description="Reservations are finalized as charges or releases after a job ends."
        >
          <div className="divide-y divide-border">
            {transactions.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium capitalize">{item.type}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.description} · {formatDate(item.created_at)}
                  </p>
                </div>
                <span className="font-mono text-xs">
                  {item.amount > 0 ? "+" : ""}
                  {item.amount}
                </span>
              </div>
            ))}
            {transactions.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                No credit transactions yet.
              </p>
            )}
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          title="Recent generation usage"
          description="Provider and model usage recorded by completed or partially billable jobs."
        >
          <div className="divide-y divide-border">
            {usage.slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.operation.replaceAll("_", " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.provider} · {item.model_name} ·{" "}
                    {formatDate(item.created_at)}
                  </p>
                </div>
                <span className="font-mono text-xs">
                  {item.credits_charged} credits
                </span>
              </div>
            ))}
            {usage.length === 0 && (
              <p className="py-6 text-sm text-muted-foreground">
                No provider usage recorded yet.
              </p>
            )}
          </div>
        </SettingsSectionCard>
      </div>
    </div>
  );
}

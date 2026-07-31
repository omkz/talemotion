import { ApiClient } from "./client";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";
const client = new ApiClient(apiBaseUrl);

export type CreditOperation =
  | "storyboard_generation"
  | "image_generation"
  | "video_generation"
  | "tts_generation"
  | "music_generation"
  | "final_render";

export interface CreditBalance {
  balance: number;
  reserved: number;
  available: number;
  rates: Record<CreditOperation, number>;
}

export interface CreditTransaction {
  id: string;
  job_id: string | null;
  type:
    | "grant"
    | "reservation"
    | "charge"
    | "release"
    | "refund"
    | "adjustment";
  amount: number;
  balance_after: number;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UsageRecord {
  id: string;
  project_id: string;
  job_id: string;
  provider: string;
  model_name: string;
  operation: CreditOperation;
  input_units: number;
  output_units: number;
  provider_cost_usd: number;
  credits_charged: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface RawCreditBalance {
  balance: string | number;
  reserved: string | number;
  available: string | number;
  rates: Record<CreditOperation, string | number>;
}

function numberRecord(
  rates: RawCreditBalance["rates"],
): Record<CreditOperation, number> {
  return Object.fromEntries(
    Object.entries(rates).map(([key, value]) => [key, Number(value)]),
  ) as Record<CreditOperation, number>;
}

export async function getCreditBalance(
  signal?: AbortSignal,
): Promise<CreditBalance> {
  const value = await client.get<RawCreditBalance>("/credits", { signal });
  return {
    balance: Number(value.balance),
    reserved: Number(value.reserved),
    available: Number(value.available),
    rates: numberRecord(value.rates),
  };
}

export async function getCreditTransactions(
  signal?: AbortSignal,
): Promise<CreditTransaction[]> {
  const response = await client.get<{ items: CreditTransaction[] }>(
    "/credits/transactions",
    { signal },
  );
  return response.items.map((item) => ({
    ...item,
    amount: Number(item.amount),
    balance_after: Number(item.balance_after),
  }));
}

export async function getUsageRecords(
  signal?: AbortSignal,
): Promise<UsageRecord[]> {
  const response = await client.get<{ items: UsageRecord[] }>("/usage", {
    signal,
  });
  return response.items.map((item) => ({
    ...item,
    input_units: Number(item.input_units),
    output_units: Number(item.output_units),
    provider_cost_usd: Number(item.provider_cost_usd),
    credits_charged: Number(item.credits_charged),
  }));
}

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPersistedJob,
  isPersistedJobActive,
  type PersistedGenerationJob,
} from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

const ACTIVE_POLL_INTERVAL_MS = 1_500;
const ERROR_POLL_INTERVALS_MS = [5_000, 15_000, 30_000] as const;

function errorPollInterval(failureCount: number): number {
  const index = Math.min(
    Math.max(failureCount - 1, 0),
    ERROR_POLL_INTERVALS_MS.length - 1,
  );
  return ERROR_POLL_INTERVALS_MS[index];
}

export function useJobQuery(jobId: string | null) {
  // `query.state.fetchFailureCount` resets to 0 at the start of every fetch
  // (see TanStack Query's `fetchState()`), so with `retry: false` it is
  // always either 0 or 1 — it tracks retries *within* one fetch call, not
  // consecutive failures *across* separate polls. Backoff needs the latter,
  // so it's tracked here instead, reset on every success.
  const consecutiveFailuresRef = useRef(0);

  return useQuery<PersistedGenerationJob>({
    queryKey: jobQueryKeys.detail(jobId ?? ""),
    enabled: Boolean(jobId),
    // The polling schedule below handles recovery from failures itself;
    // TanStack Query's own retries would compound with that backoff.
    retry: false,
    queryFn: async ({ signal }) => {
      if (!jobId) {
        throw new Error("A job ID is required.");
      }
      try {
        const job = await getPersistedJob(jobId, signal);
        consecutiveFailuresRef.current = 0;
        return job;
      } catch (error) {
        consecutiveFailuresRef.current += 1;
        throw error;
      }
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && !isPersistedJobActive(job.status)) return false;

      const failureCount = consecutiveFailuresRef.current;
      if (failureCount > 0) return errorPollInterval(failureCount);

      return ACTIVE_POLL_INTERVAL_MS;
    },
  });
}

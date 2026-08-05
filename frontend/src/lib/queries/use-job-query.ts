import { useRef, type RefObject } from "react";
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

interface JobPollingState {
  jobId: string | null;
  consecutiveFailures: number;
}

// Pure, module-level so it can be called from queryFn/refetchInterval
// (imperative callbacks TanStack Query invokes on its own schedule) without
// touching the ref during React's render pass. Resetting here — scoped to
// whichever jobId is currently requesting it — is what keeps a failure
// streak from one job from leaking into the next.
function syncPollingState(
  ref: RefObject<JobPollingState>,
  jobId: string | null,
): JobPollingState {
  if (ref.current.jobId !== jobId) {
    ref.current = { jobId, consecutiveFailures: 0 };
  }
  return ref.current;
}

export function useJobQuery(jobId: string | null) {
  // `query.state.fetchFailureCount` resets to 0 at the start of every fetch
  // (see TanStack Query's `fetchState()`), so with `retry: false` it is
  // always either 0 or 1 — it tracks retries *within* one fetch call, not
  // consecutive failures *across* separate polls. Backoff needs the latter,
  // so it's tracked here instead, scoped to the active jobId and reset on
  // every success. This is a plain ref (not state): the counter must not
  // trigger a rerender on its own, only influence refetchInterval.
  const pollingStateRef = useRef<JobPollingState>({
    jobId,
    consecutiveFailures: 0,
  });

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
      const requestedJobId = jobId;
      syncPollingState(pollingStateRef, requestedJobId);

      try {
        const job = await getPersistedJob(requestedJobId, signal);
        if (pollingStateRef.current.jobId === requestedJobId) {
          pollingStateRef.current.consecutiveFailures = 0;
        }
        return job;
      } catch (error) {
        // A request aborted by TanStack Query (unmount, jobId change,
        // disabling) is not a network/server failure — the signal is the
        // authoritative check since API clients may normalize the error.
        if (
          !signal.aborted &&
          pollingStateRef.current.jobId === requestedJobId
        ) {
          pollingStateRef.current.consecutiveFailures += 1;
        }
        throw error;
      }
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && !isPersistedJobActive(job.status)) return false;

      const { consecutiveFailures: failureCount } = syncPollingState(
        pollingStateRef,
        jobId,
      );
      if (failureCount > 0) return errorPollInterval(failureCount);

      return ACTIVE_POLL_INTERVAL_MS;
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import {
  getPersistedJob,
  isPersistedJobActive,
  type PersistedGenerationJob,
} from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

const POLL_INTERVAL_MS = 1_500;

export function useJobQuery(jobId: string | null) {
  return useQuery<PersistedGenerationJob>({
    queryKey: jobQueryKeys.detail(jobId ?? ""),
    enabled: Boolean(jobId),
    queryFn: ({ signal }) => {
      if (!jobId) {
        throw new Error("A job ID is required.");
      }
      return getPersistedJob(jobId, signal);
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return POLL_INTERVAL_MS;
      return isPersistedJobActive(job.status) ? POLL_INTERVAL_MS : false;
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import {
  listPersistedJobs,
  type PersistedGenerationJob,
} from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

export function useProjectJobsQuery(projectId: string, enabled: boolean) {
  return useQuery<PersistedGenerationJob[]>({
    queryKey: jobQueryKeys.project(projectId),
    enabled: enabled && Boolean(projectId),
    queryFn: ({ signal }) => listPersistedJobs(projectId, { signal }),
  });
}

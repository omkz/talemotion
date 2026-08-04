import { useQuery } from "@tanstack/react-query";
import { getProject } from "@/lib/mock-api";
import { getPersistedProject } from "@/lib/api/persisted-projects";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import type { VideoProject } from "@/types";
import { projectQueryKeys } from "./project-query-keys";

export function useProjectQuery(projectId: string) {
  return useQuery<VideoProject | null>({
    queryKey: projectQueryKeys.detail(projectId),
    queryFn: () =>
      realSceneGenerationEnabled
        ? getPersistedProject(projectId)
        : getProject(projectId),
  });
}

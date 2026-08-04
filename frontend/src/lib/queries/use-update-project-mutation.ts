import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updatePersistedProject,
  type PersistedProjectUpdateInput,
} from "@/lib/api/persisted-projects";
import type { VideoProject } from "@/types";
import { projectQueryKeys } from "./project-query-keys";

export function useUpdateProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<VideoProject, Error, PersistedProjectUpdateInput>({
    mutationFn: (patch) => updatePersistedProject(projectId, patch),
    onSuccess: (updatedProject) => {
      queryClient.setQueryData(
        projectQueryKeys.detail(projectId),
        updatedProject,
      );
      void queryClient.invalidateQueries({
        queryKey: projectQueryKeys.lists(),
      });
    },
  });
}

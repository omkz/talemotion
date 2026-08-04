import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePersistedProject } from "@/lib/api/persisted-projects";
import { realSceneGenerationEnabled } from "@/lib/api/scene-generation-jobs";
import { videoProjectApi } from "@/lib/api/provider";
import { projectQueryKeys } from "./project-query-keys";

export function useDeleteProjectMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: () =>
      realSceneGenerationEnabled
        ? deletePersistedProject(projectId)
        : videoProjectApi.deleteProject(projectId),
    onSuccess: () => {
      queryClient.removeQueries({
        queryKey: projectQueryKeys.detail(projectId),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: projectQueryKeys.lists(),
      });
    },
  });
}

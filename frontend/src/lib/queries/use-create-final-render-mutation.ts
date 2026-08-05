import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createFinalRender,
  type CreateFinalRenderInput,
} from "@/lib/api/render-jobs";
import type { PersistedGenerationJob } from "@/lib/api/scene-generation-jobs";
import { jobQueryKeys } from "./job-query-keys";

export function useCreateFinalRenderMutation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<PersistedGenerationJob, Error, CreateFinalRenderInput>({
    mutationFn: (input) =>
      createFinalRender(projectId, input, undefined, crypto.randomUUID()),
    onSuccess: (job) => {
      queryClient.setQueryData(jobQueryKeys.detail(job.id), job);
    },
  });
}

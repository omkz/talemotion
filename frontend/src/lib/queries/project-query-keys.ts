export const projectQueryKeys = {
  all: ["projects"] as const,
  lists: () => [...projectQueryKeys.all, "list"] as const,
  detail: (projectId: string) =>
    [...projectQueryKeys.all, "detail", projectId] as const,
  jobs: (projectId: string) =>
    [...projectQueryKeys.detail(projectId), "jobs"] as const,
  renders: (projectId: string) =>
    [...projectQueryKeys.detail(projectId), "renders"] as const,
};

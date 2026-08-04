export const jobQueryKeys = {
  all: ["jobs"] as const,

  details: () => [...jobQueryKeys.all, "detail"] as const,

  detail: (jobId: string) => [...jobQueryKeys.details(), jobId] as const,

  projects: () => [...jobQueryKeys.all, "project"] as const,

  project: (projectId: string) => [...jobQueryKeys.projects(), projectId] as const,
};

import type { GenerationJob } from "@/types";
import type { VideoProjectApi } from "./video-project-api";

export interface PollJobOptions {
  api: Pick<VideoProjectApi, "getJob">;
  jobId: string;
  intervalMs?: number;
  signal?: AbortSignal;
  onUpdate?: (job: GenerationJob) => void;
}

const TERMINAL_STAGES = new Set<GenerationJob["stage"]>([
  "completed",
  "failed",
]);

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

/**
 * Polls only when explicitly called. The current simulated generation UI does
 * not use this helper.
 */
export async function pollJob({
  api,
  jobId,
  intervalMs = 1_500,
  signal,
  onUpdate,
}: PollJobOptions): Promise<GenerationJob> {
  while (true) {
    const job = await api.getJob(jobId, { signal });
    onUpdate?.(job);
    if (TERMINAL_STAGES.has(job.stage)) return job;
    await wait(intervalMs, signal);
  }
}

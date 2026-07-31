export type RenderStatus = "idle" | "rendering" | "rendered" | "failed";

/** A rendered final-video output. Each "Render New Version" bumps `version`. */
export interface Render {
  id: string;
  projectId: string;
  version: number;
  status: RenderStatus;
  resolution: string;
  durationSeconds: number;
  fileSizeMb: number;
  captionsBurned: boolean;
  narrationIncluded?: boolean;
  musicIncluded: boolean;
  thumbnailUrl: string | null;
  shareUrl: string | null;
  createdAt: string;
}

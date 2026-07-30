/**
 * A generated media artifact for a scene (image, video, or narration audio).
 * Provider/storage fields are mocked but shaped like the future Genblaze +
 * Backblaze B2 integration so the UI can demonstrate that data path now.
 */
export interface Asset {
  id: string;
  sceneId: string;
  kind: "image" | "video" | "narration-audio";
  previewUrl: string | null;
  version: number;
  provider: string;
  model: string;
  orchestration: string;
  storageProvider: string;
  manifestStatus: "pending" | "verified" | "failed";
  promptSaved: boolean;
  sha256: string;
  generationDurationMs: number;
  createdAt: string;
}

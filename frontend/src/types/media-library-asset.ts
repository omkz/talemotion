export type MediaAssetType =
  | "image"
  | "video"
  | "audio"
  | "subtitle"
  | "thumbnail"
  | "final-render";

export type MediaAssetStatus =
  | "generating"
  | "ready"
  | "failed"
  | "archived";

export type MediaAssetManifestStatus =
  | "recorded"
  | "verified"
  | "pending"
  | "unavailable";

export interface MediaLibraryAsset {
  id: string;
  projectId: string;
  projectTitle: string;
  chapterId?: string;
  sceneId?: string;
  sceneTitle?: string;
  name: string;
  type: MediaAssetType;
  status: MediaAssetStatus;
  version: number;
  mimeType: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  fileSizeBytes: number;
  previewUrl: string | null;
  storageKey: string;
  provider?: string;
  model?: string;
  orchestration: "genblaze";
  storageProvider: "backblaze-b2";
  storageState: "stored" | "uploading" | "unavailable" | "archived";
  manifestStatus: MediaAssetManifestStatus;
  sha256?: string;
  generationStage: string;
  promptSaved: boolean;
  signedUrlStatus: "simulated" | "available" | "unavailable";
  createdAt: string;
  updatedAt: string;
}

export type MediaAssetSort =
  | "newest"
  | "oldest"
  | "name"
  | "largest"
  | "project";

export interface MediaAssetFilters {
  search?: string;
  type?: MediaAssetType | "all";
  projectId?: string | "all";
  chapterId?: string;
  sceneId?: string;
  status?: MediaAssetStatus | "all";
  sort?: MediaAssetSort;
  cursor?: string | null;
  limit?: number;
}

export interface MediaAssetPage {
  items: MediaLibraryAsset[];
  nextCursor: string | null;
  total: number;
}

export interface MediaAssetProjectOption {
  id: string;
  title: string;
}

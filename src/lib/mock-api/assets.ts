import type {
  MediaAssetFilters,
  MediaAssetPage,
  MediaAssetProjectOption,
  MediaLibraryAsset,
} from "@/types";
import { getAssetsStore, setAssetsStore } from "./asset-store";
import { delay } from "./utils";

function matchesSearch(asset: MediaLibraryAsset, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [
    asset.name,
    asset.projectTitle,
    asset.sceneTitle,
    asset.type,
    asset.mimeType,
    asset.provider,
    asset.model,
  ].some((value) => value?.toLowerCase().includes(normalized));
}

function sortAssets(
  assets: MediaLibraryAsset[],
  sort: NonNullable<MediaAssetFilters["sort"]>
) {
  return [...assets].sort((first, second) => {
    switch (sort) {
      case "oldest":
        return Date.parse(first.createdAt) - Date.parse(second.createdAt);
      case "name":
        return first.name.localeCompare(second.name);
      case "largest":
        return second.fileSizeBytes - first.fileSizeBytes;
      case "project":
        return (
          first.projectTitle.localeCompare(second.projectTitle) ||
          first.name.localeCompare(second.name)
        );
      case "newest":
      default:
        return Date.parse(second.createdAt) - Date.parse(first.createdAt);
    }
  });
}

export async function listAssets(
  filters: MediaAssetFilters = {}
): Promise<MediaAssetPage> {
  await delay(320);
  const filtered = getAssetsStore().filter(
    (asset) =>
      matchesSearch(asset, filters.search ?? "") &&
      (!filters.type ||
        filters.type === "all" ||
        asset.type === filters.type) &&
      (!filters.projectId ||
        filters.projectId === "all" ||
        asset.projectId === filters.projectId) &&
      (!filters.chapterId || asset.chapterId === filters.chapterId) &&
      (!filters.sceneId || asset.sceneId === filters.sceneId) &&
      (!filters.status ||
        filters.status === "all" ||
        asset.status === filters.status)
  );
  const sorted = sortAssets(filtered, filters.sort ?? "newest");
  const offset = decodeCursor(filters.cursor);
  const limit = Math.max(1, filters.limit ?? 15);
  const items = sorted.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    nextCursor:
      nextOffset < sorted.length ? encodeCursor(nextOffset) : null,
    total: sorted.length,
  };
}

function encodeCursor(offset: number): string {
  return `asset_cursor_${offset.toString(36)}`;
}

function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor?.startsWith("asset_cursor_")) return 0;
  const offset = Number.parseInt(cursor.slice("asset_cursor_".length), 36);
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

export async function listAssetProjects(): Promise<
  MediaAssetProjectOption[]
> {
  await delay(120);
  const projects = new Map<string, string>();
  getAssetsStore().forEach((asset) => {
    projects.set(asset.projectId, asset.projectTitle);
  });
  return Array.from(projects, ([id, title]) => ({ id, title })).sort(
    (first, second) => first.title.localeCompare(second.title)
  );
}

export async function getAsset(
  assetId: string
): Promise<MediaLibraryAsset | null> {
  await delay(120);
  return getAssetsStore().find((asset) => asset.id === assetId) ?? null;
}

async function updateAsset(
  assetId: string,
  update: (asset: MediaLibraryAsset) => MediaLibraryAsset
) {
  await delay(180);
  let changed: MediaLibraryAsset | null = null;
  const next = getAssetsStore().map((asset) => {
    if (asset.id !== assetId) return asset;
    changed = update(asset);
    return changed;
  });
  if (!changed) throw new Error(`Asset not found: ${assetId}`);
  setAssetsStore(next);
  return changed;
}

export function archiveAsset(assetId: string) {
  return updateAsset(assetId, (asset) => ({
    ...asset,
    status: "archived",
    storageState: "archived",
    updatedAt: new Date().toISOString(),
  }));
}

export function restoreAsset(assetId: string) {
  return updateAsset(assetId, (asset) => ({
    ...asset,
    status: "ready",
    storageState: "stored",
    updatedAt: new Date().toISOString(),
  }));
}

export async function deleteAsset(assetId: string): Promise<void> {
  await delay(220);
  const next = getAssetsStore().filter((asset) => asset.id !== assetId);
  if (next.length === getAssetsStore().length) {
    throw new Error(`Asset not found: ${assetId}`);
  }
  setAssetsStore(next);
}

export async function retryAsset(
  assetId: string,
  onUpdate?: (asset: MediaLibraryAsset) => void
): Promise<MediaLibraryAsset> {
  const generating = await updateAsset(assetId, (asset) => ({
    ...asset,
    status: "generating",
    storageState: "uploading",
    manifestStatus: "pending",
    generationStage: "Retrying generation",
    updatedAt: new Date().toISOString(),
  }));
  onUpdate?.(generating);
  await delay(1_400);
  const ready = await updateAsset(assetId, (asset) => ({
    ...asset,
    status: "ready",
    storageState: "stored",
    manifestStatus: "verified",
    generationStage: "Completed",
    signedUrlStatus: "simulated",
    sha256:
      asset.sha256 ??
      "f015c8a77d2b46e98b72e66a0d3c91e4c4a9199d31f850af2ed74190ab6f35c8",
    updatedAt: new Date().toISOString(),
  }));
  onUpdate?.(ready);
  return ready;
}

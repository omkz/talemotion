import type { MediaLibraryAsset } from "@/types";
import { createInitialAssets } from "@/lib/mock-data";
import { getProjectsStore } from "./store";

const STORAGE_KEY = "talemotion.mock-assets.v2";

let assets: MediaLibraryAsset[] | null = null;

function loadFromStorage(): MediaLibraryAsset[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as MediaLibraryAsset[];
    const hasValidDates = stored.every(
      (asset) =>
        Number.isFinite(Date.parse(asset.createdAt)) &&
        Number.isFinite(Date.parse(asset.updatedAt))
    );
    return hasValidDates ? stored : null;
  } catch {
    return null;
  }
}

function saveToStorage(next: MediaLibraryAsset[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory mock remains usable when browser storage is unavailable.
  }
}

export function getAssetsStore(): MediaLibraryAsset[] {
  if (assets === null) {
    assets =
      loadFromStorage() ?? createInitialAssets(getProjectsStore());
  }
  return assets;
}

export function setAssetsStore(next: MediaLibraryAsset[]) {
  assets = next;
  saveToStorage(next);
}

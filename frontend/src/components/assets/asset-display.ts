import {
  AudioLines,
  Captions,
  Film,
  ImageIcon,
  Images,
  PlaySquare,
  type LucideIcon,
} from "lucide-react";
import type { MediaAssetType, MediaLibraryAsset } from "@/types";

export const ASSET_TYPE_META: Record<
  MediaAssetType,
  { label: string; pluralLabel: string; icon: LucideIcon }
> = {
  image: { label: "Image", pluralLabel: "Images", icon: ImageIcon },
  video: { label: "Video", pluralLabel: "Videos", icon: Film },
  audio: { label: "Audio", pluralLabel: "Audio", icon: AudioLines },
  subtitle: { label: "Subtitle", pluralLabel: "Subtitles", icon: Captions },
  thumbnail: {
    label: "Thumbnail",
    pluralLabel: "Thumbnails",
    icon: Images,
  },
  "final-render": {
    label: "Final Render",
    pluralLabel: "Final Renders",
    icon: PlaySquare,
  },
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function formatDuration(seconds?: number): string | null {
  if (seconds === undefined) return null;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, "0")}`
    : `0:${String(remainder).padStart(2, "0")}`;
}

export function formatAssetDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatAssetDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getResolution(asset: MediaLibraryAsset): string | null {
  if (!asset.width || !asset.height) return null;
  return `${asset.width} × ${asset.height}`;
}

export function getAspectRatio(asset: MediaLibraryAsset): string | null {
  if (!asset.width || !asset.height) return null;
  const divisor = greatestCommonDivisor(asset.width, asset.height);
  return `${asset.width / divisor}:${asset.height / divisor}`;
}

function greatestCommonDivisor(first: number, second: number): number {
  return second === 0
    ? first
    : greatestCommonDivisor(second, first % second);
}

export function getSimulatedAssetUrl(asset: MediaLibraryAsset): string {
  return `https://media.talemotion.local/${asset.storageKey}`;
}

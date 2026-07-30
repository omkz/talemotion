"use client";

import { Grid2X2, List, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  MediaAssetProjectOption,
  MediaAssetSort,
  MediaAssetStatus,
  MediaAssetType,
} from "@/types";
import { ASSET_TYPE_META } from "./asset-display";

export type AssetView = "grid" | "list";

interface AssetFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  type: MediaAssetType | "all";
  onTypeChange: (value: MediaAssetType | "all") => void;
  projectId: string | "all";
  onProjectChange: (value: string) => void;
  status: MediaAssetStatus | "all";
  onStatusChange: (value: MediaAssetStatus | "all") => void;
  sort: MediaAssetSort;
  onSortChange: (value: MediaAssetSort) => void;
  view: AssetView;
  onViewChange: (value: AssetView) => void;
  projects: MediaAssetProjectOption[];
}

const TYPES: Array<MediaAssetType | "all"> = [
  "all",
  "image",
  "video",
  "audio",
  "subtitle",
  "thumbnail",
  "final-render",
];

export function AssetFilters({
  search,
  onSearchChange,
  type,
  onTypeChange,
  projectId,
  onProjectChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  projects,
}: AssetFiltersProps) {
  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 overflow-x-auto pb-1"
        aria-label="Filter by media type"
      >
        {TYPES.map((value) => {
          const label =
            value === "all" ? "All media" : ASSET_TYPE_META[value].pluralLabel;
          return (
            <Button
              key={value}
              variant={type === value ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "shrink-0 text-muted-foreground",
                type === value && "text-foreground"
              )}
              aria-pressed={type === value}
              onClick={() => onTypeChange(value)}
            >
              {label}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/50 p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search assets, projects, scenes, providers…"
            aria-label="Search assets"
            className="pl-8"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={projectId} onValueChange={onProjectChange}>
            <SelectTrigger
              aria-label="Filter by project"
              className="w-full sm:w-48"
            >
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={status}
            onValueChange={(value) =>
              onStatusChange(value as MediaAssetStatus | "all")
            }
          >
            <SelectTrigger
              aria-label="Filter by status"
              className="w-full sm:w-36"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="generating">Generating</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(value) => onSortChange(value as MediaAssetSort)}
          >
            <SelectTrigger
              aria-label="Sort assets"
              className="col-span-2 w-full sm:w-40"
            >
              <SlidersHorizontal className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="largest">Largest file</SelectItem>
              <SelectItem value="project">Project</SelectItem>
            </SelectContent>
          </Select>

          <div
            className="col-span-2 flex rounded-lg border border-input p-0.5 sm:col-span-1"
            aria-label="Asset view"
          >
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon-sm"
              className="flex-1 sm:flex-none"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => onViewChange("grid")}
            >
              <Grid2X2 className="size-4" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon-sm"
              className="flex-1 sm:flex-none"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => onViewChange("list")}
            >
              <List className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

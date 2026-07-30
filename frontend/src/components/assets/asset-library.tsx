"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Film,
  FilterX,
  Images,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  archiveAsset,
  deleteAsset,
  listAssetProjects,
  listAssets,
  restoreAsset,
  retryAsset,
} from "@/lib/mock-api";
import type {
  MediaAssetProjectOption,
  MediaAssetSort,
  MediaAssetStatus,
  MediaAssetType,
  MediaLibraryAsset,
} from "@/types";
import { AssetCard } from "./asset-card";
import { AssetDetailSheet } from "./asset-detail-sheet";
import {
  AssetFilters,
  type AssetView,
} from "./asset-filters";
import { AssetLibrarySkeleton } from "./asset-library-skeleton";
import { AssetListItem } from "./asset-list-item";

export function AssetLibrary() {
  const [assets, setAssets] = useState<MediaLibraryAsset[] | null>(null);
  const [projects, setProjects] = useState<MediaAssetProjectOption[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [filteredTotal, setFilteredTotal] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<MediaAssetType | "all">("all");
  const [projectId, setProjectId] = useState<string | "all">("all");
  const [status, setStatus] = useState<MediaAssetStatus | "all">("all");
  const [sort, setSort] = useState<MediaAssetSort>("newest");
  const [view, setView] = useState<AssetView>("grid");
  const [selectedAsset, setSelectedAsset] =
    useState<MediaLibraryAsset | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<MediaLibraryAsset | null>(null);
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadAssetsPage = useCallback(
    async (cursor: string | null = null, append = false) => {
      const requestId = append
        ? requestIdRef.current
        : ++requestIdRef.current;
      const page = await listAssets({
        search,
        type,
        projectId,
        status,
        sort,
        cursor,
      });

      if (requestId !== requestIdRef.current) return page;

      setAssets((current) => {
        if (!append) return page.items;
        const existingIds = new Set(current?.map((asset) => asset.id));
        return [
          ...(current ?? []),
          ...page.items.filter((asset) => !existingIds.has(asset.id)),
        ];
      });
      setFilteredTotal(page.total);
      setNextCursor(page.nextCursor);
      return page;
    },
    [projectId, search, sort, status, type]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([listAssets(), listAssetProjects()])
      .then(([assetPage, projectOptions]) => {
        if (cancelled) return;
        setTotalCount(assetPage.total);
        setProjects(projectOptions);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      loadAssetsPage()
        .then(() => {
          if (!cancelled) setError(false);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
    }, search ? 180 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [loadAssetsPage, search]);

  const updateVisibleAsset = useCallback((updated: MediaLibraryAsset) => {
    setAssets((current) =>
      current?.map((asset) => (asset.id === updated.id ? updated : asset)) ??
      current
    );
    setSelectedAsset((current) =>
      current?.id === updated.id ? updated : current
    );
  }, []);

  const resetPagination = () => {
    requestIdRef.current += 1;
    setNextCursor(null);
    setLoadingMore(false);
  };

  const clearFilters = () => {
    resetPagination();
    setSearch("");
    setType("all");
    setProjectId("all");
    setStatus("all");
    setSort("newest");
  };

  const handleArchive = async (asset: MediaLibraryAsset) => {
    setBusyAssetId(asset.id);
    try {
      const updated = await archiveAsset(asset.id);
      updateVisibleAsset(updated);
      toast.success("Asset archived", {
        description: "The asset remains available in the Archived filter.",
      });
      await loadAssetsPage();
    } catch {
      toast.error("Couldn't archive the asset");
    } finally {
      setBusyAssetId(null);
    }
  };

  const handleRestore = async (asset: MediaLibraryAsset) => {
    setBusyAssetId(asset.id);
    try {
      const updated = await restoreAsset(asset.id);
      updateVisibleAsset(updated);
      toast.success("Asset restored");
      await loadAssetsPage();
    } catch {
      toast.error("Couldn't restore the asset");
    } finally {
      setBusyAssetId(null);
    }
  };

  const handleRetry = async (asset: MediaLibraryAsset) => {
    setBusyAssetId(asset.id);
    try {
      await retryAsset(asset.id, updateVisibleAsset);
      toast.success("Mock generation completed", {
        description: `${asset.name} is ready.`,
      });
      await loadAssetsPage();
    } catch {
      toast.error("Couldn't retry the mock generation");
    } finally {
      setBusyAssetId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusyAssetId(target.id);
    try {
      await deleteAsset(target.id);
      setAssets((current) =>
        current?.filter((asset) => asset.id !== target.id) ?? current
      );
      setTotalCount((current) =>
        current === null ? current : Math.max(0, current - 1)
      );
      setFilteredTotal((current) =>
        current === null ? current : Math.max(0, current - 1)
      );
      setSelectedAsset((current) =>
        current?.id === target.id ? null : current
      );
      toast.success("Asset removed from the mock library", {
        description: "No storage object was actually deleted.",
      });
      await loadAssetsPage();
    } catch {
      toast.error("Couldn't delete the asset");
    } finally {
      setBusyAssetId(null);
      setDeleteTarget(null);
    }
  };

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadAssetsPage(nextCursor, true);
    } catch {
      toast.error("Couldn't load more assets");
    } finally {
      setLoadingMore(false);
    }
  };

  const renderAsset = (asset: MediaLibraryAsset) => {
    const sharedProps = {
      asset,
      onPreview: () => setSelectedAsset(asset),
      onArchive: () => handleArchive(asset),
      onRestore: () => handleRestore(asset),
      onDelete: () => setDeleteTarget(asset),
      onRetry: () => handleRetry(asset),
      disabled: busyAssetId === asset.id,
    };
    return view === "grid" ? (
      <AssetCard key={asset.id} {...sharedProps} />
    ) : (
      <AssetListItem key={asset.id} {...sharedProps} />
    );
  };

  return (
    <div className="mx-auto max-w-[96rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        title="Assets"
        description="Browse generated images, clips, audio, subtitles, and final renders across your TaleMotion projects."
        action={
          <div className="rounded-lg border border-border bg-card px-3 py-2 text-right">
            <p className="text-lg font-semibold leading-none text-foreground">
              {totalCount ?? "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              total assets
            </p>
          </div>
        }
      />

      <AssetFilters
        search={search}
        onSearchChange={(value) => {
          resetPagination();
          setSearch(value);
        }}
        type={type}
        onTypeChange={(value) => {
          resetPagination();
          setType(value);
        }}
        projectId={projectId}
        onProjectChange={(value) => {
          resetPagination();
          setProjectId(value);
        }}
        status={status}
        onStatusChange={(value) => {
          resetPagination();
          setStatus(value);
        }}
        sort={sort}
        onSortChange={(value) => {
          resetPagination();
          setSort(value);
        }}
        view={view}
        onViewChange={setView}
        projects={projects}
      />

      {assets && !error && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Showing {assets.length} of {filteredTotal ?? assets.length} assets
          </p>
          <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            <Film className="size-3.5" />
            Genblaze + Backblaze B2 metadata is simulated
          </p>
        </div>
      )}

      {error && (
        <EmptyState
          icon={RefreshCw}
          title="Couldn't load the asset library"
          description="The local mock service did not respond. Try loading the assets again."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setError(false);
                void loadAssetsPage();
              }}
            >
              <RefreshCw />
              Retry
            </Button>
          }
        />
      )}

      {!error && assets === null && <AssetLibrarySkeleton />}

      {!error && assets !== null && assets.length === 0 && (
        <EmptyState
          icon={totalCount === 0 ? Images : FilterX}
          title={
            totalCount === 0
              ? "No assets in the library"
              : "No assets match these filters"
          }
          description={
            totalCount === 0
              ? "Generated media will appear here as TaleMotion projects are created."
              : "Try another search, media type, project, or status."
          }
          action={
            totalCount !== 0 ? (
              <Button variant="outline" onClick={clearFilters}>
                <FilterX />
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {!error && assets !== null && assets.length > 0 && (
        <div className="space-y-6">
          <div
            className={
              view === "grid"
                ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "space-y-2"
            }
          >
            {assets.map(renderAsset)}
          </div>

          {nextCursor && (
            <div className="flex justify-center border-t border-border pt-6">
              <Button
                variant="outline"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                {loadingMore ? "Loading assets…" : "Load more"}
              </Button>
            </div>
          )}
        </div>
      )}

      <AssetDetailSheet
        asset={selectedAsset}
        onOpenChange={(open) => {
          if (!open) setSelectedAsset(null);
        }}
        onArchive={() => {
          if (selectedAsset) void handleArchive(selectedAsset);
        }}
        onRestore={() => {
          if (selectedAsset) void handleRestore(selectedAsset);
        }}
        onDelete={() => {
          if (selectedAsset) setDeleteTarget(selectedAsset);
        }}
        onRetry={() => {
          if (selectedAsset) void handleRetry(selectedAsset);
        }}
        disabled={selectedAsset?.id === busyAssetId}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busyAssetId) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” will be removed from local mock state.
              This only simulates deletion; no Backblaze B2 object will be
              deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busyAssetId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(busyAssetId)}
              onClick={() => void handleDelete()}
            >
              Delete asset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

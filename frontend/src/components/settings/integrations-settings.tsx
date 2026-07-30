"use client";

import { useState } from "react";
import { Boxes, Cloud } from "lucide-react";
import { toast } from "sonner";
import {
  testBackblazeConnection,
  testGenblazeConnection,
} from "@/lib/mock-api";
import type { AppSettings, IntegrationCheckHistory } from "@/types";
import { IntegrationCard } from "./integration-card";
import {
  IntegrationConfigDialog,
  type ConfigurableIntegration,
} from "./integration-config-dialog";
import type { IntegrationStatus } from "./integration-status";

function formatLastCheck(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatStorage(bytes: number): string {
  if (bytes < 1_000_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function IntegrationsSettings({
  settings,
  initialHistory,
  storedAssetCount,
  storageUsedBytes,
}: {
  settings: AppSettings["integrations"];
  initialHistory: IntegrationCheckHistory;
  storedAssetCount: number;
  storageUsedBytes: number;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [genblazeStatus, setGenblazeStatus] =
    useState<IntegrationStatus>(
      initialHistory.genblazeLastCheckedAt
        ? "mock-connected"
        : "mock-mode"
    );
  const [backblazeStatus, setBackblazeStatus] =
    useState<IntegrationStatus>(
      initialHistory.backblazeLastCheckedAt
        ? "mock-connected"
        : "mock-mode"
    );
  const [configure, setConfigure] =
    useState<ConfigurableIntegration | null>(null);

  const handleTestGenblaze = async () => {
    setGenblazeStatus("checking");
    try {
      const result = await testGenblazeConnection();
      setHistory((current) => ({
        ...current,
        genblazeLastCheckedAt: result.checkedAt,
      }));
      setGenblazeStatus("mock-connected");
      toast.success("Genblaze mock connection successful", {
        description: "No real provider connection was made.",
      });
    } catch {
      setGenblazeStatus("mock-mode");
      toast.error("Genblaze mock connection check failed");
    }
  };

  const handleTestBackblaze = async () => {
    setBackblazeStatus("checking");
    try {
      const result = await testBackblazeConnection();
      setHistory((current) => ({
        ...current,
        backblazeLastCheckedAt: result.checkedAt,
      }));
      setBackblazeStatus("mock-connected");
      toast.success("Backblaze B2 mock connection successful", {
        description: "No real bucket connection was made.",
      });
    } catch {
      setBackblazeStatus("mock-mode");
      toast.error("Backblaze B2 mock connection check failed");
    }
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <IntegrationCard
          icon={Boxes}
          name="Genblaze"
          description="Orchestrates image, video, audio, and multimodal generation providers."
          status={genblazeStatus}
          checkingLabel="Checking unified provider pipeline…"
          lastCheckedLabel={formatLastCheck(
            history.genblazeLastCheckedAt
          )}
          details={[
            {
              label: "Pipeline mode",
              value: "Unified provider orchestration",
            },
            { label: "Supported stages", value: "5" },
            { label: "Provider routing", value: "Automatic" },
          ]}
          stages={["Script", "Image", "Video", "Voice", "Metadata"]}
          onTest={() => void handleTestGenblaze()}
          onConfigure={() => setConfigure("genblaze")}
        />

        <IntegrationCard
          icon={Cloud}
          name="Backblaze B2"
          description="Durable object storage for generated media, thumbnails, manifests, metadata, and final renders."
          status={backblazeStatus}
          checkingLabel="Checking mock bucket configuration…"
          lastCheckedLabel={formatLastCheck(
            history.backblazeLastCheckedAt
          )}
          details={[
            {
              label: "Bucket placeholder",
              value: settings.b2BucketName,
            },
            { label: "Region placeholder", value: settings.b2Region },
            { label: "Stored assets (mock)", value: storedAssetCount },
            {
              label: "Estimated usage (mock)",
              value: formatStorage(storageUsedBytes),
            },
          ]}
          onTest={() => void handleTestBackblaze()}
          onConfigure={() => setConfigure("backblaze")}
        />
      </div>

      <IntegrationConfigDialog
        integration={configure}
        onOpenChange={(open) => {
          if (!open) setConfigure(null);
        }}
      />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  Plug,
  Coins,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  getIntegrationCheckHistory,
  getSettings,
  listAssets,
  resetSettings,
  updateSettings,
} from "@/lib/mock-api";
import type {
  AppSettings,
  IntegrationCheckHistory,
} from "@/types";
import { GeneralSettingsForm } from "./general-settings-form";
import { GenerationSettingsForm } from "./generation-settings-form";
import { IntegrationsSettings } from "./integrations-settings";
import { ResetSettingsDialog } from "./reset-settings-dialog";
import { settingsFormSchema } from "./schema";
import { SettingsLoading } from "./settings-loading";
import { UsageSettings } from "./usage-settings";

type SavePhase = "idle" | "saving" | "failed";

interface AssetMetrics {
  count: number;
  bytes: number;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [checkHistory, setCheckHistory] =
    useState<IntegrationCheckHistory | null>(null);
  const [assetMetrics, setAssetMetrics] = useState<AssetMetrics | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [savePhase, setSavePhase] = useState<SavePhase>("idle");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const form = useForm<AppSettings>({
    resolver: zodResolver(settingsFormSchema),
    mode: "onChange",
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getSettings(),
      getIntegrationCheckHistory(),
      listAssets({ limit: 100 }),
    ])
      .then(([loadedSettings, history, assetPage]) => {
        if (cancelled) return;
        form.reset(loadedSettings);
        setSettings(loadedSettings);
        setCheckHistory(history);
        setAssetMetrics({
          count: assetPage.total,
          bytes: assetPage.items.reduce(
            (total, asset) => total + asset.fileSizeBytes,
            0
          ),
        });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [form]);

  const handleSave = async (values: AppSettings) => {
    setSavePhase("saving");
    try {
      const saved = await updateSettings(values);
      form.reset(saved);
      setSettings(saved);
      setSavePhase("idle");
      toast.success("Settings saved", {
        description: "Your TaleMotion defaults were stored locally.",
      });
    } catch {
      setSavePhase("failed");
      toast.error("Settings could not be saved");
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const defaults = await resetSettings();
      form.reset(defaults);
      setSettings(defaults);
      setSavePhase("idle");
      setResetOpen(false);
      toast.success("Settings reset to defaults", {
        description: "Simulated connection-check history was preserved.",
      });
    } catch {
      toast.error("Settings could not be reset");
    } finally {
      setResetting(false);
    }
  };

  const dirty = form.formState.isDirty;
  const saveLabel =
    savePhase === "saving"
      ? "Saving"
      : savePhase === "failed"
        ? "Save failed"
        : dirty
          ? "Unsaved changes"
          : "Saved";
  const SaveStateIcon =
    savePhase === "saving"
      ? Loader2
      : savePhase === "failed"
        ? CircleAlert
        : CheckCircle2;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSave)}
          className="space-y-6"
        >
          <PageHeader
            title="Settings"
            description="Configure your default video preferences and media pipeline."
            action={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {settings && (
                  <span
                    className={`mr-1 inline-flex items-center gap-1.5 text-xs ${
                      savePhase === "failed"
                        ? "text-destructive"
                        : dirty
                          ? "text-accent"
                          : "text-muted-foreground"
                    }`}
                    aria-live="polite"
                  >
                    <SaveStateIcon
                      className={`size-3.5 ${
                        savePhase === "saving" ? "animate-spin" : ""
                      }`}
                    />
                    {saveLabel}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setResetOpen(true)}
                  disabled={!settings || resetting || savePhase === "saving"}
                >
                  <RotateCcw />
                  Reset to defaults
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !settings ||
                    !dirty ||
                    savePhase === "saving" ||
                    !form.formState.isValid
                  }
                >
                  {savePhase === "saving" ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save />
                  )}
                  Save Changes
                </Button>
              </div>
            }
          />

          {loadFailed && (
            <EmptyState
              icon={Settings2}
              title="Couldn't load settings"
              description="The local settings service did not respond. Reload the page to try again."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Reload
                </Button>
              }
            />
          )}

          {!loadFailed &&
            (!settings || !checkHistory || !assetMetrics) && (
              <SettingsLoading />
            )}

          {!loadFailed && settings && checkHistory && assetMetrics && (
            <Tabs defaultValue="general" className="gap-5">
              <TabsList
                variant="line"
                className="w-full justify-start overflow-x-auto border-b border-border"
                aria-label="Settings sections"
              >
                <TabsTrigger value="general" className="px-3">
                  <Settings2 />
                  General
                </TabsTrigger>
                <TabsTrigger value="generation" className="px-3">
                  <Sparkles />
                  Generation Defaults
                </TabsTrigger>
                <TabsTrigger value="integrations" className="px-3">
                  <Plug />
                  Integrations
                </TabsTrigger>
                <TabsTrigger value="usage" className="px-3">
                  <Coins />
                  Usage & Credits
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <GeneralSettingsForm control={form.control} />
              </TabsContent>

              <TabsContent value="generation">
                <GenerationSettingsForm control={form.control} />
              </TabsContent>

              <TabsContent value="integrations">
                <IntegrationsSettings
                  settings={settings.integrations}
                  initialHistory={checkHistory}
                  storedAssetCount={assetMetrics.count}
                  storageUsedBytes={assetMetrics.bytes}
                />
              </TabsContent>

              <TabsContent value="usage">
                <UsageSettings />
              </TabsContent>
            </Tabs>
          )}
        </form>
      </Form>

      <ResetSettingsDialog
        open={resetOpen}
        resetting={resetting}
        onOpenChange={setResetOpen}
        onConfirm={() => void handleReset()}
      />
    </div>
  );
}

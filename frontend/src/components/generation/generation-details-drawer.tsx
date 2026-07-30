import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Asset } from "@/types";

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailRow({ label, value, mono }: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs text-foreground" : "text-sm font-medium text-foreground"}>
        {value}
      </span>
    </div>
  );
}

interface GenerationDetailsDrawerProps {
  asset: Asset | null;
  onOpenChange: (open: boolean) => void;
}

export function GenerationDetailsDrawer({ asset, onOpenChange }: GenerationDetailsDrawerProps) {
  return (
    <Sheet open={asset !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Generation details</SheetTitle>
          <SheetDescription>
            Mock provenance for this asset — the future integration surface for Genblaze and
            Backblaze B2.
          </SheetDescription>
        </SheetHeader>

        {asset && (
          <div className="px-4 pb-4">
            <div className="rounded-lg border border-border">
              <div className="px-3">
                <DetailRow label="Provider" value={asset.provider} />
                <DetailRow label="Model" value={asset.model} />
                <DetailRow label="Orchestration" value={asset.orchestration} />
                <DetailRow label="Storage" value={asset.storageProvider} />
                <DetailRow
                  label="Manifest status"
                  value={
                    asset.manifestStatus === "verified"
                      ? "Verified"
                      : asset.manifestStatus === "recorded"
                        ? "Recorded"
                        : asset.manifestStatus
                  }
                />
                <DetailRow label="Asset version" value={`v${asset.version}`} />
                <DetailRow label="Prompt saved" value={asset.promptSaved ? "Yes" : "No"} />
                <DetailRow label="SHA-256" value={asset.sha256} mono />
                <DetailRow
                  label="Generation duration"
                  value={`${(asset.generationDurationMs / 1000).toFixed(1)}s`}
                />
                <DetailRow label="Created" value={new Date(asset.createdAt).toLocaleString()} />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

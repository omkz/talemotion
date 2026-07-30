import { ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfigurableIntegration = "genblaze" | "backblaze";

export function IntegrationConfigDialog({
  integration,
  onOpenChange,
}: {
  integration: ConfigurableIntegration | null;
  onOpenChange: (open: boolean) => void;
}) {
  const genblaze = integration === "genblaze";

  return (
    <Dialog open={integration !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
            <ShieldCheck className="size-5" />
          </div>
          <DialogTitle>
            {genblaze ? "Configure Genblaze" : "Configure Backblaze B2"}
          </DialogTitle>
          <DialogDescription>
            Real {genblaze ? "Genblaze" : "Backblaze B2"} configuration is
            unavailable in this frontend prototype.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-muted-foreground">
          {genblaze ? (
            <>
              <p>
                Provider credentials and routing rules will be configured
                through the TaleMotion backend in a future implementation.
              </p>
              <p>
                No provider secret or API key should be entered or stored in
                this frontend.
              </p>
            </>
          ) : (
            <>
              <p>
                B2 application keys will be handled by the backend and exposed
                only through scoped media operations.
              </p>
              <p>
                Secrets must never be stored in browser localStorage. This
                prototype does not establish a storage connection.
              </p>
            </>
          )}
          <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs">
            <span className="font-medium text-foreground">
              Simulated integration.
            </span>{" "}
            No credentials are requested or transmitted.
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

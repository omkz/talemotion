import { Check, Loader2, Settings2, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import {
  IntegrationStatusBadge,
  type IntegrationStatus,
} from "./integration-status";

interface IntegrationCardProps {
  icon: LucideIcon;
  name: string;
  description: string;
  status: IntegrationStatus;
  checkingLabel: string;
  lastCheckedLabel: string;
  details: Array<{ label: string; value: React.ReactNode }>;
  stages?: string[];
  onTest: () => void;
  onConfigure: () => void;
}

export function IntegrationCard({
  icon: Icon,
  name,
  description,
  status,
  checkingLabel,
  lastCheckedLabel,
  details,
  stages,
  onTest,
  onConfigure,
}: IntegrationCardProps) {
  const checking = status === "checking";

  return (
    <Card className="h-full">
      <CardHeader className="border-b border-border">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icon className="size-5" />
          </div>
          <IntegrationStatusBadge status={status} />
        </div>
        <CardTitle>{name}</CardTitle>
        <CardDescription className="leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-5">
        <div className="rounded-lg border border-accent/20 bg-accent/5 px-3 py-2.5 text-xs">
          <p className="font-medium text-foreground">Simulated integration</p>
          <p className="mt-0.5 text-muted-foreground">
            Connection type: Simulated
          </p>
        </div>

        <dl className="space-y-2.5">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex items-start justify-between gap-4 text-xs"
            >
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className="max-w-[60%] break-words text-right text-foreground">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>

        {stages && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Pipeline stages
            </p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((stage) => (
                <span
                  key={stage}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground"
                >
                  <Check className="size-3 text-accent" />
                  {stage}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {checking ? checkingLabel : `Last simulated check: ${lastCheckedLabel}`}
        </p>
      </CardContent>

      <CardFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onTest}
          disabled={checking}
        >
          {checking ? (
            <Loader2 className="animate-spin" />
          ) : (
            <TestTube2 />
          )}
          {checking ? "Checking…" : "Test Connection"}
        </Button>
        <Button type="button" variant="ghost" onClick={onConfigure}>
          <Settings2 />
          Configure
        </Button>
      </CardFooter>
    </Card>
  );
}

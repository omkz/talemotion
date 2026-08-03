import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Story", "Creative Direction", "Output"];

export function WizardStepper({
  currentStep,
  steps = STEPS,
}: {
  currentStep: number;
  steps?: readonly string[];
}) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {steps.map((label, index) => {
        const stepNumber = index + 1;
        const isComplete = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  isComplete && "bg-accent text-accent-foreground",
                  isCurrent && "border-2 border-accent text-accent",
                  !isComplete && !isCurrent && "border border-border text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : stepNumber}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {stepNumber < steps.length && (
              <div className={cn("h-px flex-1", isComplete ? "bg-accent" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

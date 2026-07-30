import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryItem {
  label: string;
  done: boolean;
}

export function ProductionSummary({ items }: { items: SummaryItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-sm">
          {item.done ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          ) : (
            <Circle className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className={cn(item.done ? "text-foreground/90" : "text-muted-foreground")}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

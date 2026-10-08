import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChainStep {
  label: string;
  detail: string;
  done: boolean;
}

/** Source, rule, recommendation, decision, approval: how far the item has travelled towards audit evidence. */
export function EvidenceChain({ steps }: { steps: ChainStep[] }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.label} className="relative min-w-0 flex-1">
          {i > 0 && <span className={cn("absolute right-1/2 top-2.5 h-px w-full", steps[i - 1].done && s.done ? "bg-primary" : "bg-border")} />}
          <span className={cn("relative z-10 mx-auto flex h-5 w-5 items-center justify-center rounded-full border", s.done ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card")}>
            {s.done && <Check className="h-3 w-3" />}
          </span>
          <div className="mt-1.5 px-1 text-center">
            <div className={cn("text-2xs font-medium", !s.done && "text-muted-foreground")}>{s.label}</div>
            <div className="truncate text-2xs text-muted-foreground">{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

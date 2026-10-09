import { Check, Clock, Minus } from "lucide-react";
import type { ItemStage } from "@/engine/reviewStory";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Any process told as stages: an item's review, a supplier case. */
export type RailStage = Pick<ItemStage, "label" | "state" | "who" | "when" | "detail"> & { id: string };

const STATE_LABEL: Record<ItemStage["state"], string> = {
  done: "Done",
  current: "Waiting",
  optional: "Optional",
  upcoming: "Next",
  skipped: "Not needed",
};

/**
 * An item's way from the source to the signed account, one stage per column: what state it is in,
 * who holds it and when it moved. Choosing a stage opens its work below.
 */
export function ProcessRail<S extends RailStage>({ stages, selected, onSelect }: { stages: S[]; selected: S["id"]; onSelect: (id: S["id"]) => void }) {
  return (
    <ol className="flex items-stretch" aria-label="Process">
      {stages.map((s, i) => {
        const prevDone = i > 0 && (stages[i - 1].state === "done" || stages[i - 1].state === "skipped");
        const isSel = s.id === selected;
        return (
          <li key={s.id} className="relative min-w-0 flex-1">
            {i > 0 && <span className={cn("absolute right-1/2 top-[1.15rem] h-0.5 w-full", prevDone && s.state !== "upcoming" ? "bg-primary" : "bg-border")} />}
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={isSel ? "step" : undefined}
              className={cn(
                "relative flex w-full flex-col items-center rounded-md px-1.5 pb-2 pt-1.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                isSel ? "bg-primary/[0.07]" : "hover:bg-secondary/60"
              )}
            >
              <span
                className={cn(
                  "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-2xs font-semibold tnum",
                  s.state === "done" && "border-primary bg-primary text-primary-foreground",
                  s.state === "current" && "border-warn bg-warn-subtle text-warn-foreground ring-4 ring-warn/15",
                  s.state === "optional" && "border-dashed border-primary/60 bg-card text-primary",
                  s.state === "upcoming" && "border-border bg-card text-muted-foreground",
                  s.state === "skipped" && "border-border bg-secondary text-muted-foreground"
                )}
              >
                {s.state === "done" ? <Check className="h-3.5 w-3.5" /> : s.state === "current" ? <Clock className="h-3.5 w-3.5" /> : s.state === "skipped" ? <Minus className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn("mt-1.5 text-xs font-semibold", (s.state === "upcoming" || s.state === "skipped") && "text-muted-foreground")}>{s.label}</span>
              <span className={cn("text-2xs font-medium", s.state === "current" ? "text-warn-foreground" : "text-muted-foreground")}>{STATE_LABEL[s.state]}</span>
              <span className="mt-1 w-full truncate text-2xs text-foreground">{s.who || "-"}</span>
              <span className="w-full truncate text-2xs text-muted-foreground tnum">{s.when ? fmtDateTime(s.when) : s.detail}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

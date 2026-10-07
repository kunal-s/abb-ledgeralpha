// The close calendar: one bar per phase across the working days, filled to its
// progress, with today and the target marked (docs/FRD.md §6.3). The pattern is
// the cockpit's phase rail, harvested from LedgerAlpha and rebuilt on this plan.

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CLOSE_WD_RANGE } from "@/data/workspace/close";
import type { PhaseSummary } from "@/engine/close";
import { wdLabel } from "@/lib/workdays";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAR: Record<PhaseSummary["status"], { track: string; fill: string }> = {
  complete: { track: "bg-ok-subtle", fill: "bg-ok" },
  "in-progress": { track: "bg-info-subtle", fill: "bg-info" },
  blocked: { track: "bg-danger-subtle", fill: "bg-danger" },
  "not-started": { track: "bg-secondary", fill: "bg-muted-foreground/40" },
};

const DAYS = Array.from({ length: CLOSE_WD_RANGE.max - CLOSE_WD_RANGE.min + 1 }, (_, i) => CLOSE_WD_RANGE.min + i);
const pct = (wd: number) => ((wd - CLOSE_WD_RANGE.min) / DAYS.length) * 100;

export function PhaseGantt({ summaries, currentWd, targetWd, onSelect }: { summaries: PhaseSummary[]; currentWd: number; targetWd: number; onSelect: (phaseId: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-[15rem_1fr] border-b border-border/70 bg-muted/30">
        <div className="px-4 py-1.5 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Phase</div>
        <div className="relative mr-4 grid" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}>
          {DAYS.map((d) => (
            <div key={d} className={cn("border-l border-border/50 px-1 py-1.5 text-2xs", d === currentWd ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {wdLabel(d)}
            </div>
          ))}
        </div>
      </div>
      {summaries.map((p) => {
        const b = BAR[p.status];
        const left = pct(p.startWd);
        const width = ((p.dueWd - p.startWd + 1) / DAYS.length) * 100;
        return (
          <button key={p.phase.id} type="button" onClick={() => onSelect(p.phase.id)} className="grid w-full grid-cols-[15rem_1fr] items-stretch border-b border-border/60 text-left transition-colors last:border-0 hover:bg-accent/40">
            <div className={cn("flex items-center gap-2.5 px-4 py-2.5", p.critical && "border-l-2 border-danger pl-3.5")}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary text-xs font-semibold">{p.phase.id}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium leading-tight">{p.phase.name}</div>
                <div className="truncate text-2xs text-muted-foreground">
                  {p.complete} of {p.tasks.length} tasks{p.late ? ` · ${fmtInt(p.late)} late` : ""}{p.critical ? " · critical path" : ""}
                </div>
              </div>
            </div>
            <div className="relative my-1 mr-4 min-h-9">
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${DAYS.length}, minmax(0, 1fr))` }}>
                {DAYS.map((d) => (
                  <div key={d} className="border-l border-border/40" />
                ))}
              </div>
              <div className="absolute top-0 z-10 h-full w-px bg-primary/60" style={{ left: `${pct(currentWd + 0.5)}%` }} />
              <div className="absolute top-0 z-10 h-full w-px border-l border-dashed border-warn" style={{ left: `${pct(targetWd + 1)}%` }} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={cn("absolute top-1/2 h-6 -translate-y-1/2 overflow-hidden rounded-md", b.track, p.late > 0 && "ring-1 ring-danger/50")} style={{ left: `${left}%`, width: `${width}%` }}>
                    <div className={cn("h-full opacity-80", b.fill)} style={{ width: `${Math.max(p.progress > 0 ? 3 : 0, p.progress * 100)}%` }} />
                    <span className="absolute inset-y-0 left-2 flex items-center text-2xs font-medium text-foreground">{Math.round(p.progress * 100)}%</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {p.phase.name}: {wdLabel(p.startWd)} to {wdLabel(p.dueWd)}, {Math.round(p.progress * 100)}% complete
                </TooltipContent>
              </Tooltip>
            </div>
          </button>
        );
      })}
      <div className="flex flex-wrap items-center gap-4 border-t border-border/70 px-4 py-2 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-primary/60" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px border-l border-dashed border-warn" /> Target sign-off, {wdLabel(targetWd)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm ring-1 ring-danger/50" /> Has late tasks
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-danger" /> On the critical path
        </span>
      </div>
    </div>
  );
}

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LadderMonth } from "@/engine/bg";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLOT = 200;

/** Guarantees by the month their validity ends: the height is the amount, red and amber are the ones to chase. */
export function ExpiryLadder({ months, selected, onSelect }: { months: LadderMonth[]; selected?: string; onSelect?: (month: string | undefined) => void }) {
  const max = Math.max(1, ...months.map((m) => m.value));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-danger" />Under 45 days, not yet accepted</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-warn" />Under 60 days</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary/60" />Later</span>
      </div>
      <div className="flex items-end gap-1.5" style={{ height: PLOT + 34 }}>
        {months.map((m, i) => {
          const h = (m.value / max) * PLOT;
          const rest = Math.max(0, m.value - m.red - m.amber);
          const key = m.month.slice(0, 7);
          return (
            <Tooltip key={m.month}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect?.(selected === key ? undefined : key)}
                  className={cn("group flex min-w-0 flex-1 flex-col items-center justify-end rounded-sm", selected === key && "bg-accent/60")}
                  style={{ height: PLOT + 34 }}
                >
                  <span className="mb-1 text-2xs tnum text-muted-foreground">{m.value ? fmtINRCompact(m.value).replace("₹", "") : ""}</span>
                  <div className="anim-grow-y flex w-[70%] flex-col-reverse overflow-hidden rounded-[2px]" style={{ height: Math.max(m.value ? 3 : 0, h), animationDelay: `${i * 40}ms` }}>
                    <div className="bg-primary/60" style={{ height: `${m.value ? (rest / m.value) * 100 : 0}%` }} />
                    <div className="bg-warn" style={{ height: `${m.value ? (m.amber / m.value) * 100 : 0}%` }} />
                    <div className="bg-danger" style={{ height: `${m.value ? (m.red / m.value) * 100 : 0}%` }} />
                  </div>
                  <span className="mt-1.5 text-2xs text-muted-foreground">{fmtMonth(m.month).slice(0, 3)}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {fmtMonth(m.month)}: {fmtInt(m.count)} guarantee{m.count === 1 ? "" : "s"}, {fmtINRCompact(m.value)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

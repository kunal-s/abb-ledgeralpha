import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PeriodRow } from "@/engine/gst";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const UP = 150;
const DOWN = 52;

/**
 * Input credit by return period. Above the line is what the books hold, split by whether the supplier reported it;
 * below the line is what suppliers reported that the books do not have.
 */
export function ItcBars({ periods, selected, onSelect }: { periods: PeriodRow[]; selected?: string; onSelect: (p: string | undefined) => void }) {
  const peakUp = Math.max(1, ...periods.map((p) => p.booksTax));
  const peakDown = Math.max(1, ...periods.map((p) => p.byClass["missing-in-books"].atStake));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />Matched</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-warn" />Different tax</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-danger" />Supplier has not reported it</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-info" />Reported, not in the books</span>
      </div>
      <div className="flex gap-2">
        {periods.map((p, i) => {
          const m = p.byClass;
          const matched = Math.max(0, p.booksTax - m.different.atStake - m["missing-in-statement"].atStake - 0);
          const diff = m.different.atStake;
          const miss = m["missing-in-statement"].atStake;
          const h = (v: number) => `${(v / peakUp) * UP}px`;
          const dn = (m["missing-in-books"].atStake / peakDown) * DOWN;
          const key = p.period;
          return (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => onSelect(selected === key ? undefined : key)} className={cn("min-w-0 flex-1 rounded-sm text-center", selected === key && "bg-accent/60")}>
                  <div className="flex flex-col items-center justify-end" style={{ height: UP + 18 }}>
                    <span className="mb-1 text-2xs tnum text-muted-foreground">{fmtINRCompact(p.booksTax).replace("₹", "")}</span>
                    <div className="anim-grow-y flex w-[62%] flex-col overflow-hidden rounded-t-[2px]" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="bg-danger" style={{ height: h(miss) }} />
                      <div className="bg-warn" style={{ height: h(diff) }} />
                      <div className="bg-primary" style={{ height: h(matched) }} />
                    </div>
                  </div>
                  <div className="border-t border-border pt-1 text-2xs text-muted-foreground">{fmtMonth(`${key}-01`).slice(0, 3)}</div>
                  <div className="flex justify-center" style={{ height: DOWN }}>
                    <div className="w-[62%] rounded-b-[2px] bg-info" style={{ height: dn }} />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div>{fmtMonth(`${key}-01`)}: {fmtINRCompact(p.booksTax)} in the books</div>
                <div>{fmtInt(m.matched.count)} matched, {fmtInt(m.different.count)} different ({fmtINRCompact(diff)})</div>
                <div>{fmtInt(m["missing-in-statement"].count)} not reported ({fmtINRCompact(miss)}), {fmtInt(m["missing-in-books"].count)} not booked ({fmtINRCompact(m["missing-in-books"].atStake)})</div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

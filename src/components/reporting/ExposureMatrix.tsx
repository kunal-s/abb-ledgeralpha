import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FX_BUCKETS, coverage, type CurrencyExposure, type FxBucket } from "@/engine/fx";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const SHOWN: FxBucket[] = ["overdue", "0-30", "31-60", "61-90", "91+"];

/**
 * Net exposure by currency and by when it settles, in rupees at the closing rate. Under each figure a bar shows
 * how much of it a forward covers; a long position (receivables) reads right, a short one (payables) reads left.
 */
export function ExposureMatrix({ rows }: { rows: CurrencyExposure[] }) {
  const peak = Math.max(1, ...rows.flatMap((r) => SHOWN.map((b) => Math.abs(r.net[b] * r.rate))));
  return (
    <div>
      <div className="grid grid-cols-[4.5rem_repeat(5,minmax(0,1fr))_6rem] items-end gap-2 pb-2 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        <span>Currency</span>
        {SHOWN.map((b) => <span key={b} className="text-center">{FX_BUCKETS.find((x) => x.id === b)!.label}</span>)}
        <span className="text-right">Net</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => {
          const net = SHOWN.reduce((s, b) => s + r.net[b] * r.rate, 0);
          return (
            <li key={r.currency} className="grid grid-cols-[4.5rem_repeat(5,minmax(0,1fr))_6rem] items-center gap-2 py-2.5">
              <div>
                <div className="text-sm font-semibold">{r.currency}</div>
                <div className="text-2xs text-muted-foreground tnum">at {r.rate}</div>
              </div>
              {SHOWN.map((b) => {
                const inr = r.net[b] * r.rate;
                const cov = coverage(r.net[b], r.hedged[b]);
                const w = (Math.abs(inr) / peak) * 100;
                return (
                  <Tooltip key={b}>
                    <TooltipTrigger asChild>
                      <div className="px-1">
                        <div className="relative h-3">
                          <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                          {inr !== 0 && (
                            <div
                              className={cn("anim-grow-x absolute top-0 h-full rounded-[2px]", inr > 0 ? "bg-primary" : "bg-warn")}
                              style={inr > 0 ? { left: "50%", width: `${w / 2}%` } : { right: "50%", width: `${w / 2}%` }}
                            />
                          )}
                        </div>
                        <div className="mt-1 text-center text-2xs tnum">{inr === 0 ? <span className="text-muted-foreground">-</span> : fmtINRCompact(Math.abs(inr))}</div>
                        {b !== "overdue" && b !== "91+" && (
                          <div className="mx-auto mt-0.5 h-1 w-3/4 rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-ok" style={{ width: `${(cov ?? 0) * 100}%` }} />
                          </div>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {r.currency} {FX_BUCKETS.find((x) => x.id === b)!.label.toLowerCase()}: {fmtInt(Math.abs(r.net[b]))} {r.net[b] >= 0 ? "to receive" : "to pay"}
                      {cov !== null && b !== "overdue" && b !== "91+" ? `, ${Math.round(cov * 100)}% covered by forwards` : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
              <div className="text-right">
                <div className="text-sm font-medium tnum">{fmtINRCompact(Math.abs(net))}</div>
                <div className="text-2xs text-muted-foreground">{net >= 0 ? "long" : "short"}</div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />To receive</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-warn" />To pay</span>
        <span className="flex items-center gap-1.5"><span className="h-1 w-3 rounded-full bg-ok" />Covered by forwards, within 90 days</span>
      </div>
    </div>
  );
}

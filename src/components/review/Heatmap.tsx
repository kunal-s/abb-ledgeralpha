import type { AccountCategory } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BUCKETS, type BucketId, type HeatCell, type Heatmap } from "@/engine/review";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Sequential blue ramp (one hue, light → dark): steps 100–700 of the reference
// palette. Lightest step means "little here"; the darkest, "most".
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];

export type HeatMode = "amount" | "count";

const value = (c: HeatCell, mode: HeatMode) => (mode === "amount" ? c.amount : c.count);
const fmt = (c: HeatCell, mode: HeatMode) => (mode === "amount" ? fmtINRCompact(c.amount) : fmtInt(c.count));

function shade(v: number, max: number): { bg: string; fg: string } {
  if (v <= 0 || max <= 0) return { bg: "transparent", fg: "hsl(var(--muted-foreground))" };
  const i = Math.min(RAMP.length - 1, Math.floor(Math.sqrt(v / max) * RAMP.length));
  return { bg: RAMP[i], fg: i >= 4 ? "#ffffff" : "#0b0b0b" };
}

interface HeatmapGridProps {
  heatmap: Heatmap;
  mode: HeatMode;
  onSelect: (category: AccountCategory | null, bucket: BucketId | null) => void;
}

/** Account category × ageing bucket. Every cell is a drill-down to its items. */
export function HeatmapGrid({ heatmap, mode, onSelect }: HeatmapGridProps) {
  const max = Math.max(1, ...heatmap.categories.flatMap((c) => BUCKETS.map((b) => value(heatmap.cell(c, b.id), mode))));
  const cols = "grid-cols-[minmax(9.5rem,1.3fr)_repeat(4,minmax(0,1fr))_minmax(5.5rem,0.8fr)]";

  return (
    <div className="space-y-1" role="table" aria-label="Open items by account category and ageing bucket">
      <div className={cn("grid items-end gap-1 px-1 pb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground", cols)} role="row">
        <span role="columnheader">Category</span>
        {BUCKETS.map((b) => (
          <span key={b.id} className="text-center" role="columnheader">
            {b.label}
          </span>
        ))}
        <span className="text-right" role="columnheader">
          Total
        </span>
      </div>
      {heatmap.categories.map((c) => {
        const total = heatmap.rowTotal(c);
        return (
          <div key={c} className={cn("grid items-stretch gap-1", cols)} role="row">
            <button type="button" onClick={() => onSelect(c, null)} className="rounded-md px-1 py-1.5 text-left leading-tight hover:bg-accent" role="rowheader">
              <span className="block truncate text-sm">{CATEGORY_LABELS[c]}</span>
              <span className="block text-2xs text-muted-foreground">{total.flagged > 0 ? `${fmtInt(total.flagged)} flagged` : "none flagged"}</span>
            </button>
            {BUCKETS.map((b) => {
              const cell = heatmap.cell(c, b.id);
              const { bg, fg } = shade(value(cell, mode), max);
              return (
                <Tooltip key={b.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={cell.count === 0}
                      onClick={() => onSelect(c, b.id)}
                      style={{ background: bg, color: fg }}
                      className="flex min-h-[2.25rem] items-center justify-center rounded-md px-1 text-xs font-medium tnum transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-100"
                      role="cell"
                    >
                      {cell.count === 0 ? <span className="text-muted-foreground/60">—</span> : fmt(cell, mode)}
                    </button>
                  </TooltipTrigger>
                  {cell.count > 0 && (
                    <TooltipContent>
                      <div className="font-medium">
                        {CATEGORY_LABELS[c]} · {b.label}
                      </div>
                      <div className="tnum">
                        {fmtINRCompact(cell.amount)} gross across {fmtInt(cell.count)} items
                      </div>
                      <div className="tnum text-muted-foreground">
                        {fmtInt(cell.flagged)} flagged ({fmtINRCompact(cell.flaggedAmount)})
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
            <button type="button" onClick={() => onSelect(c, null)} className="rounded-md px-1 text-right text-xs font-semibold tnum hover:bg-accent" role="cell">
              {fmt(total, mode)}
            </button>
          </div>
        );
      })}
      <div className={cn("grid items-center gap-1 border-t border-border pt-1.5", cols)} role="row">
        <span className="px-1 text-xs font-semibold" role="rowheader">
          All categories
        </span>
        {BUCKETS.map((b) => (
          <button key={b.id} type="button" onClick={() => onSelect(null, b.id)} className="rounded-md py-1 text-center text-xs font-semibold tnum hover:bg-accent" role="cell">
            {fmt(heatmap.colTotal(b.id), mode)}
          </button>
        ))}
        <span className="px-1 text-right text-xs font-semibold tnum" role="cell">
          {fmt(heatmap.total, mode)}
        </span>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 text-2xs text-muted-foreground">
        <span>Fewer</span>
        {RAMP.map((c) => (
          <span key={c} className="h-2.5 w-5 rounded-sm" style={{ background: c }} />
        ))}
        <span>More</span>
        <span className="ml-2">· gross of debits and credits</span>
      </div>
    </div>
  );
}

// How a balance is spread over the review ageing buckets: one stacked bar a
// row, the older the warmer, with the amounts on hover and in the legend.

import type { BucketId } from "@/engine/review";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export const AGEING_SEGMENTS: { id: BucketId; label: string; cls: string }[] = [
  { id: "0-90", label: "0 to 90 days", cls: "bg-ok/55" },
  { id: "91-180", label: "91 to 180 days", cls: "bg-info" },
  { id: "181-365", label: "181 to 365 days", cls: "bg-warn" },
  { id: "365+", label: "Over 365 days", cls: "bg-danger" },
];

export function AgeingBar({ bands, className }: { bands: Record<BucketId, number>; className?: string }) {
  const total = AGEING_SEGMENTS.reduce((s, g) => s + Math.max(0, bands[g.id] ?? 0), 0);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("flex h-2.5 w-28 gap-px overflow-hidden rounded-sm bg-muted", className)} role="img" aria-label={AGEING_SEGMENTS.map((g) => `${g.label}: ${fmtINRCompact(bands[g.id] ?? 0)}`).join(", ")}>
          {total > 0 &&
            AGEING_SEGMENTS.map((g) => {
              const v = Math.max(0, bands[g.id] ?? 0);
              return v > 0 ? <div key={g.id} className={g.cls} style={{ flexGrow: v, flexBasis: 0 }} /> : null;
            })}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {AGEING_SEGMENTS.map((g) => (
          <div key={g.id} className="flex items-center justify-between gap-4 tnum">
            <span className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-sm", g.cls)} />
              {g.label}
            </span>
            <span>{fmtINRCompact(bands[g.id] ?? 0)}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

export function AgeingLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {AGEING_SEGMENTS.map((g) => (
        <span key={g.id} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-sm", g.cls)} />
          {g.label}
        </span>
      ))}
    </div>
  );
}

import { AGEING_FILL } from "@/components/charts/ageing";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BUCKETS } from "@/engine/review";
import type { FocusArea } from "@/engine/reviewStory";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import type { AccountCategory } from "@/types";

interface FocusAreasProps {
  areas: FocusArea[];
  onSelect: (category: AccountCategory, bucket?: string) => void;
}

/** Key to the ageing colours, for a panel header. */
export function AgeingLegend() {
  return (
    <span className="flex gap-3 text-2xs text-muted-foreground">
      {BUCKETS.map((b) => (
        <span key={b.id} className="flex items-center gap-1 whitespace-nowrap">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: AGEING_FILL[b.id] }} />
          {b.label}
        </span>
      ))}
    </span>
  );
}

/** The areas that take most manual effort, ranked by flagged value, each bar split by age. */
export function FocusAreas({ areas, onSelect }: FocusAreasProps) {
  const ranked = [...areas].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...ranked.map((a) => a.value));
  return (
    <div>
      <div className="mb-2 grid grid-cols-[11rem_1fr_5.5rem_4.5rem_6rem] items-end gap-4 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
        <span>Area</span>
        <span>Age of flagged value</span>
        <span className="text-right">Flagged</span>
        <span className="text-right">Oldest</span>
        <span>Recommended</span>
      </div>
      <ul className="divide-y divide-border">
        {ranked.map((a, i) => (
          <li key={a.category} className="grid grid-cols-[11rem_1fr_5.5rem_4.5rem_6rem] items-center gap-4 py-2.5">
            <button type="button" onClick={() => onSelect(a.category)} className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium hover:text-primary">{a.label}</span>
              <span className="block text-2xs text-muted-foreground tnum">{fmtInt(a.count)} items</span>
            </button>
            <div className="flex h-5 gap-px" style={{ width: `${Math.max((a.value / max) * 100, a.value ? 3 : 0)}%` }}>
              {BUCKETS.map((b) => {
                const cell = a.byBucket[b.id];
                if (!cell.amount) return null;
                return (
                  <Tooltip key={b.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => onSelect(a.category, b.id)}
                        className="anim-grow-x h-full rounded-[2px] transition-opacity hover:opacity-80"
                        style={{ width: `${(cell.amount / a.value) * 100}%`, background: AGEING_FILL[b.id], animationDelay: `${i * 50}ms` }}
                        aria-label={`${a.label}, ${b.label}`}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {b.label}: {fmtINRCompact(cell.amount)}, {fmtInt(cell.count)} items
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <span className="text-right text-sm font-medium tnum">{a.value ? fmtINRCompact(a.value) : "-"}</span>
            <span className="text-right text-xs text-muted-foreground tnum">{a.oldest ? `${fmtInt(a.oldest)} d` : "-"}</span>
            <span className="truncate text-xs">{a.mainAction ?? "-"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

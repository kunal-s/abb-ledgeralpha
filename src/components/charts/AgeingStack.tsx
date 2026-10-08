import { cn } from "@/lib/utils";
import { AGEING_FILL } from "@/components/charts/ageing";
import { fmtINRCompact } from "@/lib/format";

export interface AgeingSlice {
  id: string;
  label: string;
  amount: number;
  count: number;
}

interface AgeingStackProps {
  slices: AgeingSlice[];
  onSelect?: (id: string) => void;
  className?: string;
}

/** A single stacked bar of value by ageing bucket, with the figures written under each segment. */
export function AgeingStack({ slices, onSelect, className }: AgeingStackProps) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex h-9 w-full gap-px overflow-hidden rounded-sm">
        {slices.map((s, i) => {
          const pct = total ? (s.amount / total) * 100 : 0;
          return (
            <button
              key={s.id}
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(s.id)}
              style={{ width: `${Math.max(pct, s.amount > 0 ? 1.5 : 0)}%`, background: AGEING_FILL[s.id], animationDelay: `${i * 70}ms` }}
              className="anim-grow-x h-full min-w-0 transition-opacity hover:opacity-85 disabled:cursor-default"
              aria-label={`${s.label}: ${fmtINRCompact(s.amount)}, ${s.count} items`}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {slices.map((s) => (
          <div key={s.id} className="min-w-0">
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: AGEING_FILL[s.id] }} />
              <span className="truncate">{s.label}</span>
            </div>
            <div className="mt-0.5 text-sm font-medium tnum">{fmtINRCompact(s.amount)}</div>
            <div className="text-2xs text-muted-foreground tnum">{s.count} items</div>
          </div>
        ))}
      </div>
    </div>
  );
}

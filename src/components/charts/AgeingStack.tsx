import { cn } from "@/lib/utils";
import { AGEING_FILL } from "@/components/charts/ageing";
import { fmtINRCompact } from "@/lib/format";

export interface AgeingSlice {
  id: string;
  label: string;
  amount: number;
  count: number;
  /** colour override; the ageing ramp by bucket id when omitted */
  fill?: string;
}

interface AgeingStackProps {
  slices: AgeingSlice[];
  onSelect?: (id: string) => void;
  /** one row per slice instead of columns, for five bands or long labels */
  list?: boolean;
  className?: string;
}

/** A single stacked bar of value by ageing bucket, with the figures written under each segment. */
export function AgeingStack({ slices, onSelect, list, className }: AgeingStackProps) {
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
              style={{ width: `${Math.max(pct, s.amount > 0 ? 1.5 : 0)}%`, background: s.fill ?? AGEING_FILL[s.id], animationDelay: `${i * 70}ms` }}
              className="anim-grow-x h-full min-w-0 transition-opacity hover:opacity-85 disabled:cursor-default"
              aria-label={`${s.label}: ${fmtINRCompact(s.amount)}, ${s.count} items`}
            />
          );
        })}
      </div>
      {list ? (
        <ul className="divide-y divide-border">
          {slices.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.fill ?? AGEING_FILL[s.id] }} />
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              <span className="text-2xs text-muted-foreground tnum">{s.count} items</span>
              <span className="w-20 text-right font-medium tnum">{fmtINRCompact(s.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${slices.length}, minmax(0, 1fr))` }}>
        {slices.map((s) => (
          <div key={s.id} className="min-w-0">
            <div className="flex items-start gap-1.5 text-2xs text-muted-foreground">
              <span className="mt-[3px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.fill ?? AGEING_FILL[s.id] }} />
              <span className="leading-tight">{s.label}</span>
            </div>
            <div className="mt-0.5 text-sm font-medium tnum">{fmtINRCompact(s.amount)}</div>
            <div className="text-2xs text-muted-foreground tnum">{s.count} items</div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

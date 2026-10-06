import { useMemo } from "react";
import { TREATMENT_LABELS } from "@/engine/recClasses";
import type { RecView } from "@/engine/recs";
import { fmtDrCr, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Row {
  key: string;
  label: string;
  detail: string;
  count: number;
  effect: number;
  unclassified: boolean;
}

/**
 * The difference between the books and the source, broken down by reconciling
 * class. Each bar is the class's effect on (books - source); what the bars do
 * not cover is the unexplained difference, which has to be within tolerance
 * before the reconciliation can be signed off.
 */
export function DifferenceBars({ view }: { view: RecView }) {
  const rows = useMemo<Row[]>(() => {
    const m = new Map<string, Row>();
    for (const i of view.items) {
      const key = i.cls?.id ?? "unclassified";
      const r = m.get(key) ?? { key, label: i.cls?.label ?? "Not classified", detail: i.cls ? TREATMENT_LABELS[i.cls.treatment] : "Choose a class", count: 0, effect: 0, unclassified: !i.cls };
      r.count += 1;
      r.effect += i.effect;
      m.set(key, r);
    }
    return [...m.values()].sort((a, b) => Number(a.unclassified) - Number(b.unclassified) || Math.abs(b.effect) - Math.abs(a.effect));
  }, [view.items]);

  if (view.sourceBalance === null || view.difference === null) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Waiting for the counterparty's balance</div>;
  }

  const scale = Math.max(1, Math.abs(view.difference), ...rows.map((r) => Math.abs(r.effect)));
  const ok = view.withinTolerance;

  return (
    <div>
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <span className="text-sm font-medium">Difference, books less source</span>
        <span className="tnum text-sm font-semibold">{view.difference === 0 ? "Nil" : fmtDrCr(view.difference)}</span>
      </div>

      {rows.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">{view.difference === 0 ? "The balances agree; there are no reconciling items" : "No reconciling items yet"}</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm">{r.label}</div>
                <div className="text-2xs text-muted-foreground">
                  {r.detail} · {fmtInt(r.count)} item{r.count === 1 ? "" : "s"}
                </div>
              </div>
              <div className="h-3 rounded-sm bg-muted">
                <div className={cn("h-3 rounded-sm", r.unclassified ? "bg-warn" : "bg-primary/70")} style={{ width: `${Math.max(1.5, (Math.abs(r.effect) / scale) * 100)}%` }} />
              </div>
              <span className="w-36 text-right tnum text-sm">{fmtDrCr(r.effect)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 space-y-1 border-t border-border pt-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Explained by classified items</span>
          <span className="tnum">{view.explained === 0 ? "Nil" : fmtDrCr(view.explained)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Unexplained</span>
          <span className="flex items-baseline gap-2">
            <span className={cn("rounded px-1.5 py-0.5 text-2xs font-medium", ok ? "bg-ok-subtle text-ok-foreground" : "bg-danger-subtle text-danger-foreground")}>
              {ok ? "Within tolerance" : "Outside tolerance"}
            </span>
            <span className="tnum font-semibold">{view.unexplained === 0 ? "Nil" : fmtDrCr(view.unexplained ?? 0)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

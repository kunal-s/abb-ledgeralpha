import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PL_GROUP_LABELS, grossMargin, operatingProfit, pct, type PlAmounts } from "@/engine/pnl";
import { fmtINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RupeeRow {
  id: string;
  name: string;
  current: PlAmounts;
  prior: PlAmounts;
}

const PARTS = [
  { key: "materials", fill: "bg-foreground/70" },
  { key: "employee", fill: "bg-foreground/45" },
  { key: "other", fill: "bg-foreground/25" },
  { key: "depreciation", fill: "bg-foreground/[0.14]" },
] as const;

const pp = (now: number, before: number) => {
  const d = (now - before) * 100;
  return Math.abs(d) < 0.05 ? "level" : `${d > 0 ? "+" : "-"}${Math.abs(d).toFixed(1)} pts`;
};

/**
 * Where each rupee of revenue goes, per business unit: the costs in greys, what is left in the accent colour.
 * Every bar is the unit's own revenue, so the length of the profit segment is its operating margin.
 */
export function RupeeStack({ rows, onSelect, selected }: { rows: RupeeRow[]; onSelect?: (id: string) => void; selected?: string }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
        {PARTS.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-[2px]", p.fill)} />
            {PL_GROUP_LABELS[p.key]}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-primary" />
          Operating profit
        </span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => {
          const rev = r.current.revenue;
          const op = operatingProfit(r.current);
          const margin = pct(op, rev);
          const before = pct(operatingProfit(r.prior), r.prior.revenue);
          const grow = r.prior.revenue ? (rev - r.prior.revenue) / r.prior.revenue : undefined;
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onSelect?.(r.id)} className={cn("grid w-full grid-cols-[10rem_1fr_7rem_9rem] items-center gap-4 py-3 text-left", selected === r.id && "bg-accent/50")}>
                <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                <div className="flex h-5 w-full gap-px overflow-hidden rounded-[2px]">
                  {rev > 0 &&
                    PARTS.map((p) => (
                      <Tooltip key={p.key}>
                        <TooltipTrigger asChild>
                          <div className={cn("anim-grow-x h-full", p.fill)} style={{ width: `${(Math.max(0, r.current[p.key]) / rev) * 100}%`, animationDelay: `${i * 70}ms` }} />
                        </TooltipTrigger>
                        <TooltipContent>
                          {PL_GROUP_LABELS[p.key]}: {fmtINRCompact(r.current[p.key])}, {(pct(r.current[p.key], rev) * 100).toFixed(1)}% of revenue
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  {rev > 0 && op > 0 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="anim-grow-x h-full bg-primary" style={{ width: `${(op / rev) * 100}%`, animationDelay: `${i * 70 + 180}ms` }} />
                      </TooltipTrigger>
                      <TooltipContent>
                        Operating profit: {fmtINRCompact(op)}, {(margin * 100).toFixed(1)}% of revenue
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <span className="text-right">
                  <span className="block text-sm font-medium tnum">{rev ? fmtINRCompact(rev) : "-"}</span>
                  <span className="block text-2xs text-muted-foreground tnum">{grow === undefined ? "" : `${grow >= 0 ? "+" : "-"}${Math.abs(grow * 100).toFixed(1)}% YoY`}</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-medium tnum">{rev ? `${(margin * 100).toFixed(1)}%` : fmtINRCompact(op)}</span>
                  <span className="block text-2xs text-muted-foreground tnum">{rev && r.prior.revenue ? `${pp(margin, before)}, gross ${(pct(grossMargin(r.current), rev) * 100).toFixed(1)}%` : "operating"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

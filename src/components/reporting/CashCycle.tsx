import { fmtInt } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DEFINITIONS, type WcPoint } from "@/engine/workingCapital";

const ROWS = [
  { key: "dio", label: "Hold inventory", from: (p: WcPoint) => 0, to: (p: WcPoint) => p.dio, fill: "var(--series-2)", tip: DEFINITIONS.dio },
  { key: "dso", label: "Collect from customers", from: (p: WcPoint) => p.dio, to: (p: WcPoint) => p.dio + p.dso, fill: "var(--series-1)", tip: DEFINITIONS.dso },
  { key: "dpo", label: "Supplier credit", from: () => 0, to: (p: WcPoint) => p.dpo, fill: "var(--series-3)", tip: DEFINITIONS.dpo },
] as const;

/**
 * Where the days go. Inventory is held, then customers pay; suppliers carry part of it.
 * The cash conversion cycle is the stretch no supplier is funding.
 */
export function CashCycle({ point }: { point: WcPoint }) {
  const total = Math.max(1, point.dio + point.dso);
  const pct = (d: number) => `${(d / total) * 100}%`;
  return (
    <div>
      <div className="space-y-3">
        {ROWS.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-3">
            <span className="text-sm">{r.label}</span>
            <div className="relative h-5 rounded-[2px] bg-secondary/60">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="anim-grow-x absolute inset-y-0 rounded-[2px]"
                    style={{ left: pct(r.from(point)), width: pct(r.to(point) - r.from(point)), backgroundColor: r.fill, animationDelay: `${i * 90}ms` }}
                  />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{r.tip}</TooltipContent>
              </Tooltip>
            </div>
            <span className="text-right text-sm font-medium tnum">{fmtInt(Math.round(r.to(point) - r.from(point)))} d</span>
          </div>
        ))}
        <div className="grid grid-cols-[10rem_1fr_3.5rem] items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-sm font-semibold">Cash conversion cycle</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{DEFINITIONS.ccc}</TooltipContent>
          </Tooltip>
          <div className="relative h-5">
            <div className="anim-grow-x absolute inset-y-0 rounded-[2px] border-2 border-foreground" style={{ left: pct(Math.min(point.dpo, total)), width: pct(Math.max(0, total - point.dpo)) }} />
          </div>
          <span className="text-right text-sm font-semibold tnum">{fmtInt(Math.round(point.ccc))} d</span>
        </div>
      </div>
    </div>
  );
}

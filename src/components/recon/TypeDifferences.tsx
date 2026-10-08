import type { TypeDifference } from "@/engine/recOverview";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import type { ReconType } from "@/types";

/** Gross difference by reconciliation type: the part classified items explain, and the part still open. */
export function TypeDifferences({ rows, onSelect }: { rows: TypeDifference[]; onSelect: (type: ReconType) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.difference));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />Explained by classified items</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-warn" />Unexplained, outside tolerance</span>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={r.type} className="grid grid-cols-[9.5rem_1fr_6.5rem_5.5rem] items-center gap-4 py-2.5">
            <button type="button" onClick={() => onSelect(r.type)} className="min-w-0 text-left">
              <span className="block truncate text-sm font-medium hover:text-primary">{r.type}</span>
              <span className="block text-2xs text-muted-foreground tnum">{fmtInt(r.signed)} of {fmtInt(r.total)} certified</span>
            </button>
            <div className="h-4 w-full">
              <div className="flex h-full gap-px" style={{ width: `${Math.max((r.difference / max) * 100, r.difference ? 2 : 0)}%` }}>
                {r.explained > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="anim-grow-x h-full rounded-[2px] bg-primary" style={{ width: `${(r.explained / r.difference) * 100}%`, animationDelay: `${i * 60}ms` }} />
                    </TooltipTrigger>
                    <TooltipContent>Explained: {fmtINRCompact(r.explained)}</TooltipContent>
                  </Tooltip>
                )}
                {r.unexplained > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="anim-grow-x h-full rounded-[2px] bg-warn" style={{ width: `${(r.unexplained / r.difference) * 100}%`, animationDelay: `${i * 60 + 120}ms` }} />
                    </TooltipTrigger>
                    <TooltipContent>Unexplained: {fmtINRCompact(r.unexplained)} in {fmtInt(r.outside)} reconciliations</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
            <span className="text-right text-sm font-medium tnum">{r.difference ? fmtINRCompact(r.difference) : "Nil"}</span>
            <span className="text-right text-xs tnum text-muted-foreground">{r.unexplained ? `${fmtINRCompact(r.unexplained)} open` : "all explained"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

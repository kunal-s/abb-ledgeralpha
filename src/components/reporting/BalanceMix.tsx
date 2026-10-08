import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StatementGroup } from "@/engine/statements";
import { fmtINRCompact } from "@/lib/format";

const TINTS = ["0b3f4a", "165d66", "2f8186", "5da3a3", "8fc0bd", "bcd9d6"];

function Row({ label, groups, total }: { label: string; groups: StatementGroup[]; total: number }) {
  const lines = groups.flatMap((g) => g.lines).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount);
  return (
    <div className="grid grid-cols-[9rem_1fr] items-center gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground tnum">{fmtINRCompact(total)}</div>
      </div>
      <div className="flex h-9 gap-px overflow-hidden rounded-[2px]">
        {lines.map((l, i) => {
          const w = (l.amount / total) * 100;
          const dark = i < 3;
          return (
            <Tooltip key={l.label}>
              <TooltipTrigger asChild>
                <div className="anim-grow-x flex min-w-0 items-center px-1.5" style={{ width: `${w}%`, background: `#${TINTS[Math.min(i, TINTS.length - 1)]}`, animationDelay: `${i * 50}ms` }}>
                  {w > 11 && <span className={`truncate text-2xs ${dark ? "text-white" : "text-foreground"}`}>{l.label}</span>}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {l.label}: {fmtINRCompact(l.amount)}, {w.toFixed(1)}%
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

/** Both sides of the balance sheet as bars of the same length: what the company holds, and what funds it. */
export function BalanceMix({ assets, funding, totalAssets, totalFunding }: { assets: StatementGroup[]; funding: StatementGroup[]; totalAssets: number; totalFunding: number }) {
  return (
    <div className="space-y-3">
      <Row label="Assets" groups={assets} total={totalAssets} />
      <Row label="Equity and liabilities" groups={funding} total={totalFunding} />
    </div>
  );
}

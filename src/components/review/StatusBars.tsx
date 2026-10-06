import type { AccountReviewStatus, RiskTier } from "@/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Review status groups for the stacked bars; text labels always accompany colour. */
export const STATUS_GROUPS: { key: string; label: string; statuses: AccountReviewStatus[]; cls: string }[] = [
  { key: "not-started", label: "Not started", statuses: ["not-started"], cls: "bg-muted-foreground/25" },
  { key: "in-review", label: "In review", statuses: ["in-review", "reopened"], cls: "bg-info" },
  { key: "ready", label: "Ready for sign-off", statuses: ["ready-for-signoff"], cls: "bg-warn" },
  { key: "preparer", label: "Awaiting reviewer", statuses: ["preparer-signed"], cls: "bg-ok/55" },
  { key: "signed", label: "Signed off", statuses: ["reviewer-signed"], cls: "bg-ok" },
];

interface StatusBarsProps {
  data: Record<RiskTier, Record<string, number>>;
  onSelect?: (risk: RiskTier, groupKey: string) => void;
}

const RISKS: RiskTier[] = ["High", "Medium", "Low"];

/** Accounts by risk tier, stacked by review status. */
export function StatusBars({ data, onSelect }: StatusBarsProps) {
  const max = Math.max(1, ...RISKS.map((r) => STATUS_GROUPS.reduce((s, g) => s + (data[r][g.key] ?? 0), 0)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {STATUS_GROUPS.map((g) => (
          <span key={g.key} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-sm", g.cls)} />
            {g.label}
          </span>
        ))}
      </div>
      <div className="space-y-2.5">
        {RISKS.map((r) => {
          const total = STATUS_GROUPS.reduce((s, g) => s + (data[r][g.key] ?? 0), 0);
          return (
            <div key={r} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-3">
              <span className="text-xs text-muted-foreground">{r} risk</span>
              <div className="flex h-5 gap-0.5" style={{ width: `${(total / max) * 100}%`, minWidth: total ? "1rem" : 0 }}>
                {STATUS_GROUPS.map((g) => {
                  const n = data[r][g.key] ?? 0;
                  if (!n) return null;
                  return (
                    <Tooltip key={g.key}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSelect?.(r, g.key)}
                          className={cn("h-full rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", g.cls)}
                          style={{ flexGrow: n, flexBasis: 0 }}
                          aria-label={`${r} risk, ${g.label}: ${n}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {r} risk · {g.label}: {fmtInt(n)} accounts
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
              <span className="text-right text-xs tnum">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

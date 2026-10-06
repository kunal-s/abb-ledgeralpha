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

export const statusGroupOf = (status: string) => STATUS_GROUPS.find((g) => g.statuses.includes(status as AccountReviewStatus))?.key ?? "not-started";

export interface BarGroup {
  key: string;
  label: string;
  cls: string;
}

interface StatusBarsProps<K extends string> {
  data: Record<K, Record<string, number>>;
  /** the rows to draw; risk tiers by default */
  rows?: { key: K; label: string }[];
  /** the segments of each bar; review statuses by default */
  groups?: BarGroup[];
  /** what the bars count, for the hover text */
  unit?: string;
  labelWidth?: string;
  onSelect?: (row: K, groupKey: string) => void;
}

const RISK_ROWS: { key: RiskTier; label: string }[] = (["High", "Medium", "Low"] as const).map((r) => ({ key: r, label: `${r} risk` }));

/** Items per row, stacked by review status. */
export function StatusBars<K extends string = RiskTier>({ data, rows, groups = STATUS_GROUPS, unit = "accounts", labelWidth = "6rem", onSelect }: StatusBarsProps<K>) {
  const lines = (rows ?? (RISK_ROWS as unknown as { key: K; label: string }[]));
  const totalOf = (r: K) => groups.reduce((s, g) => s + (data[r]?.[g.key] ?? 0), 0);
  const max = Math.max(1, ...lines.map((r) => totalOf(r.key)));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {groups.map((g) => (
          <span key={g.key} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-sm", g.cls)} />
            {g.label}
          </span>
        ))}
      </div>
      <div className="space-y-2.5">
        {lines.map((r) => {
          const total = totalOf(r.key);
          return (
            <div key={r.key} className="grid items-center gap-3" style={{ gridTemplateColumns: `${labelWidth} 1fr 2rem` }}>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{r.label}</span>
              <div className="flex h-5 gap-0.5" style={{ width: `${(total / max) * 100}%`, minWidth: total ? "1rem" : 0 }}>
                {groups.map((g) => {
                  const n = data[r.key]?.[g.key] ?? 0;
                  if (!n) return null;
                  return (
                    <Tooltip key={g.key}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onSelect?.(r.key, g.key)}
                          className={cn("h-full rounded-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", g.cls)}
                          style={{ flexGrow: n, flexBasis: 0 }}
                          aria-label={`${r.label}, ${g.label}: ${n}`}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        {r.label} · {g.label}: {fmtInt(n)} {unit}
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

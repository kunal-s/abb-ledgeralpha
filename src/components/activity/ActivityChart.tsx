import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt } from "@/lib/format";

export const FAMILIES = [
  { key: "data", label: "Data and rules", color: "var(--series-1)" },
  { key: "followups", label: "Follow-ups", color: "var(--series-2)" },
  { key: "decisions", label: "Decisions and approvals", color: "var(--series-3)" },
  { key: "signoffs", label: "Sign-offs and exports", color: "var(--series-4)" },
] as const;

export type FamilyKey = (typeof FAMILIES)[number]["key"];

export type WeekRow = { week: string; label: string } & Record<FamilyKey, number>;

function WeekTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeekRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const total = FAMILIES.reduce((s, f) => s + row[f.key], 0);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{row.label}</div>
      <div className="mt-1 space-y-0.5">
        {FAMILIES.filter((f) => row[f.key] > 0).map((f) => (
          <div key={f.key} className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: f.color }} />
            <span className="flex-1">{f.label}</span>
            <span className="tnum text-foreground">{fmtInt(row[f.key])}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-border pt-1 tnum">{fmtInt(total)} events</div>
      </div>
    </div>
  );
}

/** Stacked weekly activity by event family; legend always shown (≥ 2 series). */
export function ActivityChart({ data }: { data: WeekRow[] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
        {FAMILIES.map((f) => (
          <span key={f.key} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: f.color }} />
            {f.label}
          </span>
        ))}
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip content={<WeekTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
            {FAMILIES.map((f, i) => (
              <Bar
                key={f.key}
                dataKey={f.key}
                stackId="a"
                fill={f.color}
                stroke="hsl(var(--card))"
                strokeWidth={1}
                maxBarSize={26}
                radius={i === FAMILIES.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

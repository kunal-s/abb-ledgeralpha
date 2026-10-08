import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import type { WcPoint } from "@/engine/workingCapital";
import { fmtMonth } from "@/lib/dates";

const SERIES = [
  { key: "dso", label: "Receivable days", color: "var(--series-1)" },
  { key: "dio", label: "Inventory days", color: "var(--series-2)" },
  { key: "dpo", label: "Payable days", color: "var(--series-3)" },
] as const;

type Row = { label: string; dso: number; dio: number; dpo: number };

function WcTip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{r.label}</div>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tnum">{r[s.key]} days</span>
        </div>
      ))}
    </div>
  );
}

/** The recent months of receivable, inventory and payable days. */
export function WcTrend({ points }: { points: WcPoint[] }) {
  const data = points.map((p) => ({ month: fmtMonth(p.periodEnd).slice(0, 3), label: fmtMonth(p.periodEnd), dso: Math.round(p.dso), dio: Math.round(p.dio), dpo: Math.round(p.dpo) }));
  return (
    <div>
      <div className="mb-1 flex gap-4 text-2xs text-muted-foreground">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <RTooltip content={<WcTip />} cursor={{ stroke: "hsl(var(--border))" }} />
            {SERIES.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

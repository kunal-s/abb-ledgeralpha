import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { operatingProfit, type MonthPl } from "@/engine/pnl";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";

type Row = { label: string; month: string; revenue: number; margin: number; operating: number };

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{r.label}</div>
      <div className="flex justify-between gap-6"><span className="text-muted-foreground">Revenue</span><span className="tnum">{fmtINRCompact(r.revenue)}</span></div>
      <div className="flex justify-between gap-6"><span className="text-muted-foreground">Operating profit</span><span className="tnum">{fmtINRCompact(r.operating)}</span></div>
      <div className="flex justify-between gap-6"><span className="text-muted-foreground">Margin</span><span className="tnum">{r.margin.toFixed(1)}%</span></div>
    </div>
  );
}

/** Revenue by month as bars, and the operating margin as a line on its own axis. */
export function MonthlyResult({ months }: { months: { periodEnd: string; revenue: number; operating: number }[] }) {
  const data: Row[] = months.map((m) => ({ label: fmtMonth(m.periodEnd), month: fmtMonth(m.periodEnd).slice(0, 3), revenue: m.revenue, operating: m.operating, margin: m.revenue ? (m.operating / m.revenue) * 100 : 0 }));
  const max = Math.max(1, ...data.map((d) => d.margin));
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis yAxisId="rev" tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtINRCompact(v).replace("₹", "")} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis yAxisId="m" orientation="right" domain={[0, Math.ceil(max * 1.6)]} tickLine={false} axisLine={false} width={36} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <RTooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
          <Bar yAxisId="rev" dataKey="revenue" fill="hsl(var(--primary) / 0.28)" radius={[3, 3, 0, 0]} maxBarSize={28} />
          <Line yAxisId="m" type="monotone" dataKey="margin" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2.5, fill: "hsl(var(--primary))" }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export const toMonthRows = (months: MonthPl[], bu: string) =>
  months.map((m) => {
    const p = bu === "all" ? m.total : m.byBusinessUnit[bu];
    return { periodEnd: m.periodEnd, revenue: p?.revenue ?? 0, operating: p ? operatingProfit(p) : 0 };
  });


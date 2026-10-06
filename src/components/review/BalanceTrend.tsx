import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDrCr, fmtINRCompact } from "@/lib/format";

export interface TrendPoint {
  month: string;
  label: string;
  closing: number;
}

function TrendTip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{p.label}</div>
      <div className="tnum text-muted-foreground">{fmtDrCr(p.closing)}</div>
    </div>
  );
}

/** Month-end closing balance - single series; the title names it. */
export function BalanceTrend({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtINRCompact(v)} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Tooltip content={<TrendTip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
          <Bar dataKey="closing" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

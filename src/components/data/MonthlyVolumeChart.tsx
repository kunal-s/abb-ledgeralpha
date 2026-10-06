import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtInt } from "@/lib/format";

export interface MonthlyVolume {
  month: string; // "Sep 26"
  label: string; // "Sep 2026"
  lines: number;
  documents: number;
}

function VolumeTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyVolume }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium text-foreground">{d.label}</div>
      <div className="mt-1 tnum text-muted-foreground">
        {fmtInt(d.lines)} line items · {fmtInt(d.documents)} documents
      </div>
    </div>
  );
}

/** Single-series bar chart: line items landed per posting month. */
export function MonthlyVolumeChart({ data }: { data: MonthlyVolume[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="0" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} interval={2} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
          <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtInt(v)} />
          <Tooltip content={<VolumeTooltip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
          <Bar dataKey="lines" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

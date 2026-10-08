// A bridge from one result to another: the start, each effect as a floating
// bar, the end. Floating bars are ranges, so a result that dips below zero
// draws correctly. Gains and drags carry a sign in the tooltip and in the
// table beside the chart, never colour alone.

import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtINRCompact } from "@/lib/format";

export interface WaterfallStep {
  id: string;
  label: string;
  effect: number;
}

interface Span {
  name: string;
  range: [number, number];
  kind: "total" | "gain" | "drag";
  value: number;
  /** the running total after the bar */
  after: number;
}

function build(start: number, end: number, startLabel: string, endLabel: string, steps: WaterfallStep[]): Span[] {
  const out: Span[] = [{ name: startLabel, range: [Math.min(0, start), Math.max(0, start)], kind: "total", value: start, after: start }];
  let cum = start;
  for (const s of steps) {
    const next = cum + s.effect;
    out.push({ name: s.label, range: [Math.min(cum, next), Math.max(cum, next)], kind: s.effect >= 0 ? "gain" : "drag", value: s.effect, after: next });
    cum = next;
  }
  out.push({ name: endLabel, range: [Math.min(0, end), Math.max(0, end)], kind: "total", value: end, after: end });
  return out;
}

const FILL = { total: "hsl(var(--primary))", gain: "hsl(var(--ok))", drag: "hsl(var(--danger))" } as const;

function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = (payload?.value ?? "").split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 11 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return (
    <text x={x} y={(y ?? 0) + 10} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={10.5}>
      {lines.slice(0, 3).map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 12}>
          {l}
        </tspan>
      ))}
    </text>
  );
}

function Tip({ active, payload }: { active?: boolean; payload?: { payload: Span }[] }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{b.name}</div>
      <div className="tnum">{b.kind === "total" ? fmtINRCompact(b.value) : `${b.value >= 0 ? "+" : ""}${fmtINRCompact(b.value)}`}</div>
      {b.kind !== "total" && <div className="tnum text-muted-foreground">result after: {fmtINRCompact(b.after)}</div>}
    </div>
  );
}

export function Waterfall({ start, end, startLabel, endLabel, steps }: { start: number; end: number; startLabel: string; endLabel: string; steps: WaterfallStep[] }) {
  const data = build(start, end, startLabel, endLabel, steps);
  return (
    <div className="h-72 w-full" role="img" aria-label={`Bridge from ${startLabel} to ${endLabel}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 14 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="name" interval={0} tickLine={false} axisLine={false} height={54} tick={<Tick />} />
          <YAxis tickLine={false} axisLine={false} width={78} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v: number) => fmtINRCompact(v)} />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Tooltip content={<Tip />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
          <Bar dataKey="range" radius={[3, 3, 3, 3]} maxBarSize={34} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={FILL[d.kind]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

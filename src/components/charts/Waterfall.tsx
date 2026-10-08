import { fmtDrCr } from "@/lib/format";
import { cn } from "@/lib/utils";

export type WaterfallTone = "ink" | "step" | "ok" | "danger";

export interface WaterfallColumn {
  key: string;
  label: string;
  sub?: string;
  /** level before and after: a total column runs from 0 to its value, a step from its previous level */
  from: number;
  to: number;
  /** the figure written over the bar */
  value: number;
  tone: WaterfallTone;
  /** a dashed connector from the previous level */
  connect?: boolean;
}

const FILL: Record<WaterfallTone, string> = { ink: "bg-foreground/80", step: "bg-primary", ok: "bg-ok", danger: "bg-danger" };

interface WaterfallProps {
  columns: WaterfallColumn[];
  /** the range the plot has to cover; always include zero */
  min: number;
  max: number;
  plot?: number;
  pad?: number;
  /** how the figure over a bar is written; signed Dr / Cr by default */
  format?: (v: number) => string;
}

/** Floating bars on a shared scale: totals stand on the zero line, steps hang from the level before them. */
export function Waterfall({ columns, min, max, plot = 260, pad = 26, format = (v) => (v === 0 ? "Nil" : fmtDrCr(v, true)) }: WaterfallProps) {
  const range = Math.max(1, max - min);
  const y = (v: number) => pad + ((max - v) / range) * (plot - 2 * pad);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bar = (a: number, c: number) => ({ top: y(Math.max(clamp(a), clamp(c))), height: Math.max(2, Math.abs(y(clamp(a)) - y(clamp(c)))) });
  return (
    <div className="flex gap-2">
      {columns.map((c, i) => {
        const pos = bar(c.from, c.to);
        const above = c.tone === "step" ? c.value >= 0 || c.to >= c.from : c.value >= 0;
        return (
          <div key={c.key} className="min-w-0 flex-1">
            <div className="relative" style={{ height: plot }}>
              {min <= 0 && max >= 0 && <div className="absolute inset-x-0 border-t border-border" style={{ top: y(0) }} />}
              {c.connect && <div className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: y(clamp(c.from)) }} />}
              <div
                className={cn("anim-rise absolute left-1/2 w-[min(62%,76px)] -translate-x-1/2 rounded-[2px]", FILL[c.tone])}
                style={{ ...pos, animationDelay: `${i * 90}ms` }}
                aria-label={`${c.label}: ${format(c.value)}`}
              />
              <div className="absolute inset-x-0 text-center text-xs font-medium tnum" style={{ top: above ? pos.top - 19 : pos.top + pos.height + 4 }}>
                {format(c.value)}
              </div>
            </div>
            <div className="mt-2 px-1 text-center">
              <div className="line-clamp-2 text-xs font-medium leading-4">{c.label}</div>
              {c.sub && <div className="text-2xs text-muted-foreground">{c.sub}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

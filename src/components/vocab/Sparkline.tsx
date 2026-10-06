import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** semantic tone of the line */
  tone?: "ok" | "warn" | "danger" | "info" | "primary";
  className?: string;
  /** subtle area fill under the line */
  fill?: boolean;
}

const STROKE: Record<NonNullable<SparklineProps["tone"]>, string> = {
  ok: "hsl(var(--ok))",
  warn: "hsl(var(--warn))",
  danger: "hsl(var(--danger))",
  info: "hsl(var(--info))",
  primary: "hsl(var(--primary))",
};

/** Tiny dependency-free SVG sparkline for KPI tiles. */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  tone = "primary",
  className,
  fill = true,
}: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (data.length - 1);

  const pts = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (1 - (d - min) / range) * (height - pad * 2);
    return [x, y] as const;
  });

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area =
    `${pad},${height - pad} ` +
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ") +
    ` ${(width - pad).toFixed(1)},${height - pad}`;
  const stroke = STROKE[tone];
  const gid = `spark-${tone}-${data.length}-${Math.round(min)}-${Math.round(max)}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      preserveAspectRatio="none"
    >
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#${gid})`} />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r={1.8}
        fill={stroke}
      />
    </svg>
  );
}

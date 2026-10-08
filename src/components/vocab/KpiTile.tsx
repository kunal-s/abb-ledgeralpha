import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface KpiTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  /** trend direction relative to a target/prior; semantics set by `goodWhen` */
  delta?: string;
  trend?: "up" | "down" | "flat";
  /** which direction is "good" - colors the delta accordingly */
  goodWhen?: "up" | "down";
  sublabel?: ReactNode;
  icon?: ReactNode;
  accent?: "ok" | "warn" | "danger" | "info" | "none";
  /** optional chart slot (e.g. a Sparkline) rendered to the right of the value */
  chart?: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function KpiTile({
  label,
  value,
  unit,
  delta,
  trend = "flat",
  goodWhen = "up",
  sublabel,
  icon,
  accent = "none",
  chart,
  className,
  onClick,
}: KpiTileProps) {
  const isGood =
    trend === "flat"
      ? null
      : (trend === "up" && goodWhen === "up") ||
        (trend === "down" && goodWhen === "down");
  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;

  const dot = {
    ok: "bg-ok",
    warn: "bg-warn",
    danger: "bg-danger",
    info: "bg-info",
    none: "",
  }[accent];

  return (
    <Card
      onClick={onClick}
      className={cn(
        "kpi-tile relative overflow-hidden px-4 py-3.5",
        onClick && "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {accent !== "none" && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium tracking-tight tnum text-foreground">
              {value}
            </span>
            {unit && (
              <span className="text-xs font-medium text-muted-foreground">
                {unit}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {delta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-2xs font-medium tnum",
                  isGood === null
                    ? "text-muted-foreground"
                    : isGood
                    ? "text-ok-foreground"
                    : "text-danger-foreground"
                )}
              >
                <TrendIcon className="h-3 w-3" />
                {delta}
              </span>
            )}
            {sublabel && (
              <span className="text-2xs text-muted-foreground">{sublabel}</span>
            )}
          </div>
        </div>
        {chart && <div className="shrink-0 self-center">{chart}</div>}
      </div>
    </Card>
  );
}

import { Badge } from "@/components/ui/badge";
import type { Severity } from "@/types";
import { cn } from "@/lib/utils";

const MAP: Record<
  Severity,
  { label: string; variant: "ok" | "warn" | "danger" | "info" | "default" }
> = {
  low: { label: "Low", variant: "default" },
  medium: { label: "Medium", variant: "info" },
  high: { label: "High", variant: "warn" },
  critical: { label: "Critical", variant: "danger" },
};

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const m = MAP[severity];
  return (
    <Badge variant={m.variant} className={cn("uppercase tracking-wide", className)}>
      {m.label}
    </Badge>
  );
}

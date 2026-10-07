import { cn } from "@/lib/utils";
import { STATUS_MAP, type Tone } from "@/lib/status";

const TONE_CLS: Record<Tone, { wrap: string; dot: string }> = {
  ok: { wrap: "bg-ok-subtle text-ok-foreground", dot: "bg-ok" },
  warn: { wrap: "bg-warn-subtle text-warn-foreground", dot: "bg-warn" },
  danger: { wrap: "bg-danger-subtle text-danger-foreground", dot: "bg-danger" },
  info: { wrap: "bg-info-subtle text-info-foreground", dot: "bg-info" },
  neutral: { wrap: "bg-secondary text-secondary-foreground", dot: "bg-muted-foreground" },
};

interface StatusChipProps {
  status: string;
  className?: string;
  dot?: boolean;
  /** override label */
  label?: string;
}

export function StatusChip({ status, className, dot = true, label }: StatusChipProps) {
  const def = STATUS_MAP[status] ?? { label: label ?? status, tone: "neutral" as Tone };
  const tc = TONE_CLS[def.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-medium",
        tc.wrap,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", tc.dot)} />}
      {label ?? def.label}
    </span>
  );
}

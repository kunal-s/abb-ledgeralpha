import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

// Central status -> {label, tone} map. Keys match the status unions in
// src/types (ItemStatus, AccountReviewStatus). Modules add their statuses here.
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Item lifecycle (docs/FRD.md §4.4)
  "within-policy": { label: "Within policy", tone: "ok" },
  flagged: { label: "Flagged", tone: "danger" },
  "in-follow-up": { label: "In follow-up", tone: "warn" },
  "decision-proposed": { label: "Decision proposed", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  exported: { label: "Exported", tone: "info" },
  "closed-in-erp": { label: "Closed in ERP", tone: "ok" },
  // Account sign-off lifecycle (docs/FRD.md §4.4)
  "not-started": { label: "Not started", tone: "neutral" },
  "in-review": { label: "In review", tone: "info" },
  "ready-for-signoff": { label: "Ready for sign-off", tone: "warn" },
  "preparer-signed": { label: "Preparer signed", tone: "info" },
  "reviewer-signed": { label: "Signed off", tone: "ok" },
  reopened: { label: "Reopened", tone: "warn" },
  // Tax review
  cleared: { label: "Tax cleared", tone: "ok" },
  objected: { label: "Tax objection", tone: "danger" },
};

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
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-2xs font-medium",
        tc.wrap,
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", tc.dot)} />}
      {label ?? def.label}
    </span>
  );
}

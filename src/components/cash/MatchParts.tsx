import { Check, X } from "lucide-react";
import type { ConfidenceFactor } from "@/types";
import { LEVEL_LABELS, type Proposal, type Receipt } from "@/engine/cashapp";
import { fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The receipt against the invoices, line by line (FR-CAP-01): what was invoiced, what was deducted, what is left. */
export function MatchArithmetic({ p, receipt }: { p: Proposal; receipt: Receipt }) {
  const deducted = p.deductions.reduce((s, d) => s + d.amount, 0);
  const expected = p.invoiceTotal - deducted - p.residual;
  const Row = ({ label, detail, amount, strong, tone }: { label: string; detail?: string; amount: string; strong?: boolean; tone?: "ok" | "danger" }) => (
    <div className={cn("grid grid-cols-[1fr_auto] items-baseline gap-4 px-4 py-2", strong && "border-t border-border bg-muted/40")}>
      <div className="min-w-0">
        <div className={cn("truncate text-sm", strong && "font-semibold")}>{label}</div>
        {detail && <div className="truncate text-2xs text-muted-foreground">{detail}</div>}
      </div>
      <div className={cn("tnum text-sm", strong && "font-semibold", tone === "ok" && "text-ok-foreground", tone === "danger" && "text-danger-foreground")}>{amount}</div>
    </div>
  );
  return (
    <div className="divide-y divide-border/60">
      {p.invoices.map((i) => (
        <Row key={i.key} label={`Invoice ${i.reference}`} detail={`${i.docNo} · dated ${fmtDate(i.date)}${i.dueDate ? ` · due ${fmtDate(i.dueDate)}` : ""} · taxable ${fmtINR(i.taxable)}`} amount={fmtINR(i.gross)} />
      ))}
      <Row label="Total of the invoices" amount={fmtINR(p.invoiceTotal)} strong />
      {p.deductions.map((d) => (
        <Row key={d.kind + d.label} label={`Less: ${d.label}`} detail={d.basis} amount={`-${fmtINR(d.amount)}`} />
      ))}
      {p.residual > 0 && <Row label="Not explained: short payment" detail="Stays open on the invoice and needs a follow-up" amount={`-${fmtINR(p.residual)}`} tone="danger" />}
      <Row label="Expected receipt" amount={fmtINR(expected)} strong />
      <Row label="Receipt per bank" detail={`${receipt.utr ?? receipt.docNo} · ${fmtDate(receipt.date)}`} amount={fmtINR(receipt.amount)} />
      <Row label="Difference" amount={expected === receipt.amount ? "Nil" : fmtINR(expected - receipt.amount)} strong tone={expected === receipt.amount ? "ok" : "danger"} />
    </div>
  );
}

/** What the confidence is made of: each factor met or not, summing to the score. */
export function Factors({ factors, confidence }: { factors: ConfidenceFactor[]; confidence: number }) {
  return (
    <ul className="space-y-1">
      {factors.map((f) => (
        <li key={f.label} className="flex items-center gap-2 text-xs">
          {f.met ? <Check className="h-3.5 w-3.5 shrink-0 text-ok" /> : <X className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
          <span className={cn("flex-1", !f.met && "text-muted-foreground")}>{f.label}</span>
          <span className={cn("tnum", f.met ? "text-foreground" : "text-muted-foreground/60")}>{f.met ? `+${f.weight.toFixed(2)}` : f.weight.toFixed(2)}</span>
        </li>
      ))}
      <li className="flex items-center justify-between border-t border-border pt-1.5 text-xs font-semibold">
        <span>Confidence</span>
        <span className="tnum">{confidence.toFixed(2)}</span>
      </li>
    </ul>
  );
}

/** "L3 Deduction inferred" */
export const levelText = (p: Pick<Proposal, "level">) => `${p.level} ${LEVEL_LABELS[p.level]}`;

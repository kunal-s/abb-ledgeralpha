import { Waterfall, type WaterfallColumn } from "@/components/charts/Waterfall";
import type { Proposal } from "@/engine/cashapp";
import { fmtINRCompact, fmtInt } from "@/lib/format";

/** The receipt, what was deducted on the way, and the invoices it settles: receipt + deductions + unexplained = invoices. */
export function ReceiptFlow({ proposal }: { proposal: Proposal }) {
  let level = proposal.receipt;
  const cols: WaterfallColumn[] = [{ key: "receipt", label: "Receipt", sub: "in the bank", from: 0, to: level, value: level, tone: "ink" }];
  for (const d of proposal.deductions) {
    cols.push({ key: d.kind, label: d.label, sub: d.rate ? `${+(d.rate * 100).toFixed(2)}% of the value` : "deducted by the payer", from: level, to: level + d.amount, value: d.amount, tone: "step", connect: true });
    level += d.amount;
  }
  if (proposal.residual !== 0) {
    cols.push({ key: "residual", label: "Unexplained", sub: "short payment", from: level, to: level + proposal.residual, value: proposal.residual, tone: "danger", connect: true });
    level += proposal.residual;
  }
  cols.push({ key: "invoices", label: "Invoices settled", sub: `${fmtInt(proposal.invoices.length)} invoice${proposal.invoices.length === 1 ? "" : "s"}`, from: 0, to: level, value: level, tone: "ok" });
  const max = Math.max(...cols.map((c) => Math.max(c.from, c.to)));
  const gap = max - proposal.receipt;
  // when what is added on the way is small against the receipt, start the scale just below the receipt so the steps can be seen
  const broken = gap > 0 && gap / max < 0.25;
  const min = broken ? Math.max(0, proposal.receipt - gap * 3) : 0;
  return (
    <div>
      <Waterfall columns={cols} min={min} max={max + (broken ? gap * 0.15 : 0)} plot={220} format={(v) => fmtINRCompact(v)} />
      {broken && <div className="mt-2 text-2xs text-muted-foreground">The scale starts at {fmtINRCompact(min)}, so the deductions can be seen against the receipt</div>}
    </div>
  );
}

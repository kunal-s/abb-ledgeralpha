import { Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID } from "@/data";
import type { ItemRow } from "@/state/hooks";
import { fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A customer's tax deduction against the credit statement: what we booked, what the statement credits,
 * what is short, and how long is left to claim it. Shown for items BSR-07 flagged.
 */
export function CreditStatement({ row }: { row: ItemRow }) {
  const hit = row.hits.find((h) => h.ruleId === "BSR-07");
  if (!hit) return null;
  const it = row.item;
  const f = hit.facts;
  const party = it.partner ? PARTY_BY_ID.get(it.partner.id) : undefined;
  const deducted = Math.abs(it.amount);
  const credited = Number(f.credited) || 0;
  const short = deducted - credited;
  const elapsed = Number(f.taxYearsElapsed) || 0;
  const window = Number(f.writeOffYears) || 0;
  const barred = elapsed > window;

  const lines: { label: string; note: string; amount: string; strong?: boolean; tone?: "danger" }[] = [
    { label: "Tax deducted by the customer", note: `document ${it.docNo}, ${fmtDate(it.postingDate)}, ${String(f.quarter)}`, amount: fmtINR(deducted), strong: true },
    { label: "Credited in the tax statement", note: String(f.creditStatus), amount: credited ? fmtINR(-credited) : "Nil" },
    { label: "Credit not received", note: barred ? "claim window has passed; a write-off needs tax review" : "to be claimed from the customer or corrected in the statement", amount: fmtINR(short), strong: true, tone: short ? "danger" : undefined },
  ];

  return (
    <Panel title="Tax credit position" bodyClassName="p-0">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Customer</div>
          <div className="truncate">{party?.name ?? "-"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Deductor ID</div>
          <div className="font-mono text-xs leading-5">{String(f.deductor || "-")}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Age</div>
          <div>{String(f.ageDays)} days</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Claim window</div>
          <div>
            {elapsed} of {window} tax years used
          </div>
        </div>
      </div>
      <Table>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.label} className={cn(l.strong && "bg-muted/40")}>
              <TableCell className={cn("py-2", l.strong && "font-medium")}>{l.label}</TableCell>
              <TableCell className="py-2 text-xs text-muted-foreground">{l.note}</TableCell>
              <TableCell className={cn("py-2 text-right tnum whitespace-nowrap", l.strong && "font-semibold", l.tone === "danger" && "text-danger-foreground")}>{l.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

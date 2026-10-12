import { Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { GL_BY_ID, PARTY_BY_ID, WORLD } from "@/data";
import { ECL_ALLOWANCE, ECL_EXPENSE } from "@/engine/journals";
import type { ItemRow } from "@/state/hooks";
import { fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A vendor advance in the form a controller reads it: what was paid, what has been delivered or invoiced
 * against the order, what the bank guarantee covers, and what is left exposed. Shown for items BSR-05 flagged.
 */
export function ExposureStatement({ row }: { row: ItemRow }) {
  const hit = row.hits.find((h) => h.ruleId === "BSR-05");
  if (!hit) return null;
  const it = row.item;
  const facts = hit.facts;
  const amount = Math.abs(it.amount);
  const party = it.partner ? PARTY_BY_ID.get(it.partner.id) : undefined;
  const po = it.po ? WORLD.purchaseOrders.find((p) => p.po === it.po!.number && p.item === it.po!.item) : undefined;
  const gr = po?.lastGrDate && po.lastGrDate >= it.postingDate ? po.lastGrDate : undefined;
  const inv = po?.lastInvoiceDate && po.lastInvoiceDate >= it.postingDate ? po.lastInvoiceDate : undefined;
  const bgAmount = Number(facts.bgAmount) || 0;
  const cover = Math.min(bgAmount, amount);
  const exposed = amount - cover;
  const provide = row.rec?.action === "Provide";

  const lines: { label: string; note?: string; amount?: string; strong?: boolean; tone?: "danger" }[] = [
    { label: "Advance paid", note: `${fmtDate(it.postingDate)}, document ${it.docNo}, ${row.age} days`, amount: fmtINR(amount), strong: true },
    { label: "Less: goods received", note: gr ? `last receipt ${fmtDate(gr)}` : "none since the advance", amount: gr ? "see PO" : "Nil" },
    { label: "Less: invoiced", note: inv ? `last invoice ${fmtDate(inv)}` : "none since the advance", amount: inv ? "see PO" : "Nil" },
    { label: "Less: bank guarantee", note: facts.bgNo ? `${facts.bgNo}, valid to ${fmtDate(String(facts.bgValidTo))}` : "none held", amount: cover ? fmtINR(-cover) : "Nil" },
    { label: "Exposure not covered", note: exposed === amount ? "no delivery and no cover" : undefined, amount: fmtINR(exposed), strong: true, tone: exposed ? "danger" : undefined },
  ];
  if (provide) {
    lines.push({
      label: "Provision proposed",
      note: `Dr ${ECL_EXPENSE} ${GL_BY_ID.get(ECL_EXPENSE)?.description ?? ""}, Cr ${ECL_ALLOWANCE} ${GL_BY_ID.get(ECL_ALLOWANCE)?.description ?? ""}`,
      amount: fmtINR(amount),
      strong: true,
    });
  }

  return (
    <Panel title="Advance exposure" bodyClassName="p-0">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-border px-4 py-3 text-sm md:grid-cols-4">
        <div>
          <div className="text-xs text-muted-foreground">Vendor</div>
          <div className="truncate">{party?.name ?? "-"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Vendor status</div>
          <div>{String(facts.vendorStatus || party?.status || "-")}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Purchase order</div>
          <div className="truncate">{it.po ? `${it.po.number} / ${it.po.item}` : "-"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Order status, idle</div>
          <div>
            {String(facts.poStatus || "-")}, {String(facts.poIdleDays ?? "-")} days
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

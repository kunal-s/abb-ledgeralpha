import { Link } from "react-router-dom";
import { Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { previousQuarterEnd } from "@/engine/context";
import { grirByPo, rollforward, subLedgerByPartner } from "@/engine/recDrill";
import { WORLD } from "@/data";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";
import type { Reconciliation } from "@/types";

const SHOWN = 8;

/** The sub-ledger behind a control account: open items by business partner, tied to the balance per sub-ledger. */
function SubLedger({ rec }: { rec: Reconciliation }) {
  const v = subLedgerByPartner(rec.gl!);
  const shown = v.partners.slice(0, SHOWN);
  const rest = v.partners.slice(SHOWN);
  const restTotal = rest.reduce((s, p) => s + p.balance, 0);
  return (
    <Panel title="Sub-ledger by business partner" actions={<span className="text-xs text-muted-foreground tnum">{fmtInt(v.partners.length)} partners</span>} bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business partner</TableHead>
            <TableHead className="text-right">Open items</TableHead>
            <TableHead className="text-right">Oldest</TableHead>
            <TableHead className="text-right">Over 90 days</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((p) => (
            <TableRow key={p.partnerId}>
              <TableCell className="max-w-64 truncate">{p.name}</TableCell>
              <TableCell className="text-right tnum">{fmtInt(p.count)}</TableCell>
              <TableCell className="text-right tnum">{fmtInt(p.oldest)} d</TableCell>
              <TableCell className="text-right tnum">{p.over90 ? fmtDrCr(p.over90, true) : "-"}</TableCell>
              <TableCell className="text-right tnum">{fmtDrCr(p.balance, true)}</TableCell>
            </TableRow>
          ))}
          {rest.length > 0 && (
            <TableRow>
              <TableCell className="text-muted-foreground">{fmtInt(rest.length)} other partners</TableCell>
              <TableCell className="text-right tnum text-muted-foreground">{fmtInt(rest.reduce((s, p) => s + p.count, 0))}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right tnum text-muted-foreground">{fmtDrCr(restTotal, true)}</TableCell>
            </TableRow>
          )}
          <TableRow className="border-t-2 border-border font-medium">
            <TableCell colSpan={4}>Balance per sub-ledger</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(v.total, true)}</TableCell>
          </TableRow>
          <TableRow className="text-muted-foreground">
            <TableCell colSpan={4}>
              Posted to the control account with no business partner ({fmtInt(v.direct.count)} item{v.direct.count === 1 ? "" : "s"})
            </TableCell>
            <TableCell className="text-right tnum">{v.direct.total === 0 ? "Nil" : fmtDrCr(v.direct.total, true)}</TableCell>
          </TableRow>
          <TableRow className="font-medium">
            <TableCell colSpan={4}>Balance per control account</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(rec.booksBalance, true)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="border-t border-border px-4 py-2 text-xs">
        <Link to={`/balance-sheet-review/${rec.gl}`} className="font-medium text-primary hover:underline">Review the open items of this account</Link>
      </div>
    </Panel>
  );
}

/** A supporting schedule's account rolled forward: opening balance, the period's postings, closing balance. */
function Rollforward({ rec }: { rec: Reconciliation }) {
  const f = rollforward(rec.gl!, previousQuarterEnd(WORLD.asOf));
  return (
    <Panel title="Roll-forward of the account" bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Movement</TableHead>
            <TableHead className="text-right">Postings</TableHead>
            <TableHead className="text-right">Debits</TableHead>
            <TableHead className="text-right">Credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="font-medium">
            <TableCell colSpan={3}>Opening balance</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(f.opening, true)}</TableCell>
          </TableRow>
          {f.lines.map((l) => (
            <TableRow key={l.key}>
              <TableCell>{l.label}</TableCell>
              <TableCell className="text-right tnum">{fmtInt(l.count)}</TableCell>
              <TableCell className="text-right tnum">{l.debit ? fmtDrCr(l.debit, true) : "-"}</TableCell>
              <TableCell className="text-right tnum">{l.credit ? fmtDrCr(-l.credit, true) : "-"}</TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 border-border font-medium">
            <TableCell colSpan={3}>Closing balance per books</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(f.closing, true)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}

/** GR/IR account by purchase order: what was received and not invoiced, and what was invoiced and not received. */
function GrirByPo({ rec }: { rec: Reconciliation }) {
  const v = grirByPo(rec.gl!);
  const shown = v.orders.slice(0, SHOWN);
  const rest = v.orders.slice(SHOWN);
  return (
    <Panel title="GR/IR by purchase order" actions={<span className="text-xs text-muted-foreground tnum">{fmtInt(v.orders.length)} orders</span>} bodyClassName="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Purchase order</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Last receipt</TableHead>
            <TableHead className="text-right">Received, not invoiced</TableHead>
            <TableHead className="text-right">Invoiced, not received</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((o) => (
            <TableRow key={o.po}>
              <TableCell className="font-mono text-xs">{o.po}</TableCell>
              <TableCell className="max-w-48 truncate">{o.vendor}</TableCell>
              <TableCell className="text-xs">{o.status}</TableCell>
              <TableCell className="whitespace-nowrap text-xs tnum">{o.lastGr ? fmtDate(o.lastGr) : "-"}</TableCell>
              <TableCell className="text-right tnum">{o.received ? fmtDrCr(o.received, true) : "-"}</TableCell>
              <TableCell className="text-right tnum">{o.invoiced ? fmtDrCr(o.invoiced, true) : "-"}</TableCell>
              <TableCell className="text-right tnum">{fmtDrCr(o.net, true)}</TableCell>
            </TableRow>
          ))}
          {rest.length > 0 && (
            <TableRow className="text-muted-foreground">
              <TableCell colSpan={6}>{fmtInt(rest.length)} other orders</TableCell>
              <TableCell className="text-right tnum">{fmtDrCr(rest.reduce((s, o) => s + o.net, 0), true)}</TableCell>
            </TableRow>
          )}
          <TableRow className="border-t-2 border-border font-medium">
            <TableCell colSpan={6}>Balance per GR/IR account</TableCell>
            <TableCell className="text-right tnum">{fmtDrCr(v.total, true)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}

/** What stands behind the books balance, by reconciliation type. Other types show nothing here. */
export function BalanceDrill({ rec }: { rec: Reconciliation }) {
  if (!rec.gl) return null;
  if (rec.type === "Sub-ledger") return <SubLedger rec={rec} />;
  if (rec.type === "GR/IR") return <GrirByPo rec={rec} />;
  if (rec.type === "Schedule-supported") return <Rollforward rec={rec} />;
  return null;
}

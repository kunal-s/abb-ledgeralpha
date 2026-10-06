import { Link } from "react-router-dom";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useExpectedCredits } from "@/state/tdsHooks";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";

/** Withholding inferred from receipts waiting to be applied: expected as a credit, checked against the statement. */
export function ExpectedTab() {
  const expected = useExpectedCredits();
  const at = (s: string) => expected.filter((e) => e.check.status === s);
  const risk = expected.filter((e) => ["missing", "short", "wrong-quarter"].includes(e.check.status));
  const sum = (xs: typeof expected) => xs.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Expected credits" value={fmtInt(expected.length)} sublabel={fmtINRCompact(sum(expected))} />
        <KpiTile label="In the statement" value={fmtInt(at("matched").length)} sublabel={fmtINRCompact(sum(at("matched")))} accent="ok" />
        <KpiTile label="Not in the statement" value={fmtInt(risk.length)} sublabel={fmtINRCompact(sum(risk))} accent={risk.length ? "danger" : "none"} />
        <KpiTile label="Statement not yet available" value={fmtInt(at("pending").length)} sublabel={fmtINRCompact(sum(at("pending")))} />
      </div>
      <Panel title="Withholding inferred from receipt applications" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Receipt</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Deducted on</TableHead>
              <TableHead>Quarter</TableHead>
              <TableHead>Deduction</TableHead>
              <TableHead className="text-right">Expected credit</TableHead>
              <TableHead>Statement check</TableHead>
              <TableHead>Application</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expected.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  No receipt application proposes a withholding deduction
                </TableCell>
              </TableRow>
            )}
            {expected.map((e) => (
              <TableRow key={e.receiptKey + e.amount}>
                <TableCell className="py-2">
                  <Link to={`/cash-application/${e.receiptKey}`} className="font-mono text-xs text-primary hover:underline">
                    {e.receiptKey.split("-").slice(-2).join("-")}
                  </Link>
                </TableCell>
                <TableCell className="max-w-56 truncate py-2 text-sm">{e.customerName}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(e.date)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs">{e.quarter}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs">{e.label}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(e.amount)}</TableCell>
                <TableCell className="py-2">
                  <StatusChip status={e.check.status} />
                </TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">{e.inProgress ? "Approved, entering the books" : "Proposed"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

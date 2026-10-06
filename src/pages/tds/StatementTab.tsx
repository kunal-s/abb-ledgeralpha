import { useMemo } from "react";
import { Download } from "lucide-react";
import { KpiTile, Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID, WORLD } from "@/data";
import { useTds } from "@/state/tdsHooks";
import { downloadCsv } from "@/lib/exportCsv";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";

/** Credits the tax credit statement carries that no deduction in the books explains. */
export function StatementTab() {
  const { analysis } = useTds();
  const rows = useMemo(() => [...analysis.unbooked].sort((a, b) => b.taxCredited - a.taxCredited), [analysis]);
  const total = rows.reduce((s, c) => s + c.taxCredited, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Credits not in the books" value={fmtInt(rows.length)} sublabel={fmtINRCompact(total)} accent={rows.length ? "warn" : "none"} />
        <KpiTile label="Customers" value={fmtInt(new Set(rows.map((c) => c.customerId)).size)} sublabel="with unexplained credits" />
      </div>
      <Panel
        title="Tax credit statement lines with no deduction in the books"
        bodyClassName="p-0"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5"
            onClick={() =>
              downloadCsv(
                "tax-credit-statement-unbooked.csv",
                ["Statement line", "Customer", "Deductor ID", "Tax-year quarter", "Transaction date", "Nature of payment", "Amount paid", "Tax credited"],
                rows.map((c) => [c.id, PARTY_BY_ID.get(c.customerId)?.name ?? "", c.deductorTaxIdMasked, c.taxYearQuarter, fmtDate(c.transactionDate), c.natureOfPayment, c.amountPaid, c.taxCredited])
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Statement line</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Deductor ID</TableHead>
              <TableHead>Quarter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Nature of payment</TableHead>
              <TableHead className="text-right">Amount paid</TableHead>
              <TableHead className="text-right">Tax credited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 100).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="py-2 font-mono text-xs">{c.id}</TableCell>
                <TableCell className="max-w-56 truncate py-2 text-sm">{PARTY_BY_ID.get(c.customerId)?.name}</TableCell>
                <TableCell className="py-2 font-mono text-xs">{c.deductorTaxIdMasked}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs">{c.taxYearQuarter}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs tnum">
                  {fmtDate(c.transactionDate)} <span className="text-muted-foreground">· {daysBetween(c.transactionDate, WORLD.asOf)} d</span>
                </TableCell>
                <TableCell className="py-2 text-xs">{c.natureOfPayment}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(c.amountPaid)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(c.taxCredited)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

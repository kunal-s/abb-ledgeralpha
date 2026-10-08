import { useMemo } from "react";
import { Check } from "lucide-react";
import { Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { ageingNotes } from "@/engine/financials";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";

export function NotesTab() {
  const notes = useMemo(() => ageingNotes(WORLD.asOf), []);
  return (
    <div className="space-y-4">
      {notes.map((n) => (
        <Panel key={n.title} title={`${n.title} as at ${fmtDate(WORLD.asOf)}`} bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Outstanding for</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.bands.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="py-2 text-sm">{b.label}</TableCell>
                  <TableCell className="py-2 text-right tnum text-sm">{fmtInt(b.count)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(b.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t bg-muted/20 hover:bg-muted/20">
                <TableCell className="py-2 text-sm font-semibold">Open items</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-semibold">{fmtInt(n.bands.reduce((s, b) => s + b.count, 0))}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-semibold">{fmtINR(n.total)}</TableCell>
              </TableRow>
              {n.adjustments.map((a) => (
                <TableRow key={a.label}>
                  <TableCell className="py-2 text-sm">{a.label}</TableCell>
                  <TableCell />
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(a.amount)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                <TableCell className="py-2 text-sm font-semibold">
                  <span className="flex items-center gap-2">
                    {n.statementLine} per the balance sheet
                    {Math.abs(n.difference) < 1 && <Check className="h-4 w-4 text-ok" aria-label="Agrees to the balance sheet" />}
                  </span>
                </TableCell>
                <TableCell />
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-semibold">{fmtINR(n.perBalanceSheet)}</TableCell>
              </TableRow>
              {Math.abs(n.difference) >= 1 && (
                <TableRow>
                  <TableCell className="py-2 text-sm text-danger-foreground">Difference</TableCell>
                  <TableCell />
                  <TableCell className="py-2 text-right tnum text-sm text-danger-foreground">{fmtINR(n.difference)}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Panel>
      ))}
    </div>
  );
}

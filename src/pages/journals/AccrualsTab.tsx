import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BALANCES, balanceAt } from "@/data";
import { usePeriodStore } from "@/lib/stores";
import { previousQuarterEnd } from "@/engine/context";
import { monthLabel, provisionMovement, reversalCalendar } from "@/engine/accruals";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";

/** Credit-natured accounts read as positive provision sizes. */
const size = (v: number) => (v === 0 ? 0 : -v);
const cell = (v: number) => (v === 0 ? "-" : fmtINR(size(v)));

export function AccrualsTab() {
  const asOf = usePeriodStore((s) => s.periodEnd);
  const prior = previousQuarterEnd(asOf);
  const rows = useMemo(() => provisionMovement(prior, asOf), [prior, asOf]);
  const calendar = useMemo(() => reversalCalendar(asOf), [asOf]);

  const total = useMemo(
    () => rows.reduce((t, r) => ({ opening: t.opening + r.opening, provided: t.provided + r.provided, utilised: t.utilised + r.utilised, reversed: t.reversed + r.reversed, closing: t.closing + r.closing }), { opening: 0, provided: 0, utilised: 0, reversed: 0, closing: 0 }),
    [rows]
  );
  const toReverse = calendar.reduce((s, c) => s + c.amount, 0);
  const next = calendar[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Provisions and accruals" value={fmtINRCompact(size(total.closing))} sublabel={`${fmtInt(rows.length)} accounts · was ${fmtINRCompact(size(total.opening))}`} />
        <KpiTile label="Provided in the quarter" value={fmtINRCompact(size(total.provided))} sublabel="credits other than reversals" />
        <KpiTile label="Utilised" value={fmtINRCompact(total.utilised)} sublabel="settled against the provision" />
        <KpiTile label="Reversed" value={fmtINRCompact(total.reversed)} sublabel="earlier accruals taken back" />
        <KpiTile
          label="Accruals to reverse"
          value={fmtINRCompact(toReverse)}
          sublabel={next ? `next on ${fmtDate(next.dueDate)}` : "none outstanding"}
          accent={next ? "info" : "none"}
        />
      </div>

      <Panel title={`Roll-forward since ${fmtDate(prior)}`} bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Provided</TableHead>
              <TableHead className="text-right">Utilised</TableHead>
              <TableHead className="text-right">Reversed</TableHead>
              <TableHead className="text-right">Closing</TableHead>
              <TableHead className="text-center">Trial balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const tb = balanceAt(BALANCES, r.gl.gl, asOf)?.closing;
              const ties = tb !== undefined && Math.abs(tb - r.closing) < 0.5;
              return (
                <TableRow key={r.gl.gl}>
                  <TableCell className="max-w-72 py-2">
                    <Link to={`/balance-sheet-review/${r.gl.gl}`} className="block truncate text-sm hover:underline">
                      {r.gl.description}
                    </Link>
                    <div className="font-mono text-2xs text-muted-foreground">{r.gl.gl}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{cell(r.opening)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{cell(r.provided)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.utilised === 0 ? "-" : fmtINR(-r.utilised)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.reversed === 0 ? "-" : fmtINR(-r.reversed)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{cell(r.closing)}</TableCell>
                  <TableCell className="py-2 text-center">
                    {ties ? <Check className="mx-auto h-4 w-4 text-ok" aria-label="Agrees to the trial balance" /> : <span className="text-xs text-danger-foreground">{tb === undefined ? "Missing" : fmtINR(r.closing - tb)}</span>}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
              <TableCell className="py-2 text-sm font-medium">Total</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{cell(total.opening)}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{cell(total.provided)}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{fmtINR(-total.utilised)}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{fmtINR(-total.reversed)}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm font-medium">{cell(total.closing)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </Panel>

      <Panel title="Reversal calendar" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Accrual</TableHead>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">To reverse</TableHead>
              <TableHead className="text-right">Postings</TableHead>
              <TableHead className="text-right">Profit centres</TableHead>
              <TableHead>Reversal due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calendar.map((c) => (
              <TableRow key={c.reference}>
                <TableCell className="py-2 font-mono text-xs">{c.reference}</TableCell>
                <TableCell className="py-2 text-sm">{monthLabel(c.month)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(c.amount)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm">{fmtInt(c.lines)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm">{fmtInt(c.profitCentres)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(c.dueDate)}</TableCell>
                <TableCell className="py-2">
                  <StatusChip status={c.dueDate > asOf ? "due" : "overdue"} label={c.dueDate > asOf ? "Due next period" : "Overdue"} />
                </TableCell>
              </TableRow>
            ))}
            {calendar.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  Every month-end accrual has been reversed
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

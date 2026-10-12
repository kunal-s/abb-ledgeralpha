import { bridgeOf, type RecView } from "@/engine/recs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Reconciliation statement in the form a reviewer signs: balance per books, balance per the
 * other side, the difference, each class of reconciling item, and what is left unexplained.
 */
export function ReconStatement({ view, replyBalance, action }: { view: RecView; replyBalance?: number; action?: React.ReactNode }) {
  const { rec } = view;
  const b = bridgeOf(view);
  const source = view.sourceBalance ?? replyBalance ?? null;
  const diff = view.difference ?? (source === null ? null : rec.booksBalance - source);
  const row = "border-b border-border";
  const num = "text-right tnum whitespace-nowrap";

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Particulars</TableHead>
            <TableHead className="w-20 text-right">Items</TableHead>
            <TableHead className="w-44 text-right">Amount</TableHead>
            <TableHead className="w-44 text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className={row}>
            <TableCell className="font-medium">{rec.booksLabel}</TableCell>
            <TableCell />
            <TableCell />
            <TableCell className={cn(num, "font-medium")}>{fmtDrCr(rec.booksBalance)}</TableCell>
          </TableRow>
          <TableRow className={row}>
            <TableCell className="font-medium">
              {rec.sourceLabel}
              {view.sourceBalance === null && replyBalance !== undefined && <span className="ml-2 text-xs font-normal text-muted-foreground">reply received, not applied</span>}
            </TableCell>
            <TableCell />
            <TableCell />
            <TableCell className={cn(num, "font-medium")}>{source === null ? <span className="text-muted-foreground">Awaiting</span> : fmtDrCr(source)}</TableCell>
          </TableRow>
          <TableRow className={cn(row, "bg-muted/40")}>
            <TableCell className="font-semibold">Difference</TableCell>
            <TableCell />
            <TableCell />
            <TableCell className={cn(num, "font-semibold")}>{diff === null ? "-" : diff === 0 ? "Nil" : fmtDrCr(diff)}</TableCell>
          </TableRow>

          {b && view.sourceBalance !== null && (
            <>
              {b.steps.map((s) => (
                <TableRow key={s.key} className={row}>
                  <TableCell className="pl-6">Less: {s.label}</TableCell>
                  <TableCell className={num}>{fmtInt(s.count)}</TableCell>
                  <TableCell className={num}>{fmtDrCr(s.effect)}</TableCell>
                  <TableCell className={cn(num, "text-muted-foreground")}>{s.to === 0 ? "Nil" : fmtDrCr(s.to)}</TableCell>
                </TableRow>
              ))}
              {b.unclassified.count > 0 && (
                <TableRow className={row}>
                  <TableCell className="pl-6 text-muted-foreground">Not classified yet</TableCell>
                  <TableCell className={num}>{fmtInt(b.unclassified.count)}</TableCell>
                  <TableCell className={num}>{fmtDrCr(b.unclassified.effect)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              <TableRow className={cn(row, view.withinTolerance ? "bg-ok-subtle" : "bg-danger-subtle")}>
                <TableCell className="font-semibold">Unexplained</TableCell>
                <TableCell />
                <TableCell className={cn(num, "text-xs text-muted-foreground")}>tolerance {fmtINR(b.tolerance)}</TableCell>
                <TableCell className={cn(num, "font-semibold")}>{b.residual === 0 ? "Nil" : fmtDrCr(b.residual)}</TableCell>
              </TableRow>
            </>
          )}
        </TableBody>
      </Table>
      {action && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {action}
          <span>Explains the {diff !== null ? fmtINR(Math.abs(diff)) : ""} difference from the open items</span>
        </div>
      )}
    </div>
  );
}

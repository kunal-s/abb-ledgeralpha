import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { DocLink } from "@/components/vocab";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD, statementItems } from "@/data";
import { ageOf } from "@/engine/review";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Reconciliation } from "@/types";

/** The open items behind the balance per books: what the statement of account lists, oldest first. */
export function OpenItemsTable({ rec }: { rec: Reconciliation }) {
  const [open, setOpen] = useState(false);
  const items = statementItems(rec);
  if (items.length === 0) return null;
  const total = items.reduce((s, l) => s + l.amount, 0);
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <h2 className="text-sm font-semibold">Open items per books</h2>
        <span className="ml-auto text-xs text-muted-foreground tnum">
          {fmtInt(items.length)} items, {fmtDrCr(total)}
        </span>
      </button>
      {open && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((l) => {
              const age = ageOf(l, WORLD.asOf);
              return (
                <TableRow key={l.key}>
                  <TableCell className="whitespace-nowrap">
                    <DocLink itemKey={l.key}>{l.docNo}</DocLink>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(l.postingDate)}</TableCell>
                  <TableCell className="whitespace-nowrap">{l.dueDate ? fmtDate(l.dueDate) : "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{l.assignment ?? l.reference ?? "-"}</TableCell>
                  <TableCell className={cn("text-right tnum whitespace-nowrap", age > 90 && "font-medium text-warn-foreground")}>{fmtInt(age)} d</TableCell>
                  <TableCell className="text-right tnum whitespace-nowrap">{fmtDrCr(l.amount)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow className="border-t-2 border-border font-medium">
              <TableCell colSpan={5}>Balance per open items</TableCell>
              <TableCell className="text-right tnum whitespace-nowrap">{fmtDrCr(total)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

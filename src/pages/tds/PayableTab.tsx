import { useMemo } from "react";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GL_BY_ID, WORLD } from "@/data";
import { TAX_YEAR_START, tdsPayable } from "@/engine/tds";
import { fiscalYearStartDate, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";

const TDS_PAYABLE_GLS = ["241100", "241200", "241300"];
const NATURE: Record<string, string> = { "241100": "Contracts", "241200": "Professional fees", "241300": "Salaries" };

/** Tax the company deducted from payments: deducted, deposited by the 7th of the next month, outstanding. */
export function PayableTab() {
  const rows = useMemo(() => tdsPayable(WORLD.lines.filter((l) => TDS_PAYABLE_GLS.includes(l.gl)), WORLD.asOf), []);
  // tax deducted is reported by the statutory tax year, April to March, not the company's fiscal year
  const yearStart = fiscalYearStartDate(WORLD.asOf, TAX_YEAR_START).slice(0, 7);
  const thisYear = rows.filter((r) => r.month >= yearStart);
  const sum = (xs: typeof rows, k: "deducted" | "deposited" | "outstanding") => xs.reduce((s, r) => s + r[k], 0);
  const overdue = rows.filter((r) => r.status === "overdue");
  const late = rows.filter((r) => r.status === "deposited-late");
  const shown = rows.filter((r) => r.month >= yearStart || r.outstanding > 0).slice(0, 60);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Deducted this tax year" value={fmtINRCompact(sum(thisYear, "deducted"))} sublabel={`since ${fmtMonth(`${yearStart}-01`)}`} />
        <KpiTile label="Deposited" value={fmtINRCompact(sum(thisYear, "deposited"))} sublabel="of this year's deductions" accent="ok" />
        <KpiTile label="Outstanding" value={fmtINRCompact(sum(rows, "outstanding"))} sublabel={`${fmtInt(rows.filter((r) => r.outstanding > 0).length)} month-accounts`} accent={sum(rows, "outstanding") ? "info" : "none"} />
        <KpiTile label="Overdue" value={fmtINRCompact(sum(overdue, "outstanding"))} sublabel={`${fmtInt(overdue.length)} past the 7th`} accent={overdue.length ? "danger" : "none"} />
        <KpiTile label="Deposited late" value={fmtInt(late.length)} sublabel="month-accounts" accent={late.length ? "warn" : "none"} />
      </div>
      <Panel title="Tax deducted by the company, by month and nature of payment" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Nature of payment</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Deducted</TableHead>
              <TableHead className="text-right">Deposited</TableHead>
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={`${r.gl}-${r.month}`}>
                <TableCell className="whitespace-nowrap py-2 text-sm">{fmtMonth(`${r.month}-01`)}</TableCell>
                <TableCell className="py-2 text-sm">{NATURE[r.gl]}</TableCell>
                <TableCell className="py-2 text-xs text-muted-foreground">
                  <span className="font-mono">{r.gl}</span> {GL_BY_ID.get(r.gl)?.description}
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(r.deducted)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.deposited ? fmtINR(r.deposited) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{r.outstanding ? fmtINR(r.outstanding) : "-"}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-xs tnum">{fmtDate(r.due)}</TableCell>
                <TableCell className="py-2">
                  <div className="flex items-center gap-1.5">
                    <StatusChip status={r.status} />
                    {r.daysLate > 0 && <span className="text-2xs text-muted-foreground">{r.status === "overdue" ? `${r.daysLate} days overdue` : `${r.daysLate} days late`}</span>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

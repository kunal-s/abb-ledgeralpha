import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NATURES, icBalances, relatedPartyTransactions } from "@/engine/intercompany";
import { useRecRows } from "@/state/recHooks";
import { usePeriodStore } from "@/lib/stores";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Intercompany() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const navigate = useNavigate();
  const recRows = useRecRows();
  const balances = useMemo(() => icBalances(periodEnd), [periodEnd]);
  const rpt = useMemo(() => relatedPartyTransactions(periodEnd), [periodEnd]);
  const recOf = (id: string) => recRows.find((r) => r.rec.type === "Intercompany" && r.rec.partyId === id);

  const receivable = balances.reduce((s, b) => s + b.receivable, 0);
  const payable = balances.reduce((s, b) => s + b.payable, 0);
  const foreign = balances.reduce((s, b) => s + b.foreign, 0);
  const peak = Math.max(1, ...balances.flatMap((b) => [b.receivable, b.payable]));
  const unexplained = balances.reduce((s, b) => {
    const r = recOf(b.partnerId);
    return s + (r && r.view.unexplained !== null && !r.view.withinTolerance ? Math.abs(r.view.unexplained) : 0);
  }, 0);
  const income = rpt.rows.reduce((s, r) => s + r.income, 0);
  const expense = rpt.rows.reduce((s, r) => s + r.expense, 0);
  const incomeNatures = NATURES.filter((n) => n.side === "income");
  const expenseNatures = NATURES.filter((n) => n.side === "expense");

  return (
    <div className="space-y-4">
      <PageHeader title="Intercompany" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Owed to us" value={fmtINRCompact(receivable)} sublabel="by group companies" />
        <KpiTile label="We owe" value={fmtINRCompact(payable)} sublabel="to group companies" />
        <KpiTile label="Net" value={fmtINRCompact(Math.abs(receivable - payable))} sublabel={receivable >= payable ? "owed to us" : "owed by us"} />
        <KpiTile label="Unexplained against confirmations" value={fmtINRCompact(unexplained)} sublabel={`${fmtInt(balances.filter((b) => recOf(b.partnerId)?.view.withinTolerance === false).length)} counterparties outside tolerance`} accent={unexplained ? "danger" : "ok"} onClick={() => navigate("/reconciliations?tab=register&type=Intercompany")} />
        <KpiTile label="In foreign currency" hint="Group balances in a foreign currency are revalued at the closing rate; see FX Exposure." value={fmtINRCompact(foreign)} sublabel={`${((foreign / Math.max(1, receivable + payable)) * 100).toFixed(0)}% of group balances`} onClick={() => navigate("/fx-exposure")} />
      </div>

      <Panel title="Balances with group companies">
        <div className="mb-2 flex gap-4 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-warn" />We owe</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />Owed to us</span>
        </div>
        <ul className="divide-y divide-border">
          {balances.map((b, i) => {
            const r = recOf(b.partnerId);
            return (
              <li key={b.partnerId} className="grid grid-cols-[13rem_1fr_7rem_9rem] items-center gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <div className="text-2xs text-muted-foreground">{b.country}{b.currency ? `, ${b.currency}` : ""}</div>
                </div>
                <div className="relative h-5">
                  <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                  <div className="anim-grow-x absolute right-1/2 top-0 h-full rounded-[2px] bg-warn" style={{ width: `${(b.payable / peak) * 50}%`, animationDelay: `${i * 60}ms` }} />
                  <div className="anim-grow-x absolute left-1/2 top-0 h-full rounded-[2px] bg-primary" style={{ width: `${(b.receivable / peak) * 50}%`, animationDelay: `${i * 60 + 80}ms` }} />
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium tnum">{fmtINRCompact(Math.abs(b.net))}</div>
                  <div className="text-2xs text-muted-foreground">{b.net >= 0 ? "owed to us" : "we owe"}</div>
                </div>
                <div className="text-right">
                  {r ? (
                    <Link to={`/reconciliations/${r.rec.id}`} className="inline-flex flex-col items-end gap-0.5">
                      <StatusChip status={r.view.withinTolerance ? "approved" : "rejected"} label={r.view.difference === 0 ? "Agrees" : r.view.withinTolerance ? "Explained" : "Unexplained"} />
                      <span className="text-2xs text-muted-foreground tnum">{r.view.difference === null || r.view.difference === 0 ? "no difference" : `difference ${fmtINRCompact(Math.abs(r.view.difference))}`}</span>
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Related-party transactions, fiscal year to date" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Counterparty</TableHead>
              {incomeNatures.map((n) => <TableHead key={n.id} className="text-right">{n.label}</TableHead>)}
              {expenseNatures.map((n) => <TableHead key={n.id} className="text-right">{n.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rpt.rows.map((r) => (
              <TableRow key={r.partnerId}>
                <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                {NATURES.map((n) => (
                  <TableCell key={n.id} className={cn("whitespace-nowrap text-right tnum", !r.byNature[n.id] && "text-muted-foreground")}>{r.byNature[n.id] ? fmtINRCompact(r.byNature[n.id]) : "-"}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-medium">
              <TableCell>Total</TableCell>
              {NATURES.map((n) => <TableCell key={n.id} className="whitespace-nowrap text-right tnum">{fmtINRCompact(rpt.totals[n.id] ?? 0)}</TableCell>)}
            </TableRow>
            <TableRow>
              <TableCell colSpan={1 + incomeNatures.length} className="text-xs text-muted-foreground">Income {fmtINRCompact(income)}</TableCell>
              <TableCell colSpan={expenseNatures.length} className="text-right text-xs text-muted-foreground">Expense {fmtINRCompact(expense)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </Panel>
    </div>
  );
}

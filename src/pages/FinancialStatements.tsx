import { useMemo } from "react";
import { Waterfall, type WaterfallColumn } from "@/components/charts/Waterfall";
import { AgeingStack } from "@/components/charts/AgeingStack";
import { BalanceMix } from "@/components/reporting/BalanceMix";
import { StatementTable } from "@/components/reporting/StatementTable";
import { KpiTile, MethodBadge, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildBalanceSheet, buildNotes, buildProfitAndLoss, type StatementLine } from "@/engine/statements";
import { LOCALISATION } from "@/config/localisation";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";
import type { StatutoryBand } from "@/engine/workingCapital";

const slices = (b: StatutoryBand[]) => b.map((x, i) => ({ id: x.label, label: x.label, count: x.count, amount: x.amount, fill: `hsl(var(--age-${Math.min(i + 1, 4)}))` }));

function Note({ title, bands, balance, balanceLabel, otherLabel }: { title: string; bands: StatutoryBand[]; balance?: number; balanceLabel?: string; otherLabel?: string }) {
  const total = bands.reduce((s, b) => s + b.amount, 0);
  return (
    <Panel title={title}>
      <AgeingStack slices={slices(bands)} list />
      <div className="mt-3 border-t border-border pt-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Total per note</span><span className="tnum">{fmtINRCompact(total)}</span></div>
        {balance !== undefined && (
          <>
            <div className="flex justify-between"><span className="text-muted-foreground">{otherLabel}</span><span className="tnum">{fmtINRCompact(balance - total)}</span></div>
            <div className="flex justify-between font-medium"><span>{balanceLabel}</span><span className="tnum">{fmtINRCompact(balance)}</span></div>
          </>
        )}
      </div>
    </Panel>
  );
}

export function FinancialStatements() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const [params, setParams] = useQueryParams();
  const tab = params.get("fstab") ?? "balance-sheet";
  const bs = useMemo(() => buildBalanceSheet(periodEnd), [periodEnd]);
  const pl = useMemo(() => buildProfitAndLoss(periodEnd), [periodEnd]);
  const notes = useMemo(() => buildNotes(periodEnd), [periodEnd]);

  const current = bs.assets.find((g) => g.label === "Current assets")!;
  const currentLiabilities = bs.equityAndLiabilities.find((g) => g.label === "Current liabilities")!;
  const equity = bs.equityAndLiabilities.find((g) => g.label === "Equity")!;
  const balanced = Math.abs(bs.totalAssets - bs.totalEquityAndLiabilities) < 1;
  const receivableLine = current.lines.find((l) => l.label === "Trade receivables")?.amount ?? 0;
  const payableLine = currentLiabilities.lines.find((l) => l.label === "Trade payables")?.amount ?? 0;
  const bsColumns: [string, string] = [`As at ${fmtDate(bs.periodEnd)}`, `As at ${fmtDate(bs.comparativeEnd)}`];
  const plColumns: [string, string] = [`${fmtDate(pl.from).slice(3)} to ${fmtDate(pl.periodEnd).slice(3)}`, `${fmtDate(pl.comparativeFrom).slice(3)} to ${fmtDate(pl.comparativeTo).slice(3)}`];

  const flow = useMemo<{ columns: WaterfallColumn[]; max: number; min: number }>(() => {
    const byLabel = (l: string) => pl.expenses.find((e) => e.label === l)?.amount ?? 0;
    const steps: { key: string; label: string; v: number }[] = [
      { key: "mat", label: "Materials", v: -(byLabel("Cost of materials consumed") + byLabel("Purchases of stock-in-trade") + byLabel("Changes in inventories")) },
      { key: "emp", label: "Employees", v: -byLabel("Employee benefits expense") },
      { key: "oth", label: "Other expenses", v: -byLabel("Other expenses") },
      { key: "dep", label: "Depreciation", v: -byLabel("Depreciation and amortisation expense") },
      { key: "oi", label: "Other income", v: pl.income[1].amount },
      { key: "tax", label: "Tax", v: -pl.tax.amount },
    ];
    let level = pl.income[0].amount;
    const cols: WaterfallColumn[] = [{ key: "rev", label: "Revenue", from: 0, to: level, value: level, tone: "ink" }];
    for (const s of steps) {
      cols.push({ key: s.key, label: s.label, from: level, to: level + s.v, value: s.v, tone: "step", connect: true });
      level += s.v;
    }
    cols.push({ key: "profit", label: "Profit", from: 0, to: level, value: level, tone: "ok" });
    const all = cols.flatMap((c) => [c.from, c.to]);
    return { columns: cols, max: Math.max(...all), min: Math.min(0, ...all) };
  }, [pl]);

  return (
    <div className="space-y-4">
      <PageHeader title="Financial Statements" badge={<StatusChip status={balanced ? "approved" : "rejected"} label={balanced ? "Balance sheet balances" : "Balance sheet out of balance"} />} actions={<MethodBadge method="deterministic" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Total assets" value={fmtINRCompact(bs.totalAssets)} delta={bs.comparativeAssets ? `${Math.abs(((bs.totalAssets - bs.comparativeAssets) / bs.comparativeAssets) * 100).toFixed(1)}% on year end` : undefined} trend={bs.totalAssets >= bs.comparativeAssets ? "up" : "down"} goodWhen="up" />
        <KpiTile label="Equity" value={fmtINRCompact(equity.total)} sublabel={`${fmtINRCompact(pl.profit.amount)} profit this year`} />
        <KpiTile label="Revenue" value={fmtINRCompact(pl.income[0].amount)} delta={pl.income[0].comparative ? `${Math.abs(((pl.income[0].amount - pl.income[0].comparative) / pl.income[0].comparative) * 100).toFixed(1)}% on last year` : undefined} trend={pl.income[0].amount >= pl.income[0].comparative ? "up" : "down"} goodWhen="up" />
        <KpiTile label="Profit before tax" value={fmtINRCompact(pl.profitBeforeTax.amount)} sublabel={`${fmtINRCompact(pl.tax.amount)} tax`} />
        <KpiTile label="Current ratio" hint="Current assets divided by current liabilities. Above 1 means short-term assets cover short-term obligations." value={currentLiabilities.total ? (current.total / currentLiabilities.total).toFixed(2) : "-"} sublabel={`${fmtINRCompact(current.total)} against ${fmtINRCompact(currentLiabilities.total)}`} />
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ fstab: v === "balance-sheet" ? null : v })}>
        <TabsList>
          <TabsTrigger value="balance-sheet">Balance sheet</TabsTrigger>
          <TabsTrigger value="profit-and-loss">Profit and loss</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="balance-sheet" className="space-y-3">
          <Panel title="What the company holds and what funds it">
            <BalanceMix assets={bs.assets} funding={bs.equityAndLiabilities} totalAssets={bs.totalAssets} totalFunding={bs.totalEquityAndLiabilities} />
          </Panel>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Panel title={`Assets, ${LOCALISATION.financialStatementsFormat}`} bodyClassName="p-0">
              <StatementTable columns={bsColumns} groups={bs.assets} lines={[{ line: { label: "Total assets", amount: bs.totalAssets, comparative: bs.comparativeAssets, accounts: [] }, kind: "grand" }]} linkAccounts />
            </Panel>
            <Panel title={`Equity and liabilities, ${LOCALISATION.financialStatementsFormat}`} bodyClassName="p-0">
              <StatementTable columns={bsColumns} groups={bs.equityAndLiabilities} lines={[{ line: { label: "Total equity and liabilities", amount: bs.totalEquityAndLiabilities, comparative: bs.comparativeEquityAndLiabilities, accounts: [] }, kind: "grand" }]} linkAccounts />
            </Panel>
          </div>
        </TabsContent>

        <TabsContent value="profit-and-loss" className="space-y-3">
          <Panel title="From revenue to profit">
            <Waterfall columns={flow.columns} min={flow.min} max={flow.max} plot={240} format={(v) => fmtINRCompact(v)} />
          </Panel>
          <Panel title={`Statement of profit and loss, ${LOCALISATION.financialStatementsFormat}`} bodyClassName="p-0">
            <StatementTable
              columns={plColumns}
              lines={[
                ...pl.income.map((line) => ({ line, kind: "line" as const })),
                { line: pl.totalIncome, kind: "total" },
                ...pl.expenses.map((line) => ({ line, kind: "line" as const })),
                { line: pl.totalExpenses, kind: "total" },
                { line: pl.profitBeforeTax, kind: "total" },
                { line: pl.tax as StatementLine, kind: "line" },
                { line: pl.profit, kind: "grand" },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <Note title="Trade receivables ageing" bands={notes.tradeReceivables} balance={receivableLine} balanceLabel="Trade receivables in the balance sheet" otherLabel="Retention, allowance and unapplied credits" />
            <Note title="Trade payables ageing" bands={notes.tradePayables} balance={payableLine} balanceLabel="Trade payables in the balance sheet" otherLabel="GR/IR clearing and debit balances" />
            <Note title="Capital work-in-progress ageing" bands={notes.cwip} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

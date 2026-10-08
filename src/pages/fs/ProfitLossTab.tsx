import { useMemo } from "react";
import { KpiTile, Panel } from "@/components/vocab";
import { StatementTable } from "@/components/reporting/StatementTable";
import { WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { fiscalQuarterMonths, fiscalYearMonths, profitAndLoss } from "@/engine/financials";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtPct } from "@/lib/format";
import { useQueryParams } from "@/lib/useQueryParams";
import { cn } from "@/lib/utils";

const range = (from: string, to: string) => (from === to ? fmtMonth(`${from}-01`) : `${fmtMonth(`${from}-01`)} to ${fmtMonth(`${to}-01`)}`);

export function ProfitLossTab({ onAccount }: { onAccount: (gl: string) => void }) {
  const [params, setParams] = useQueryParams();
  const ytd = params.get("fview") === "ytd";
  const { from, to } = ytd ? fiscalYearMonths(WORLD.asOf, TENANT.fiscalYear.startMonth) : fiscalQuarterMonths(WORLD.asOf, TENANT.fiscalYear.startMonth);
  const pl = useMemo(() => profitAndLoss(from, to), [from, to]);
  const growth = pl.totalIncomeComparative ? (pl.totalIncome - pl.totalIncomeComparative) / pl.totalIncomeComparative : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total income" value={fmtINRCompact(pl.totalIncome)} sublabel={`${growth >= 0 ? "+" : "-"}${Math.abs(growth * 100).toFixed(1)}% on the same period last year`} accent="info" />
        <KpiTile label="Profit before tax" value={fmtINRCompact(pl.profitBeforeTax)} sublabel={`${fmtINRCompact(pl.profitBeforeTaxComparative)} last year`} />
        <KpiTile label="Profit for the period" value={fmtINRCompact(pl.profit)} sublabel={`${fmtINRCompact(pl.profitComparative)} last year`} accent="ok" />
        <KpiTile label="Profit margin" value={pl.totalIncome ? fmtPct(pl.profit / pl.totalIncome) : "-"} sublabel="profit over total income" />
      </div>
      <Panel
        title="Statement of profit and loss"
        bodyClassName="p-0"
        actions={
          <div className="flex rounded-md border border-border p-0.5 text-xs normal-case">
            {[
              { key: "quarter", label: "Quarter" },
              { key: "ytd", label: "Year to date" },
            ].map((m) => (
              <button key={m.key} type="button" onClick={() => setParams({ fview: m.key === "quarter" ? null : m.key })} className={cn("rounded px-2 py-0.5", (m.key === "ytd") === ytd ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <StatementTable
          heads={[range(pl.from, pl.to), range(pl.comparativeFrom, pl.comparativeTo)]}
          onAccount={onAccount}
          sections={[
            { title: "Income", rows: pl.income, totals: [{ label: "Total income", amount: pl.totalIncome, comparative: pl.totalIncomeComparative }] },
            { title: "Expenses", rows: pl.expenses, totals: [{ label: "Total expenses", amount: pl.totalExpenses, comparative: pl.totalExpensesComparative }, { label: "Profit before tax", amount: pl.profitBeforeTax, comparative: pl.profitBeforeTaxComparative }] },
            { title: "Tax", rows: [pl.tax], totals: [{ label: "Profit for the period", amount: pl.profit, comparative: pl.profitComparative }] },
          ]}
        />
      </Panel>
    </div>
  );
}

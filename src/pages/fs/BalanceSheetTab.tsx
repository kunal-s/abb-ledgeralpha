import { useMemo } from "react";
import { Check } from "lucide-react";
import { KpiTile, Panel } from "@/components/vocab";
import { StatementTable } from "@/components/reporting/StatementTable";
import { WORLD } from "@/data";
import { balanceSheet } from "@/engine/financials";
import { previousQuarterEnd } from "@/engine/context";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact } from "@/lib/format";

export function BalanceSheetTab({ onAccount }: { onAccount: (gl: string) => void }) {
  const comparative = previousQuarterEnd(WORLD.asOf);
  const bs = useMemo(() => balanceSheet(WORLD.asOf, comparative), [comparative]);
  const balanced = Math.abs(bs.difference) < 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Total assets" value={fmtINRCompact(bs.totalAssets)} sublabel={`${fmtINRCompact(bs.totalAssetsComparative)} at ${fmtDate(comparative)}`} accent="info" />
        <KpiTile label="Equity" value={fmtINRCompact(bs.totalEquity)} sublabel="share capital and other equity" />
        <KpiTile label="Liabilities" value={fmtINRCompact(bs.totalLiabilities)} sublabel="trade payables, provisions and others" />
        <KpiTile label="Profit for the year" info="The profit of the fiscal year to date, held in other equity until the year closes" value={fmtINRCompact(bs.equity[1].accounts.at(-1)?.amount ?? 0)} sublabel="to date" />
        <KpiTile label="Books balance" value={balanced ? "Balanced" : "Out of balance"} sublabel={`assets less equity and liabilities ${fmtINR(bs.difference)}`} accent={balanced ? "ok" : "danger"} icon={balanced ? <Check className="h-4 w-4 text-ok" /> : undefined} />
      </div>
      <Panel title="Balance sheet" bodyClassName="p-0">
        <StatementTable
          heads={[`As at ${fmtDate(bs.date)}`, `As at ${fmtDate(bs.comparativeDate)}`]}
          onAccount={onAccount}
          sections={[
            { title: "Assets", rows: bs.assets, totals: [{ label: "Total assets", amount: bs.totalAssets, comparative: bs.totalAssetsComparative }] },
            { title: "Equity", rows: bs.equity },
            { title: "Liabilities", rows: bs.liabilities, totals: [{ label: "Total equity and liabilities", amount: bs.totalEquityAndLiabilities, comparative: bs.totalEquityAndLiabilitiesComparative }] },
          ]}
        />
      </Panel>
    </div>
  );
}

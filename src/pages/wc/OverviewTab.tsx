import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiTile, Panel } from "@/components/vocab";
import { InfoTip } from "@/components/vocab/InfoTip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { wcMetrics, wcTrend, type WcMetrics } from "@/engine/workingCapital";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";

const DEFINITIONS = {
  dso: "Days of sales outstanding: receivables, unbilled revenue and retention, over revenue of the last three months, times the days in them",
  funded: "The same, less customer advances and billing in excess of revenue: the receivable the company funds itself",
  dpo: "Days of payables outstanding: trade payables and goods received not invoiced, over material and other expenses of the last three months, times the days in them",
  dio: "Days of inventory: inventories over the cost of materials of the last three months, times the days in them. Inventory is held at company level",
  cycle: "Days of sales funded, plus days of inventory, less days of payables",
  nwc: "Receivables, unbilled revenue, retention and inventory, less payables, goods received not invoiced and customer advances",
};

const days = (n: number) => `${Math.round(n)} days`;

export function OverviewTab() {
  const [, setParams] = useQueryParams();
  const month = WORLD.asOf.slice(0, 7);
  const all = useMemo(() => wcMetrics(month, "all"), [month]);
  const trend = useMemo(() => wcTrend("all", month).map((m) => ({ month: fmtMonth(`${m.month}-01`).slice(0, 3), dso: Math.round(m.dso), funded: Math.round(m.dsoFunded), dpo: Math.round(m.dpo) })), [month]);
  const units = useMemo(() => WORLD.businessUnits.filter((b) => b.id !== "CORP").map((b) => ({ id: b.id, name: b.name, m: wcMetrics(month, b.id) })), [month]);
  const previous = useMemo(() => wcTrend("all", month).slice(-2, -1)[0], [month]);
  const delta = (cur: number, prev: number | undefined) => (prev === undefined ? undefined : `${cur - prev >= 0 ? "+" : "-"}${Math.abs(Math.round(cur - prev))} days on last month`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="DSO" info={DEFINITIONS.dso} value={days(all.dso)} sublabel={delta(all.dso, previous?.dso)} accent="info" />
        <KpiTile label="DSO net of advances" info={DEFINITIONS.funded} value={days(all.dsoFunded)} sublabel={delta(all.dsoFunded, previous?.dsoFunded)} />
        <KpiTile label="DPO" info={DEFINITIONS.dpo} value={days(all.dpo)} sublabel={delta(all.dpo, previous?.dpo)} />
        <KpiTile label="DIO" info={DEFINITIONS.dio} value={all.dio === undefined ? "-" : days(all.dio)} sublabel="company level" />
        <KpiTile label="Cash cycle" info={DEFINITIONS.cycle} value={all.cycle === undefined ? "-" : days(all.cycle)} sublabel="funded days of sales + inventory - payables" />
        <KpiTile label="Net working capital" info={DEFINITIONS.nwc} value={fmtINRCompact(all.netWorkingCapital)} sublabel={`receivables ${fmtINRCompact(all.balances.receivables)}`} accent="info" onClick={() => setParams({ tab: "receivables" }, { replace: false })} />
      </div>

      <Panel title="Days outstanding by month">
        <div className="h-60 w-full" role="img" aria-label="DSO, DSO net of advances and DPO by month">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tickLine={false} axisLine={false} width={40} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="d" />
              <Tooltip formatter={(v: number) => `${v} days`} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="dso" name="DSO" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="funded" name="DSO net of advances" stroke="hsl(var(--info))" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="dpo" name="DPO" stroke="hsl(var(--ok))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="By business unit" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business unit</TableHead>
              <TableHead className="text-right">Receivables, unbilled, retention</TableHead>
              <TableHead className="text-right">Customer advances</TableHead>
              <TableHead className="text-right">Payables and GR/IR</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  DSO <InfoTip text={DEFINITIONS.dso} />
                </span>
              </TableHead>
              <TableHead className="text-right">DSO net of advances</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  DPO <InfoTip text={DEFINITIONS.dpo} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map(({ id, name, m }) => (
              <Row key={id} label={name} m={m} onClick={() => setParams({ tab: "receivables", rbu: id }, { replace: false })} />
            ))}
            <Row label="The company" m={all} total />
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

function Row({ label, m, onClick, total }: { label: string; m: WcMetrics; onClick?: () => void; total?: boolean }) {
  const b = m.balances;
  return (
    <TableRow className={total ? "border-t-2 bg-muted/40 hover:bg-muted/40" : "cursor-pointer"} onClick={onClick}>
      <TableCell className={`py-2 text-sm ${total ? "font-medium" : ""}`}>{label}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{fmtINRCompact(b.receivables + b.unbilled + b.retention)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{fmtINRCompact(b.advances)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{fmtINRCompact(b.payables + b.grir)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{days(m.dso)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{days(m.dsoFunded)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{days(m.dpo)}</TableCell>
    </TableRow>
  );
}

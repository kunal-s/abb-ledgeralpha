import { useMemo } from "react";
import { ExposureMatrix } from "@/components/reporting/ExposureMatrix";
import { DocLink, KpiTile, PageHeader, Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PARTY_BY_ID, WORLD } from "@/data";
import { coverage, exposureByCurrency, forwardMtm, fxItems, realisedInLedger, totals, closingRate, type FxItem } from "@/engine/fx";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const gl = (n: number) => (n > 0 ? "text-ok-foreground" : n < 0 ? "text-danger-foreground" : "");
const signed = (n: number) => (Math.abs(n) < 0.5 ? "-" : `${n > 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`);

function ItemTable({ rows }: { rows: FxItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Due</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Booked</TableHead>
          <TableHead className="text-right">At closing rate</TableHead>
          <TableHead className="text-right">Gain or loss</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((i) => (
          <TableRow key={i.line.key}>
            <TableCell><DocLink itemKey={i.line.key}>{i.line.docNo}</DocLink></TableCell>
            <TableCell className="max-w-56 truncate text-sm">{i.line.partner ? PARTY_BY_ID.get(i.line.partner.id)?.name : i.line.text ?? "-"}</TableCell>
            <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(i.due)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{i.currency} {fmtInt(Math.round(i.fx))}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(i.booked)}</TableCell>
            <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(i.revalued)}</TableCell>
            <TableCell className={cn("whitespace-nowrap text-right tnum", gl(i.unrealised))}>{signed(i.unrealised)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nothing open</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export function FxExposure() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const [params, setParams] = useQueryParams();
  const tab = params.get("fxtab") ?? "receivables";
  const items = useMemo(() => fxItems(periodEnd), [periodEnd]);
  const rows = useMemo(() => exposureByCurrency(periodEnd), [periodEnd]);
  const t = useMemo(() => totals(items, rows), [items, rows]);
  const realised = useMemo(() => realisedInLedger(periodEnd), [periodEnd]);

  const within90 = rows.flatMap((r) => (["0-30", "31-60", "61-90"] as const).map((b) => ({ net: Math.abs(r.net[b]) * r.rate, cov: (coverage(r.net[b], r.hedged[b]) ?? 0) * Math.abs(r.net[b]) * r.rate })));
  const exposed = within90.reduce((s, x) => s + x.net, 0);
  const covered = within90.reduce((s, x) => s + x.cov, 0);
  const byAbs = (side: FxItem["side"]) => items.filter((i) => i.side === side).sort((a, b) => b.revalued - a.revalued).slice(0, 15);
  const worst = [...items].sort((a, b) => Math.abs(b.unrealised) - Math.abs(a.unrealised)).slice(0, 15);
  const forwards = WORLD.forwards.filter((f) => f.maturity >= periodEnd);

  return (
    <div className="space-y-4">
      <PageHeader title="FX Exposure" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="To receive" value={fmtINRCompact(t.receivablesInr)} sublabel={`${fmtInt(items.filter((i) => i.side === "receivable").length)} open items at closing rates`} />
        <KpiTile label="To pay" value={fmtINRCompact(t.payablesInr)} sublabel={`${fmtInt(items.filter((i) => i.side === "payable").length)} open items`} />
        <KpiTile label="Net position" hint="Receivables less payables in foreign currency, in rupees at the closing rate. Positive means the company gains when the rupee weakens." value={fmtINRCompact(Math.abs(t.netInr))} sublabel={t.netInr >= 0 ? "long in foreign currency" : "short in foreign currency"} />
        <KpiTile label="Covered within 90 days" hint="Forward notional offsetting what falls due in the next 90 days, as a share of that net exposure." value={exposed ? `${Math.round((covered / exposed) * 100)}%` : "-"} sublabel={`${fmtINRCompact(covered)} of ${fmtINRCompact(exposed)}`} accent="info" />
        <KpiTile label="Unrealised on balances" hint="What revaluing the open items at the closing rate adds or takes away. It is not yet in the books." value={signed(t.unrealised)} sublabel={`${signed(t.unrealisedReceivables)} receivables, ${signed(t.unrealisedPayables)} payables`} accent={t.unrealised < 0 ? "danger" : "ok"} />
        <KpiTile label="Forwards at market" hint="What the forward contracts would settle for today against their contracted rates." value={signed(t.forwardMtm)} sublabel={`${fmtINRCompact(realised)} realised in the books this year`} />
      </div>

      <Panel title="Exposure by currency and when it settles">
        <ExposureMatrix rows={rows} />
      </Panel>

      <Tabs value={tab} onValueChange={(v) => setParams({ fxtab: v === "receivables" ? null : v })}>
        <TabsList>
          <TabsTrigger value="receivables">Largest receivables</TabsTrigger>
          <TabsTrigger value="payables">Largest payables</TabsTrigger>
          <TabsTrigger value="reval">Biggest revaluation effects</TabsTrigger>
          <TabsTrigger value="forwards">Forward contracts</TabsTrigger>
        </TabsList>
        <TabsContent value="receivables"><Panel title="Foreign-currency receivables" bodyClassName="p-0"><ItemTable rows={byAbs("receivable")} /></Panel></TabsContent>
        <TabsContent value="payables"><Panel title="Foreign-currency payables" bodyClassName="p-0"><ItemTable rows={byAbs("payable")} /></Panel></TabsContent>
        <TabsContent value="reval"><Panel title="Where revaluation moves the result most" bodyClassName="p-0"><ItemTable rows={worst} /></Panel></TabsContent>
        <TabsContent value="forwards">
          <Panel title="Forward contracts" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Contract rate</TableHead>
                  <TableHead className="text-right">Closing rate</TableHead>
                  <TableHead>Matures</TableHead>
                  <TableHead className="text-right">At market</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forwards.map((f) => {
                  const mtm = forwardMtm(f, closingRate(f.currency, periodEnd));
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.id}</TableCell>
                      <TableCell className="text-xs">{f.bank}</TableCell>
                      <TableCell className="text-xs">{f.direction} {f.currency}</TableCell>
                      <TableCell className="whitespace-nowrap text-right tnum">{f.currency} {fmtInt(f.amountFx)}</TableCell>
                      <TableCell className="text-right tnum">{f.rate.toFixed(2)}</TableCell>
                      <TableCell className="text-right tnum">{closingRate(f.currency, periodEnd).toFixed(2)}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(f.maturity)}</TableCell>
                      <TableCell className={cn("whitespace-nowrap text-right tnum", gl(mtm))}>{signed(mtm)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}


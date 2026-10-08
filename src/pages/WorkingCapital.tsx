import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AgeingStack } from "@/components/charts/AgeingStack";
import { CashCycle } from "@/components/reporting/CashCycle";
import { WcTrend } from "@/components/reporting/WcTrend";
import { KpiTile, PageHeader, Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REC_BY_ID } from "@/data";
import { DEFINITIONS, byBusinessUnit, customerBalances, msmeOverdue, payablesAgeing, receivablesAgeing, vendorBalances, wcTrend, type PartyBalance } from "@/engine/workingCapital";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const bandSlices = (bands: { label: string; count: number; amount: number }[]) => bands.map((b, i) => ({ id: b.label, label: b.label, count: b.count, amount: b.amount, fill: `hsl(var(--age-${Math.min(i + 1, 4)}))` }));

function PartyTable({ rows, kind, businessUnit }: { rows: PartyBalance[]; kind: "customer" | "vendor"; businessUnit: string }) {
  const shown = rows.filter((r) => businessUnit === "all" || r.businessUnitId === businessUnit).slice(0, 12);
  const link = (id: string) => {
    const rec = REC_BY_ID.get(`REC-${kind === "customer" ? "CUS" : "VEN"}-${id}`);
    return rec ? `/reconciliations/${rec.id}` : undefined;
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{kind === "customer" ? "Customer" : "Vendor"}</TableHead>
          <TableHead>Unit</TableHead>
          <TableHead className="text-right">Open items</TableHead>
          <TableHead className="text-right">Oldest</TableHead>
          <TableHead className="text-right">{kind === "customer" ? "Over six months" : "Over the window"}</TableHead>
          <TableHead className="text-right">Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shown.map((r) => {
          const to = link(r.partyId);
          return (
            <TableRow key={r.partyId}>
              <TableCell className="max-w-64 truncate">{to ? <Link to={to} className="hover:text-primary hover:underline">{r.name}</Link> : r.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.businessUnitId}</TableCell>
              <TableCell className="text-right tnum">{fmtInt(r.count)}</TableCell>
              <TableCell className="text-right tnum">{fmtInt(r.oldest)} d</TableCell>
              <TableCell className="text-right tnum">{r.overdue ? fmtINRCompact(r.overdue) : "-"}</TableCell>
              <TableCell className="text-right tnum">{fmtINRCompact(Math.abs(r.balance))}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function WorkingCapital() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const [params, setParams] = useQueryParams();
  const bu = params.get("wbu") ?? "all";
  const tab = params.get("wtab") ?? "customers";

  const trend = useMemo(() => wcTrend(periodEnd), [periodEnd]);
  const now = trend[trend.length - 1];
  const before = trend[trend.length - 4];
  const units = useMemo(() => byBusinessUnit(periodEnd), [periodEnd]);
  const recAge = useMemo(() => receivablesAgeing(periodEnd), [periodEnd]);
  const payAge = useMemo(() => payablesAgeing(periodEnd), [periodEnd]);
  const customers = useMemo(() => customerBalances(periodEnd), [periodEnd]);
  const vendors = useMemo(() => vendorBalances(periodEnd), [periodEnd]);
  const msme = useMemo(() => msmeOverdue(periodEnd), [periodEnd]);

  if (!now) return <PageHeader title="Working Capital" />;
  const delta = (cur: number, prev?: number) => (prev === undefined ? undefined : `${Math.abs(Math.round(cur - prev))} d vs ${fmtDate(before.periodEnd).slice(3, 6)}`);
  const trendOf = (cur: number, prev?: number): "up" | "down" | "flat" => (prev === undefined || Math.round(cur) === Math.round(prev) ? "flat" : cur > prev ? "up" : "down");

  return (
    <div className="space-y-4">
      <PageHeader title="Working Capital" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Receivable days" hint={DEFINITIONS.dso} value={fmtInt(Math.round(now.dso))} unit="days" delta={delta(now.dso, before?.dso)} trend={trendOf(now.dso, before?.dso)} goodWhen="down" sublabel={`${fmtINRCompact(now.receivables)} outstanding`} />
        <KpiTile label="Inventory days" hint={DEFINITIONS.dio} value={fmtInt(Math.round(now.dio))} unit="days" delta={delta(now.dio, before?.dio)} trend={trendOf(now.dio, before?.dio)} goodWhen="down" sublabel={`${fmtINRCompact(now.inventory)} held`} />
        <KpiTile label="Payable days" hint={DEFINITIONS.dpo} value={fmtInt(Math.round(now.dpo))} unit="days" delta={delta(now.dpo, before?.dpo)} trend={trendOf(now.dpo, before?.dpo)} goodWhen="up" sublabel={`${fmtINRCompact(now.payables)} owed`} />
        <KpiTile label="Cash conversion cycle" hint={DEFINITIONS.ccc} value={fmtInt(Math.round(now.ccc))} unit="days" delta={delta(now.ccc, before?.ccc)} trend={trendOf(now.ccc, before?.ccc)} goodWhen="down" accent="info" />
        <KpiTile label="Net working capital" hint={DEFINITIONS.nwc} value={fmtINRCompact(now.nwc)} sublabel={`${fmtINRCompact(now.nwc + now.advances)} before customer advances`} />
        <KpiTile label="Small-enterprise payables overdue" hint={DEFINITIONS.msme} value={fmtINRCompact(msme.value)} sublabel={`${fmtInt(msme.count)} invoices past the window`} accent={msme.count ? "warn" : "ok"} onClick={() => setParams({ wtab: "msme" })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Where the days go" className="xl:col-span-2">
          <CashCycle point={now} />
          <div className="mt-6 border-t border-border pt-4">
            <WcTrend points={trend} />
          </div>
        </Panel>
        <div className="space-y-3">
          <Panel title="Trade receivables by age">
            <AgeingStack slices={bandSlices(recAge)} list />
          </Panel>
          <Panel title="Trade payables by age">
            <AgeingStack slices={bandSlices(payAge)} list />
          </Panel>
        </div>
      </div>

      <Panel title="By business unit" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business unit</TableHead>
              <TableHead className="text-right">Receivables</TableHead>
              <TableHead className="text-right">Over six months</TableHead>
              <TableHead className="text-right">Receivable days</TableHead>
              <TableHead className="text-right">Payables</TableHead>
              <TableHead className="text-right">Payable days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((u) => (
              <TableRow key={u.businessUnitId} className={cn("cursor-pointer", bu === u.businessUnitId && "bg-accent/60")} onClick={() => setParams({ wbu: bu === u.businessUnitId ? null : u.businessUnitId })}>
                <TableCell>{u.name}</TableCell>
                <TableCell className="text-right tnum">{fmtINRCompact(u.receivables)}</TableCell>
                <TableCell className="text-right tnum">{u.overSixMonths ? fmtINRCompact(u.overSixMonths) : "-"}</TableCell>
                <TableCell className="text-right tnum">{u.dso ? fmtInt(Math.round(u.dso)) : "-"}</TableCell>
                <TableCell className="text-right tnum">{fmtINRCompact(u.payables)}</TableCell>
                <TableCell className="text-right tnum">{u.dpo ? fmtInt(Math.round(u.dpo)) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Tabs value={tab} onValueChange={(v) => setParams({ wtab: v === "customers" ? null : v })}>
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="msme">Small enterprises overdue</TabsTrigger>
        </TabsList>
        <TabsContent value="customers">
          <Panel title={bu === "all" ? "Largest customer balances" : `Largest customer balances, ${units.find((u) => u.businessUnitId === bu)?.name ?? bu}`} bodyClassName="p-0">
            <PartyTable rows={customers} kind="customer" businessUnit={bu} />
          </Panel>
        </TabsContent>
        <TabsContent value="vendors">
          <Panel title={bu === "all" ? "Largest vendor balances" : `Largest vendor balances, ${units.find((u) => u.businessUnitId === bu)?.name ?? bu}`} bodyClassName="p-0">
            <PartyTable rows={vendors} kind="vendor" businessUnit={bu} />
          </Panel>
        </TabsContent>
        <TabsContent value="msme">
          <Panel title="Micro and small enterprises, unpaid beyond the window" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Enterprise</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Oldest</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {msme.vendors.slice(0, 12).map((v) => (
                  <TableRow key={v.partyId}>
                    <TableCell className="max-w-64 truncate">{v.name}</TableCell>
                    <TableCell className="text-xs">{v.msme}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(v.count)}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(v.oldest)} d</TableCell>
                    <TableCell className="text-right tnum">{fmtINRCompact(v.value)}</TableCell>
                  </TableRow>
                ))}
                {msme.vendors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No small-enterprise invoice is past the window</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}


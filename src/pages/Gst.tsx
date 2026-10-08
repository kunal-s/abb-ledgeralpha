import { useMemo } from "react";
import { ItcBars } from "@/components/reporting/ItcBars";
import { DocLink, KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFollowUpsByItem } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { can } from "@/config/roles";
import { CLASS_LABELS, byPeriod, creditAtRisk, gstTdsCredits, reconcile, returnsTracker, GST_POLICY, type GstMatch } from "@/engine/gst";
import { WORLD } from "@/data";
import { LOCALISATION } from "@/config/localisation";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { addDays, fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";

const TAX = LOCALISATION.taxes.indirect.label;

function Matches({ rows, ask }: { rows: GstMatch[]; ask?: boolean }) {
  const role = useRoleStore((s) => s.role);
  const followUps = useFollowUpsByItem();
  const { requestFollowUp } = useWorkflow.getState();
  const canAsk = can(role, "follow-up");
  const send = (m: GstMatch) => {
    const b = m.book!;
    const r = requestFollowUp({
      itemKey: b.apKey, module: "indirect-tax", owner: b.name, dueDate: addDays(WORLD.asOf, 10),
      message: `Please report invoice ${b.ref} dated ${fmtDate(b.date)} (tax ${fmtINR(b.tax)}) in your return so the input credit is available to us.`,
    });
    toast(r.ok ? "Supplier asked to report the invoice" : r.error, { tone: r.ok ? "ok" : "danger" });
  };
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">In the books</TableHead>
          <TableHead className="text-right">In the statement</TableHead>
          <TableHead className="text-right">At stake</TableHead>
          {ask && <TableHead className="w-36" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.slice(0, 25).map((m) => {
          const name = m.book?.name ?? m.stmt?.supplierId ?? "";
          const open = m.book ? followUps.get(m.book.apKey) : undefined;
          return (
            <TableRow key={m.book?.docKey ?? m.stmt?.id}>
              <TableCell className="max-w-56 truncate text-sm">{m.book ? name : name}</TableCell>
              <TableCell className="whitespace-nowrap">{m.book ? <DocLink itemKey={m.book.apKey}>{m.book.ref}</DocLink> : <span className="font-mono text-xs">{m.stmt?.invoiceRef}</span>}</TableCell>
              <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(m.book?.date ?? m.stmt!.invoiceDate)}</TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">{m.booksTax ? fmtINR(m.booksTax) : "-"}</TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">{m.stmtTax ? fmtINR(m.stmtTax) : "-"}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tnum">{fmtINR(m.atStake)}</TableCell>
              {ask && (
                <TableCell className="text-right">
                  {open && open.status !== "closed" ? <span className="text-2xs text-muted-foreground">Asked, due {fmtDate(open.dueDate)}</span> : <Button size="sm" variant="outline" className="h-7" disabled={!canAsk} onClick={() => send(m)}>Ask supplier</Button>}
                </TableCell>
              )}
            </TableRow>
          );
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={ask ? 7 : 6} className="py-8 text-center text-sm text-muted-foreground">Nothing here</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export function Gst() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const [params, setParams] = useQueryParams();
  const tab = params.get("gtab") ?? "missing";
  const period = params.get("gperiod") ?? undefined;

  const matches = useMemo(() => reconcile(periodEnd), [periodEnd]);
  const periods = useMemo(() => byPeriod(matches), [matches]);
  const returns = useMemo(() => returnsTracker(periodEnd, periods), [periods, periodEnd]);
  const risk = useMemo(() => creditAtRisk(periodEnd), [periodEnd]);
  const tds = useMemo(() => gstTdsCredits(periodEnd), [periodEnd]);

  const inPeriod = (m: GstMatch) => !period || m.period === period;
  const of = (c: GstMatch["cls"]) => matches.filter((m) => m.cls === c && inPeriod(m)).sort((a, b) => b.atStake - a.atStake);
  const sum = (xs: GstMatch[], k: "booksTax" | "atStake") => xs.reduce((s, m) => s + m[k], 0);
  const missing = of("missing-in-statement");
  const different = of("different");
  const unbooked = of("missing-in-books");
  const booksTax = periods.reduce((s, p) => s + p.booksTax, 0);
  const available = periods.reduce((s, p) => s + p.available, 0);

  return (
    <div className="space-y-4">
      <PageHeader title={TAX} badge={period ? <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{fmtMonth(`${period}-01`)}</span> : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Input credit in the books" hint="Tax on supplier invoices of the fiscal year to date, from the input credit accounts." value={fmtINRCompact(booksTax)} sublabel={`${fmtInt(matches.filter((m) => m.book).length)} supplier invoices`} />
        <KpiTile label="Available to claim" hint="Credit on supplies that are in both the books and the inward supply statement, at the lower of the two taxes." value={fmtINRCompact(available)} sublabel={`${((available / Math.max(1, booksTax)) * 100).toFixed(1)}% of the books`} accent="ok" />
        <KpiTile label="Not reported by the supplier" value={fmtINRCompact(sum(missing, "atStake"))} sublabel={`${fmtInt(missing.length)} invoices`} accent={missing.length ? "danger" : "none"} onClick={() => setParams({ gtab: "missing" })} />
        <KpiTile label="Different tax" value={fmtINRCompact(sum(different, "atStake"))} sublabel={`${fmtInt(different.length)} invoices`} accent={different.length ? "warn" : "none"} onClick={() => setParams({ gtab: "different" })} />
        <KpiTile label="Reported, not booked" value={fmtINRCompact(sum(unbooked, "atStake"))} sublabel={`${fmtInt(unbooked.length)} supplies`} accent={unbooked.length ? "info" : "none"} onClick={() => setParams({ gtab: "unbooked" })} />
        <KpiTile label="Credit at risk" hint={`Input credit on invoices unpaid beyond ${GST_POLICY.paymentDays} days: it has to be reversed if they stay unpaid.`} value={fmtINRCompact(risk.reduce((s, r) => s + r.tax, 0))} sublabel={`${fmtInt(risk.length)} unpaid invoices`} accent={risk.length ? "warn" : "none"} onClick={() => setParams({ gtab: "risk" })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Input credit by return period" className="xl:col-span-2" actions={period ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setParams({ gperiod: null })}>All periods</button> : undefined}>
          <ItcBars periods={periods} selected={period} onSelect={(p) => setParams({ gperiod: p ?? null })} />
        </Panel>
        <Panel title="Monthly returns" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {returns.map((r) => (
              <li key={r.period} className="flex items-center justify-between gap-3 px-4 py-2">
                <div>
                  <div className="text-sm">{fmtMonth(`${r.period}-01`)}</div>
                  <div className="text-2xs text-muted-foreground tnum">{r.filedOn ? `Filed ${fmtDate(r.filedOn)}` : `Due ${fmtDate(r.dueDate)}`}{r.daysLate ? `, ${r.daysLate} days late` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-xs tnum text-muted-foreground">{r.booksTax ? fmtINRCompact(r.available) : "-"}</span>
                  <StatusChip status={r.status === "on-time" ? "approved" : r.status === "late" ? "in-review" : r.status === "overdue" ? "rejected" : "not-started"} label={r.status === "on-time" ? "Filed" : r.status === "late" ? "Filed late" : r.status === "overdue" ? "Overdue" : "Due"} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ gtab: v === "missing" ? null : v })}>
        <TabsList>
          <TabsTrigger value="missing">Not reported by the supplier</TabsTrigger>
          <TabsTrigger value="different">Different tax</TabsTrigger>
          <TabsTrigger value="unbooked">Reported, not booked</TabsTrigger>
          <TabsTrigger value="risk">Credit at risk</TabsTrigger>
          <TabsTrigger value="tds">Tax deducted by customers</TabsTrigger>
        </TabsList>
        <TabsContent value="missing"><Panel title={CLASS_LABELS["missing-in-statement"]} bodyClassName="p-0"><Matches rows={missing} ask /></Panel></TabsContent>
        <TabsContent value="different"><Panel title={CLASS_LABELS.different} bodyClassName="p-0"><Matches rows={different} /></Panel></TabsContent>
        <TabsContent value="unbooked"><Panel title={CLASS_LABELS["missing-in-books"]} bodyClassName="p-0"><Matches rows={unbooked} /></Panel></TabsContent>
        <TabsContent value="risk">
          <Panel title="Supplier invoices unpaid beyond the payment window" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="text-right">Days since the invoice</TableHead>
                  <TableHead className="text-right">Credit at risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risk.slice(0, 25).map((r) => (
                  <TableRow key={r.line.key}>
                    <TableCell className="max-w-64 truncate text-sm">{r.name}</TableCell>
                    <TableCell><DocLink itemKey={r.line.key}>{r.line.docNo}</DocLink></TableCell>
                    <TableCell className="text-right tnum">{fmtInt(r.days)}</TableCell>
                    <TableCell className="text-right tnum">{fmtINR(r.tax)}</TableCell>
                  </TableRow>
                ))}
                {risk.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No invoice is past the window</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
        <TabsContent value="tds">
          <Panel title="Tax deducted by government customers, not yet credited" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Oldest</TableHead>
                  <TableHead className="text-right">Held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tds.slice(0, 15).map((c) => (
                  <TableRow key={c.customerId}>
                    <TableCell className="max-w-64 truncate text-sm">{c.name}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(c.count)}</TableCell>
                    <TableCell className="text-right tnum">{fmtInt(c.oldest)} d</TableCell>
                    <TableCell className="text-right tnum">{fmtINRCompact(c.balance)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

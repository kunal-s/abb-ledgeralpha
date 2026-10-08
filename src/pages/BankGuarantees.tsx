import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ExpiryLadder } from "@/components/reporting/ExpiryLadder";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PARTY_BY_ID, WORLD } from "@/data";
import { BG_POLICY, bankUse, expiryLadder, statusOf, typeByStatus, watchOf, type BgWork } from "@/engine/bg";
import { useWorkflow } from "@/state/workflow";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BankGuarantee } from "@/types";

const asOf = WORLD.asOf;

const CHIP: Record<BankGuarantee["status"], { status: "approved" | "in-review" | "rejected" | "not-started" | "exported"; label: string }> = {
  Active: { status: "approved", label: "Active" },
  "In claim period": { status: "in-review", label: "In claim period" },
  "Expired - original awaited": { status: "rejected", label: "Original awaited" },
  Released: { status: "not-started", label: "Released" },
  Invoked: { status: "rejected", label: "Invoked" },
};

function BgTable({ rows, works }: { rows: BankGuarantee[]; works: Record<string, BgWork> }) {
  const navigate = useNavigate();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Guarantee</TableHead>
          <TableHead>Party</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Valid to</TableHead>
          <TableHead>Acceptance</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((b) => {
          const w = watchOf(b, asOf, works[b.bgNo]);
          const s = statusOf(b, works[b.bgNo]);
          return (
            <TableRow key={b.bgNo} className="cursor-pointer" onClick={() => navigate(`/bank-guarantees/${encodeURIComponent(b.bgNo)}`)}>
              <TableCell className="whitespace-nowrap">
                <div className="font-mono text-xs">{b.bgNo}</div>
                <div className="text-2xs text-muted-foreground">{b.direction}, {b.bank}</div>
              </TableCell>
              <TableCell className="max-w-48 truncate text-sm">{PARTY_BY_ID.get(b.partyId)?.name ?? b.partyId}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{b.type}</TableCell>
              <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(b.amount)}</TableCell>
              <TableCell className="whitespace-nowrap">
                <div className="text-xs tnum">{fmtDate(b.validTo)}</div>
                <div className={cn("text-2xs tnum", w.flag === "red" ? "font-medium text-danger-foreground" : w.flag === "amber" ? "text-warn-foreground" : "text-muted-foreground")}>
                  {s === "Active" ? `${w.days} days${w.flag === "red" ? ", not yet accepted" : ""}` : b.claimExpiry ? `claim to ${fmtDate(b.claimExpiry)}` : ""}
                </div>
              </TableCell>
              <TableCell className="text-xs">{b.acceptance ?? "-"}</TableCell>
              <TableCell><StatusChip status={CHIP[s].status} label={CHIP[s].label} /></TableCell>
            </TableRow>
          );
        })}
        {rows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Nothing here</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

export function BankGuarantees() {
  const works = useWorkflow((s) => s.bgWork);
  const [params, setParams] = useQueryParams();
  const tab = params.get("bgtab") ?? "watchlist";
  const month = params.get("bgmonth") ?? undefined;
  const direction = params.get("bgdir") ?? "all";

  const bgs = WORLD.bankGuarantees;
  const eff = (b: BankGuarantee) => statusOf(b, works[b.bgNo]);
  const inForce = bgs.filter((b) => eff(b) === "Active");
  const issued = inForce.filter((b) => b.direction === "Issued");
  const received = inForce.filter((b) => b.direction === "Received");
  const watch = inForce.map((b) => ({ b, w: watchOf(b, asOf, works[b.bgNo]) })).filter((x) => x.w.flag !== "none").sort((a, b) => a.w.days - b.w.days);
  const red = watch.filter((x) => x.w.flag === "red");
  const inClaim = bgs.filter((b) => eff(b) === "In claim period");
  const awaited = bgs.filter((b) => eff(b) === "Expired - original awaited");
  const ladder = useMemo(() => expiryLadder(bgs, asOf, 12, works), [bgs, works]);
  const use = useMemo(() => bankUse(bgs, works), [bgs, works]);
  const matrix = useMemo(() => typeByStatus(bgs, works), [bgs, works]);
  const limit = use.reduce((s, u) => s + u.limit, 0);
  const used = use.reduce((s, u) => s + u.used, 0);
  const sum = (xs: BankGuarantee[]) => xs.reduce((s, b) => s + b.amount, 0);

  const monthRows = month ? inForce.filter((b) => b.validTo.slice(0, 7) === month) : [];
  const register = bgs.filter((b) => direction === "all" || b.direction === direction).sort((a, b) => b.validTo.localeCompare(a.validTo));

  return (
    <div className="space-y-4">
      <PageHeader title="Bank Guarantees" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Issued, in force" value={fmtINRCompact(sum(issued))} sublabel={`${fmtInt(issued.length)} guarantees to customers`} />
        <KpiTile label="Received, in force" value={fmtINRCompact(sum(received))} sublabel={`${fmtInt(received.length)} guarantees from vendors`} />
        <KpiTile label={`Expiring in ${BG_POLICY.amberDays} days`} value={fmtInt(watch.length)} sublabel={`${fmtINRCompact(watch.reduce((s, x) => s + x.b.amount, 0))}, ${fmtInt(red.length)} not yet accepted`} accent={red.length ? "danger" : watch.length ? "warn" : "ok"} onClick={() => setParams({ bgtab: "watchlist", bgmonth: null })} />
        <KpiTile label="In claim period" value={fmtInt(inClaim.length)} sublabel={fmtINRCompact(sum(inClaim))} accent={inClaim.length ? "info" : "none"} onClick={() => setParams({ bgtab: "claim", bgmonth: null })} />
        <KpiTile label="Original awaited" value={fmtInt(awaited.length)} sublabel={fmtINRCompact(sum(awaited))} accent={awaited.length ? "warn" : "none"} onClick={() => setParams({ bgtab: "original", bgmonth: null })} />
        <KpiTile label="Bank limits used" hint="Guarantees issued by the banks count against their limit from issue until released, not until they expire." value={fmtPct(limit ? used / limit : 0)} sublabel={`${fmtINRCompact(used)} of ${fmtINRCompact(limit)}`} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="When guarantees expire" className="xl:col-span-2" actions={month ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setParams({ bgmonth: null })}>Clear month</button> : undefined}>
          <ExpiryLadder months={ladder} selected={month} onSelect={(m) => setParams({ bgmonth: m ?? null })} />
          {month && (
            <div className="-mx-4 mt-4 border-t border-border">
              <BgTable rows={monthRows} works={works} />
            </div>
          )}
        </Panel>
        <Panel title="Bank limits and commission" bodyClassName="p-0">
          <ul className="divide-y divide-border">
            {use.map((u, i) => (
              <li key={u.bank} className="px-4 py-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">{u.bank}</span>
                  <span className="text-xs tnum text-muted-foreground">{fmtINRCompact(u.used)} of {fmtINRCompact(u.limit)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <div className="h-1.5 flex-1 rounded-full bg-secondary">
                    <div className={cn("anim-grow-x h-full rounded-full", u.pct > 0.85 ? "bg-warn" : "bg-primary")} style={{ width: `${Math.min(100, u.pct * 100)}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-2xs tnum text-muted-foreground">{fmtINRCompact(u.commission)} a year</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border px-4 py-2 text-xs">
            <span className="text-muted-foreground">Commission run-rate</span>
            <span className="font-medium tnum">{fmtINRCompact(use.reduce((s, u) => s + u.commission, 0))} a year</span>
          </div>
        </Panel>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ bgtab: v === "watchlist" ? null : v })}>
        <TabsList>
          <TabsTrigger value="watchlist">Expiry watchlist</TabsTrigger>
          <TabsTrigger value="claim">In claim period</TabsTrigger>
          <TabsTrigger value="original">Original awaited</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
          <TabsTrigger value="matrix">By type and status</TabsTrigger>
        </TabsList>
        <TabsContent value="watchlist"><Panel title="Expiring soon, soonest first" bodyClassName="p-0"><BgTable rows={watch.map((x) => x.b)} works={works} /></Panel></TabsContent>
        <TabsContent value="claim"><Panel title="In their claim period" bodyClassName="p-0"><BgTable rows={inClaim} works={works} /></Panel></TabsContent>
        <TabsContent value="original"><Panel title="Expired, original not yet returned" bodyClassName="p-0"><BgTable rows={awaited} works={works} /></Panel></TabsContent>
        <TabsContent value="register">
          <Panel
            title="All guarantees"
            bodyClassName="p-0"
            actions={
              <div className="flex rounded-md border border-border p-0.5 text-xs">
                {(["all", "Issued", "Received"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setParams({ bgdir: d === "all" ? null : d })} className={cn("rounded px-2 py-0.5", direction === d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{d === "all" ? "All" : d}</button>
                ))}
              </div>
            }
          >
            <BgTable rows={register} works={works} />
          </Panel>
        </TabsContent>
        <TabsContent value="matrix">
          <Panel title="Guarantees by type and status" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  {matrix.statuses.map((s) => <TableHead key={s} className="text-right">{CHIP[s].label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.types.map((t) => (
                  <TableRow key={t}>
                    <TableCell>{t}</TableCell>
                    {matrix.statuses.map((s) => {
                      const c = matrix.cell(t, s);
                      return <TableCell key={s} className="text-right tnum">{c.count ? <span>{fmtInt(c.count)} <span className="text-muted-foreground">· {fmtINRCompact(c.value)}</span></span> : <span className="text-muted-foreground">-</span>}</TableCell>;
                    })}
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


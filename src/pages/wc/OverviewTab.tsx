import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight } from "lucide-react";
import { KpiTile, Panel } from "@/components/vocab";
import { InfoTip } from "@/components/vocab/InfoTip";
import { GradeBar } from "@/components/reporting/GradeBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { WORKING_CAPITAL_POLICY as P } from "@/config/policies";
import { CORPORATE } from "@/engine/attribution";
import { GRADE_LABEL, attention, dsoGrade, wcMetrics, wcTrend, type ExcessRow, type UnitInsight, type WcMetrics } from "@/engine/workingCapital";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";

const GRADE_RULE = `On track up to ${P.dsoWatchDays} days, watch up to ${P.dsoActionDays}, act above`;

const DEFINITIONS = {
  dso: `Days of sales outstanding: receivables, unbilled revenue and retention, over revenue of the last three months, times the days in them. ${GRADE_RULE}`,
  funded: "The same, less customer advances and billing in excess of revenue: the receivable the company funds itself",
  dpo: "Days of payables outstanding: trade payables and goods received not invoiced, over material and other expenses of the last three months, times the days in them",
  dio: "Days of inventory: inventories over the cost of materials of the last three months, times the days in them. Inventory is held at company level",
  cycle: "Days of sales funded, plus days of inventory, less days of payables",
  nwc: "Receivables, unbilled revenue, retention and inventory, less payables, goods received not invoiced and customer advances",
};

const days = (n: number) => `${Math.round(n)} days`;
const signed1 = (n: number) => `${n >= 0 ? "+" : "-"}${Math.abs(n).toFixed(1)}`;
const GRADE_ACCENT = { ok: "ok", watch: "warn", act: "danger" } as const;
const INVOICE_STEPS = new Set(["not-due", "remind", "confirm", "escalate"]);

export function OverviewTab() {
  const [, setParams] = useQueryParams();
  const month = WORLD.asOf.slice(0, 7);
  const all = useMemo(() => wcMetrics(month, "all"), [month]);
  const trendRows = useMemo(() => wcTrend("all", month), [month]);
  const trend = useMemo(() => trendRows.map((m) => ({ month: fmtMonth(`${m.month}-01`).slice(0, 3), dso: Math.round(m.dso), funded: Math.round(m.dsoFunded), dpo: Math.round(m.dpo) })), [trendRows]);
  const units = useMemo(() => WORLD.businessUnits.filter((b) => b.id !== CORPORATE).map((b) => ({ id: b.id, name: b.name, m: wcMetrics(month, b.id) })), [month]);
  const insights = useMemo(() => attention(), []);
  const previous = trendRows.slice(-2, -1)[0];
  const delta = (cur: number, prev: number | undefined) => (prev === undefined ? undefined : `${cur - prev >= 0 ? "+" : "-"}${Math.abs(Math.round(cur - prev))} days on last month`);
  const open = (patch: Record<string, string>) => setParams({ tab: "receivables", ...patch }, { replace: false });
  const scale = Math.max(P.dsoActionDays * 1.25, ...units.map((u) => u.m.dso), all.dso);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="DSO" info={DEFINITIONS.dso} value={days(all.dso)} sublabel={delta(all.dso, previous?.dso)} accent={GRADE_ACCENT[dsoGrade(all.dso)]} />
        <KpiTile label="DSO net of advances" info={DEFINITIONS.funded} value={days(all.dsoFunded)} sublabel={delta(all.dsoFunded, previous?.dsoFunded)} />
        <KpiTile label="DPO" info={DEFINITIONS.dpo} value={days(all.dpo)} sublabel={delta(all.dpo, previous?.dpo)} />
        <KpiTile label="DIO" info={DEFINITIONS.dio} value={all.dio === undefined ? "-" : days(all.dio)} sublabel="company level" />
        <KpiTile label="Cash cycle" info={DEFINITIONS.cycle} value={all.cycle === undefined ? "-" : days(all.cycle)} sublabel="funded days of sales + inventory - payables" />
        <KpiTile label="Net working capital" info={DEFINITIONS.nwc} value={fmtINRCompact(all.netWorkingCapital)} sublabel={`receivables ${fmtINRCompact(all.balances.receivables + all.balances.retention)}`} accent="info" onClick={() => open({})} />
      </div>

      <Panel title="Days of sales by business unit" bodyClassName="p-0">
        <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-36">Business unit</TableHead>
              <TableHead className="text-right">Receivables</TableHead>
              <TableHead className="text-right">Unbilled</TableHead>
              <TableHead className="text-right">Advances</TableHead>
              <TableHead className="text-right">Payables</TableHead>
              <TableHead className="text-right">GR/IR</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  DSO <InfoTip text={DEFINITIONS.dso} />
                </span>
              </TableHead>
              <TableHead className="whitespace-nowrap text-right">
                <span className="inline-flex items-center gap-1">
                  DSO net <InfoTip text={DEFINITIONS.funded} />
                </span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1">
                  DPO <InfoTip text={DEFINITIONS.dpo} />
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map(({ id, name, m }) => (
              <Row key={id} label={name} m={m} company={all.dso} scale={scale} onClick={() => open({ rbu: id })} />
            ))}
            <Row label="The company" m={all} company={all.dso} scale={scale} total />
          </TableBody>
        </Table>
      </Panel>

      {insights.map((u) => (
        <Attention key={u.bu} u={u} company={all} onOpen={open} />
      ))}

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
    </div>
  );
}

function Row({ label, m, company, scale, onClick, total }: { label: string; m: WcMetrics; company: number; scale: number; onClick?: () => void; total?: boolean }) {
  const b = m.balances;
  const grade = dsoGrade(m.dso);
  return (
    <TableRow className={total ? "border-t-2 bg-muted/40 hover:bg-muted/40" : "cursor-pointer"} onClick={onClick}>
      <TableCell className={`py-2 text-sm ${total ? "font-medium" : ""}`}>{label}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(b.receivables + b.retention)}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(b.unbilled)}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(b.advances)}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(b.payables)}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(b.grir)}</TableCell>
      <TableCell className={`py-2 ${grade === "act" ? "bg-danger-subtle/40" : grade === "watch" ? "bg-warn-subtle/40" : ""}`}>
        <GradeBar value={m.dso} max={scale} mark={total ? undefined : company} grade={grade} text={days(m.dso)} hint={`${days(m.dso)}. The company is at ${days(company)}. ${GRADE_RULE}`} />
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{days(m.dsoFunded)}</TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{days(m.dpo)}</TableCell>
    </TableRow>
  );
}

function Attention({ u, company, onOpen }: { u: UnitInsight; company: WcMetrics; onOpen: (patch: Record<string, string>) => void }) {
  const scale = Math.max(1, ...u.drivers.map((d) => Math.abs(d.delta)));
  const openStep = (id: string) => onOpen({ rbu: u.bu, rstep: id, rview: "docs" });
  return (
    <Panel
      title={`${u.name}: ${Math.round(u.metrics.dso)} days of sales against ${Math.round(company.dso)}`}
      actions={<Badge variant={u.grade === "act" ? "danger" : "warn"}>{GRADE_LABEL[u.grade]}</Badge>}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-1 divide-y divide-border/70 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div>
          <div className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Where the extra {Math.round(u.excess)} days are</div>
          <Table className="[&_td]:px-2.5 [&_th]:px-2.5">
            <TableHeader>
              <TableRow>
                <TableHead>Receivable made of</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Company</TableHead>
                <TableHead className="text-right">Above the company</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {u.drivers.map((d) => (
                <DriverRow key={d.id} d={d} scale={scale} onOpen={INVOICE_STEPS.has(d.id) ? () => openStep(d.id) : undefined} />
              ))}
              <TableRow className="border-t-2 bg-muted/40 hover:bg-muted/40">
                <TableCell className="py-2 text-sm font-medium">Days of sales</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{u.metrics.dso.toFixed(1)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{company.dso.toFixed(1)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm font-medium">{signed1(u.excess)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <div>
          <div className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">What to do</div>
          <ul className="divide-y divide-border/60">
            {u.steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.label}</div>
                  <div className="tnum text-2xs text-muted-foreground">
                    {fmtInt(s.count)} {s.count === 1 ? "item" : "items"}, {fmtINRCompact(Math.abs(s.amount))}
                    {s.pastDue > 0 && s.pastDue !== s.amount ? `, ${fmtINRCompact(s.pastDue)} past due` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1" onClick={() => openStep(s.id)}>
                  Open <ArrowRight className="h-3 w-3" />
                </Button>
              </li>
            ))}
            {u.drivers.find((d) => d.id === "unbilled")!.amount > 0 && (
              <li className="flex items-center justify-between gap-3 px-4 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">Bill the work done</div>
                  <div className="tnum text-2xs text-muted-foreground">Unbilled revenue {fmtINRCompact(u.drivers.find((d) => d.id === "unbilled")!.amount)}</div>
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1" asChild>
                  <Link to="/balance-sheet-review/141100">
                    Open <ArrowRight className="h-3 w-3" />
                  </Link>
                </Button>
              </li>
            )}
          </ul>
          {u.holders.length > 0 && (
            <>
              <div className="border-t border-border/70 px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Largest customers to chase</div>
              <ul className="divide-y divide-border/60 pb-1">
                {u.holders.map((h) => (
                  <li key={h.partyId}>
                    <button type="button" onClick={() => onOpen({ rbu: u.bu, rpty: h.partyId, rview: "docs" })} className="flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left hover:bg-muted/40">
                      <span className="truncate text-sm">{h.name}</span>
                      <span className="shrink-0 tnum text-xs text-muted-foreground">
                        {fmtInt(h.count)} items, {fmtINRCompact(h.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

function DriverRow({ d, scale, onOpen }: { d: ExcessRow; scale: number; onOpen?: () => void }) {
  const width = `${Math.min(100, (Math.abs(d.delta) / scale) * 100)}%`;
  return (
    <TableRow className={onOpen ? "cursor-pointer" : undefined} onClick={onOpen}>
      <TableCell className="py-2 text-sm">
        <span className="block">{d.label}</span>
      </TableCell>
      <TableCell className="py-2 text-right tnum text-sm">{d.days.toFixed(1)}</TableCell>
      <TableCell className="py-2 text-right tnum text-sm text-muted-foreground">{d.company.toFixed(1)}</TableCell>
      <TableCell className="py-2">
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-12 rounded-full bg-muted">
            <div className={`h-full rounded-full ${d.delta >= 0 ? "bg-primary/60" : "bg-ok/60"}`} style={{ width }} />
          </div>
          <span className="w-12 text-right tnum text-sm">{signed1(d.delta)}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

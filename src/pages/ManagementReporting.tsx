import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { KpiTile, PageHeader, Panel } from "@/components/vocab";
import { MonthlyResult, toMonthRows } from "@/components/reporting/MonthlyResult";
import { RupeeStack } from "@/components/reporting/RupeeStack";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { grossMargin, monthlyPnl, operatingProfit, pct, pnlByBusinessUnit, projectMargins, sumPl } from "@/engine/pnl";
import { useScopeStore, usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE = 14;
const LOW_MARGIN = 0.1;

const hint = {
  revenue: "Revenue from operations for the fiscal year to date, against the same stretch a year earlier.",
  operating: "Revenue less materials, employees, depreciation and other expenses, before other income and tax.",
  gross: "Revenue less the cost of materials, as a share of revenue.",
  employee: "Employee benefits expense as a share of revenue.",
  low: "Projects whose revenue less the cost booked to them is under 10% of the revenue, or negative.",
  completion: "Contract value less the estimated cost at completion. The estimate is the cost to date divided by the share of the contract recognised, so it assumes cost keeps pace with revenue.",
};

export function ManagementReporting() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const scope = useScopeStore((s) => s.businessUnitId);
  const [params, setParams] = useQueryParams();
  const stage = params.get("mstage") ?? "all";
  const view = params.get("mview") ?? "costed";
  const [page, setPage] = useState(0);

  const bus = useMemo(() => pnlByBusinessUnit(periodEnd), [periodEnd]);
  const months = useMemo(() => monthlyPnl(periodEnd, 12), [periodEnd]);
  const projectsAll = useMemo(() => projectMargins(periodEnd), [periodEnd]);

  const inScope = (id: string) => scope === "all" || id === scope;
  const rows = bus.filter((b) => inScope(b.businessUnitId));
  const cur = sumPl(rows.map((r) => r.current));
  const prior = sumPl(rows.map((r) => r.prior));
  const projects = projectsAll.filter((p) => inScope(p.businessUnitId));
  const costed = projects.filter((p) => p.costBooked);
  const low = costed.filter((p) => p.marginPct < LOW_MARGIN);
  const atCompletion = costed.reduce((s, p) => s + p.marginAtCompletion, 0);
  const contract = costed.reduce((s, p) => s + p.contractValue, 0);

  const shown = projects.filter((p) => (stage === "all" || p.project.stage === stage) && (view === "all" || (view === "costed" ? p.costBooked : view === "low" ? p.costBooked && p.marginPct < LOW_MARGIN : !p.costBooked)));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const visible = shown.slice(Math.min(page, pages - 1) * PAGE, (Math.min(page, pages - 1) + 1) * PAGE);
  const stages = [...new Set(projects.map((p) => p.project.stage))];
  const growth = prior.revenue ? (cur.revenue - prior.revenue) / prior.revenue : undefined;
  const margin = pct(operatingProfit(cur), cur.revenue);
  const marginBefore = pct(operatingProfit(prior), prior.revenue);
  const scopeName = scope === "all" ? undefined : WORLD.businessUnits.find((b) => b.id === scope)?.name;

  return (
    <div className="space-y-4">
      <PageHeader title="Management Reporting" badge={scopeName ? <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{scopeName}</span> : undefined} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Revenue" hint={hint.revenue} value={fmtINRCompact(cur.revenue)} delta={growth === undefined ? undefined : `${Math.abs(growth * 100).toFixed(1)}% on last year`} trend={growth === undefined ? "flat" : growth >= 0 ? "up" : "down"} goodWhen="up" />
        <KpiTile label="Operating profit" hint={hint.operating} value={fmtINRCompact(operatingProfit(cur))} sublabel={`${fmtPct(margin)} of revenue`} delta={prior.revenue ? `${Math.abs((margin - marginBefore) * 100).toFixed(1)} pts` : undefined} trend={margin >= marginBefore ? "up" : "down"} goodWhen="up" />
        <KpiTile label="Gross margin" hint={hint.gross} value={fmtPct(pct(grossMargin(cur), cur.revenue))} sublabel={`${fmtINRCompact(cur.materials)} of materials`} />
        <KpiTile label="Employee cost" hint={hint.employee} value={fmtPct(pct(cur.employee, cur.revenue))} sublabel={`${fmtINRCompact(cur.employee)} of revenue`} />
        <KpiTile label="Projects under 10% margin" hint={hint.low} value={fmtInt(low.length)} sublabel={`of ${fmtInt(costed.length)} with cost booked`} accent={low.length ? "warn" : "ok"} onClick={() => setParams({ mview: "low" })} />
        <KpiTile label="Margin at completion" hint={hint.completion} value={fmtINRCompact(atCompletion)} sublabel={contract ? `${fmtPct(pct(atCompletion, contract))} of contract value` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Where each rupee of revenue goes" className="xl:col-span-2">
          <RupeeStack rows={bus.filter((b) => b.current.revenue > 0 && inScope(b.businessUnitId)).map((b) => ({ id: b.businessUnitId, name: b.name, current: b.current, prior: b.prior }))} />
        </Panel>
        <Panel title="Revenue and operating margin by month">
          <MonthlyResult months={toMonthRows(months, scope)} />
        </Panel>
      </div>

      <Panel
        title="Projects"
        bodyClassName="p-0"
        actions={
          <>
            <Select value={view} onValueChange={(v) => { setParams({ mview: v === "costed" ? null : v }); setPage(0); }}>
              <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="costed">With cost booked</SelectItem>
                <SelectItem value="low">Under 10% margin</SelectItem>
                <SelectItem value="uncosted">No cost booked yet</SelectItem>
                <SelectItem value="all">All projects</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stage} onValueChange={(v) => { setParams({ mstage: v === "all" ? null : v }); setPage(0); }}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Contract</TableHead>
              <TableHead>Recognised</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">At completion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((p) => (
              <TableRow key={p.project.wbs}>
                <TableCell className="max-w-72">
                  <div className="truncate text-sm">{p.project.name}</div>
                  <div className="truncate text-2xs text-muted-foreground"><span className="font-mono">{p.project.wbs}</span> · {p.customer} · {p.businessUnitId}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{p.project.stage}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(p.contractValue)}</TableCell>
                <TableCell className="w-28">
                  <div className="h-1.5 w-20 rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, p.recognised * 100)}%` }} /></div>
                  <div className="mt-0.5 text-2xs text-muted-foreground tnum">{Math.round(p.recognised * 100)}%</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(p.revenue)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{p.costBooked ? fmtINRCompact(p.cost) : <span className="text-muted-foreground">none</span>}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">
                  {p.costBooked ? <span className={cn(p.marginPct < 0 ? "text-danger-foreground" : p.marginPct < LOW_MARGIN ? "text-warn-foreground" : "")}>{fmtINRCompact(p.margin)} · {fmtPct(p.marginPct)}</span> : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{p.costBooked && p.marginAtCompletion ? fmtINRCompact(p.marginAtCompletion) : <span className="text-muted-foreground">-</span>}</TableCell>
              </TableRow>
            ))}
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No project matches</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span className="tnum">{shown.length ? `${fmtInt(Math.min(page, pages - 1) * PAGE + 1)}-${fmtInt(Math.min(shown.length, (Math.min(page, pages - 1) + 1) * PAGE))} of ${fmtInt(shown.length)}` : "0 projects"}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="tnum">{Math.min(page, pages - 1) + 1} / {pages}</span>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

import { useMemo } from "react";
import { Waterfall, type WaterfallColumn } from "@/components/charts/Waterfall";
import { DocLink, KpiTile, MethodBadge, PageHeader, Panel } from "@/components/vocab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { driversOf, draftVarianceCommentary, varianceBridge, type Base } from "@/engine/variance";
import { usePeriodStore, useScopeStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const signed = (n: number) => (Math.abs(n) < 0.5 ? "-" : `${n > 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`);
const tone = (n: number) => (n > 0 ? "text-ok-foreground" : n < 0 ? "text-danger-foreground" : "");

export function VarianceAnalysis() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const scope = useScopeStore((s) => s.businessUnitId);
  const [params, setParams] = useQueryParams();
  const base = (params.get("vbase") as Base) ?? "prior-month";

  const bridge = useMemo(() => varianceBridge(periodEnd, base, scope), [periodEnd, base, scope]);
  const selectedId = params.get("vcomp") ?? bridge.components[0]?.id;
  const selected = bridge.components.find((c) => c.id === selectedId) ?? bridge.components[0];
  const drivers = useMemo(() => (selected ? driversOf(periodEnd, base, selected.id, scope) : []), [periodEnd, base, scope, selected]);
  const text = useMemo(() => draftVarianceCommentary(bridge, base), [bridge, base]);

  const columns = useMemo<WaterfallColumn[]>(() => {
    let level = bridge.priorProfit;
    const cols: WaterfallColumn[] = [{ key: "start", label: fmtMonth(bridge.prior.to), sub: "operating profit", from: 0, to: level, value: level, tone: "ink" }];
    for (const c of bridge.components) {
      cols.push({ key: c.id, label: c.label, sub: c.kind === "revenue" ? "revenue" : c.kind === "one-off" ? "manual journals" : "cost", from: level, to: level + c.effect, value: c.effect, tone: c.effect >= 0 ? "ok" : "danger", connect: true });
      level += c.effect;
    }
    cols.push({ key: "end", label: fmtMonth(bridge.current.to), sub: "operating profit", from: 0, to: level, value: level, tone: bridge.total >= 0 ? "ok" : "danger" });
    return cols;
  }, [bridge]);
  const all = columns.flatMap((c) => [c.from, c.to]);

  const revenue = bridge.components.filter((c) => c.kind === "revenue").reduce((s, c) => s + c.effect, 0);
  const cost = bridge.components.filter((c) => c.kind === "cost").reduce((s, c) => s + c.effect, 0);
  const oneOff = bridge.components.find((c) => c.kind === "one-off");
  const scopeName = scope === "all" ? undefined : WORLD.businessUnits.find((b) => b.id === scope)?.name;
  const peak = Math.max(1, ...bridge.components.map((c) => Math.abs(c.effect)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Variance Analysis"
        badge={scopeName ? <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs font-medium">{scopeName}</span> : undefined}
        actions={
          <Select value={base} onValueChange={(v) => setParams({ vbase: v === "prior-month" ? null : v, vcomp: null })}>
            <SelectTrigger className="h-8 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="prior-month">Against the month before</SelectItem>
              <SelectItem value="prior-year">Against the same month last year</SelectItem>
            </SelectContent>
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Operating profit" hint="Revenue less materials, employees, depreciation and other expenses for the month, before other income and tax." value={fmtINRCompact(bridge.currentProfit)} delta={`${fmtINRCompact(Math.abs(bridge.total))}, ${fmtPct(bridge.priorProfit ? Math.abs(bridge.total / bridge.priorProfit) : 0)}`} trend={bridge.total >= 0 ? "up" : "down"} goodWhen="up" sublabel={`against ${fmtINRCompact(bridge.priorProfit)}`} />
        <KpiTile label="From revenue" value={signed(revenue)} sublabel="change in profit" accent={revenue >= 0 ? "ok" : "danger"} />
        <KpiTile label="From costs" hint="The effect of costs on profit: positive when costs were lower, negative when they were higher." value={signed(cost)} sublabel="change in profit" accent={cost >= 0 ? "ok" : "danger"} />
        <KpiTile label="Largest driver" value={selected ? signed(bridge.components[0].effect) : "-"} sublabel={bridge.components[0]?.label} />
        <KpiTile label="One-off entries" hint="Manual journals of ₹25 lakh or more on profit and loss accounts." value={oneOff ? signed(oneOff.effect) : "None"} sublabel={oneOff ? `${oneOff.lines} entries` : "in either month"} />
      </div>

      <Panel title={`What moved operating profit, ${fmtMonth(bridge.current.to)}`} actions={<span className="text-xs text-muted-foreground tnum">Residual {Math.abs(bridge.residual) < 0.5 ? "nil" : fmtINRCompact(bridge.residual)}</span>}>
        <Waterfall columns={columns} min={Math.min(0, ...all)} max={Math.max(...all)} plot={250} format={(v) => (v === columns[0].value || v === columns[columns.length - 1].value ? fmtINRCompact(v) : signed(v))} />
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Components" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead className="text-right">{fmtMonth(bridge.prior.to)}</TableHead>
                <TableHead className="text-right">{fmtMonth(bridge.current.to)}</TableHead>
                <TableHead>Effect on profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bridge.components.map((c) => (
                <TableRow key={c.id} className={cn("cursor-pointer", selected?.id === c.id && "bg-accent/60")} onClick={() => setParams({ vcomp: c.id })}>
                  <TableCell>
                    <div className="text-sm">{c.label}</div>
                    <div className="text-2xs text-muted-foreground">{c.kind === "revenue" ? "Revenue" : c.kind === "one-off" ? "One-off" : "Cost"}, {c.lines} postings</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(Math.abs(c.prior))}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tnum">{fmtINRCompact(Math.abs(c.current))}</TableCell>
                  <TableCell className="w-56">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-secondary">
                        <div className={cn("absolute top-0 h-full rounded-full", c.effect >= 0 ? "bg-ok" : "bg-danger")} style={c.effect >= 0 ? { left: "50%", width: `${(Math.abs(c.effect) / peak) * 50}%` } : { right: "50%", width: `${(Math.abs(c.effect) / peak) * 50}%` }} />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                      </div>
                      <span className={cn("w-20 text-right text-xs tnum", tone(c.effect))}>{signed(c.effect)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
        <Panel title="Reading of the movement" actions={<MethodBadge method="judgement" showConfidence={false} />}>
          <p className="text-sm leading-6">{text}</p>
        </Panel>
      </div>

      {selected && (
        <Panel title={`Largest postings in ${selected.label.toLowerCase()}, ${fmtMonth(bridge.current.to)}`} bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Party and text</TableHead>
                <TableHead>Posted</TableHead>
                <TableHead className="text-right">Effect on profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.line.key}>
                  <TableCell><DocLink itemKey={d.line.key}>{d.line.docNo}</DocLink></TableCell>
                  <TableCell className="max-w-48 truncate text-xs">{d.line.gl}</TableCell>
                  <TableCell className="max-w-72">
                    <div className="truncate text-sm">{d.party ?? d.line.text ?? "-"}</div>
                    {d.party && d.line.text && <div className="truncate text-2xs text-muted-foreground">{d.line.text}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs tnum">{fmtDate(d.line.postingDate)}{d.newThisPeriod ? <span className="ml-2 rounded-sm bg-info-subtle px-1.5 py-0.5 text-2xs text-info-foreground">new account</span> : null}</TableCell>
                  <TableCell className={cn("whitespace-nowrap text-right tnum", tone(d.impact))}>{signed(d.impact)}</TableCell>
                </TableRow>
              ))}
              {drivers.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No posting</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiTile, Panel } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID, PC_BY_ID } from "@/data";
import { projectRows, type ProjectRow } from "@/engine/management";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`;

function Detail({ p }: { p: ProjectRow }) {
  const data = p.trend.map((t) => ({ month: fmtMonth(t.monthEnd).slice(0, 3), margin: +(t.marginPercent * 100).toFixed(2) }));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="text-base font-semibold">{p.project.name}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{p.project.wbs}</span> · {PC_BY_ID.get(p.project.profitCentreId)?.name} · {p.project.stage}
        </SheetDescription>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Margin at completion by month end</h3>
          <div className="h-44 w-full" role="img" aria-label="Margin at completion by month end">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickLine={false} axisLine={false} width={40} unit="%" domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
                <Line type="monotone" dataKey="margin" name="Margin at completion" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <Fields
          compact
          rows={[
            ["Customer", PARTY_BY_ID.get(p.project.customerId)?.name ?? p.project.customerId],
            ["Started", fmtDate(p.project.startDate)],
            ["Contract value", fmtINRCompact(p.contractValue)],
            ["Cost to date", fmtINRCompact(p.costToDate)],
            ["Estimate at completion", `${fmtINRCompact(p.estimateAtCompletion)}, ${signed(p.estimateChange)} in the month`],
            ["Percentage complete", `${fmtPct(p.percentComplete)} (cost to date over the estimate)`],
            ["Revenue earned", fmtINRCompact(p.revenueEarned)],
            ["Revenue booked", fmtINRCompact(p.revenueBooked)],
            [p.unbilled >= 0 ? "Still to bill" : "Billed ahead", fmtINRCompact(Math.abs(p.unbilled))],
            ["Margin at completion", `${fmtINRCompact(p.marginAtCompletion)}, ${fmtPct(p.marginPercent)}`],
          ]}
        />
      </div>
    </div>
  );
}

export function ProjectsTab() {
  const rows = useMemo(() => projectRows(), []);
  const [params, setParams] = useQueryParams();
  const selected = rows.find((r) => r.project.wbs === params.get("project"));

  const totals = useMemo(() => {
    const contract = rows.reduce((s, r) => s + r.contractValue, 0);
    const eac = rows.reduce((s, r) => s + r.estimateAtCompletion, 0);
    const rising = rows.filter((r) => r.estimateChange > 0);
    return { contract, margin: contract ? (contract - eac) / contract : 0, rising: rising.length, rise: rising.reduce((s, r) => s + r.estimateChange, 0) };
  }, [rows]);
  const top = useMemo(() => rows.slice(0, 8).map((r) => ({ name: r.project.name.length > 26 ? `${r.project.name.slice(0, 25)}...` : r.project.name, full: r.project.name, rise: +(r.estimateChange / 1e5).toFixed(1), wbs: r.project.wbs })), [rows]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Projects under way" value={fmtInt(rows.length)} sublabel="in execution or commissioned" accent="info" />
        <KpiTile label="Contract value" value={fmtINRCompact(totals.contract)} />
        <KpiTile label="Margin at completion" info="Contract value less the estimate at completion, over the contract value" value={fmtPct(totals.margin)} sublabel="all projects under way" />
        <KpiTile label="Estimates rising" info="Projects whose estimate at completion is higher than at the last month end" value={fmtInt(totals.rising)} sublabel={`${signed(totals.rise)} in the month`} accent={totals.rising ? "warn" : "ok"} />
        <KpiTile label="Largest rise" value={rows[0] ? fmtINRCompact(rows[0].estimateChange) : "-"} sublabel={rows[0]?.project.name} accent={rows[0]?.estimateChange ? "warn" : "none"} />
      </div>

      <Panel title="Change in the estimate at completion this month (₹ lakh)">
        <div className="h-60 w-full" role="img" aria-label="Largest rises in the estimate at completion">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="category" dataKey="name" width={190} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
              <Tooltip formatter={(v: number) => `₹${v} lakh`} labelFormatter={(_, p) => (p?.[0]?.payload as { full?: string } | undefined)?.full ?? ""} contentStyle={{ borderRadius: 6, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              <Bar dataKey="rise" fill="hsl(var(--warn))" radius={[0, 3, 3, 0]} maxBarSize={18} isAnimationActive={false} onClick={(d: { wbs: string }) => setParams({ project: d.wbs })} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel title="Projects under way" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Contract</TableHead>
              <TableHead className="text-right">Complete</TableHead>
              <TableHead className="text-right">Cost to date</TableHead>
              <TableHead className="text-right">Estimate at completion</TableHead>
              <TableHead className="text-right">Change in month</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Margin last month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 120).map((r) => (
              <TableRow key={r.project.wbs} className="cursor-pointer" data-state={r.project.wbs === selected?.project.wbs ? "selected" : undefined} onClick={() => setParams({ project: r.project.wbs })}>
                <TableCell className="max-w-72 py-2">
                  <div className="truncate text-sm">{r.project.name}</div>
                  <div className="truncate text-2xs text-muted-foreground">
                    <span className="font-mono">{r.project.wbs}</span> · {PC_BY_ID.get(r.project.profitCentreId)?.name}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(r.contractValue)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm">{fmtPct(r.percentComplete)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(r.costToDate)}</TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(r.estimateAtCompletion)}</TableCell>
                <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", r.estimateChange > 0 && "text-danger-foreground")}>{r.estimateChange === 0 ? "-" : signed(r.estimateChange)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm">{fmtPct(r.marginPercent)}</TableCell>
                <TableCell className="py-2 text-right tnum text-sm text-muted-foreground">{r.priorMarginPercent === undefined ? "-" : fmtPct(r.priorMarginPercent)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length > 120 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the 120 projects whose estimates rose most of {fmtInt(rows.length)}</div>}
      </Panel>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setParams({ project: null })}>
        <SheetContent>{selected && <Detail key={selected.project.wbs} p={selected} />}</SheetContent>
      </Sheet>
    </div>
  );
}

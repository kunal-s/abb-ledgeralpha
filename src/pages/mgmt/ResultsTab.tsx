import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiTile, Panel } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resultsTable, type ResultRow } from "@/engine/management";
import { hasBudget } from "@/engine/budget";
import { margin, operatingResult } from "@/engine/pl";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (cur: number, base: number) => (base === 0 ? undefined : (cur - base) / Math.abs(base));
const signed = (n: number) => `${n >= 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`;
const signedPct = (n?: number) => (n === undefined ? "-" : `${n >= 0 ? "+" : "-"}${Math.abs(n * 100).toFixed(1)}%`);

const tone = (n: number | undefined, goodWhenUp = true) => (n === undefined || Math.abs(n) < 0.0005 ? "" : (n > 0) === goodWhenUp ? "text-ok-foreground" : "text-danger-foreground");

export function ResultsTab() {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const month = periodEnd.slice(0, 7);
  const [params, setParams] = useQueryParams();
  const ytdView = params.get("mview") === "ytd";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const rows = useMemo(() => resultsTable(month), [month]);
  const budgeted = hasBudget(month);

  const company = rows[0];
  const units = rows.filter((r) => r.level === "bu");
  const cur = (r: ResultRow) => (ytdView ? r.ytd : r.month);
  const base = (r: ResultRow) => (ytdView ? undefined : r.prior);
  const plan = (r: ResultRow) => (ytdView ? r.ytdBudget : r.budget);

  const chart = useMemo(
    () => units.map((u) => ({ name: u.label.length > 14 ? u.label.split(" ")[0] : u.label, "This month": +(((margin(u.month) ?? 0) * 100).toFixed(1)), "Prior month": +(((margin(u.prior) ?? 0) * 100).toFixed(1)), Budget: +(((margin(u.budget) ?? 0) * 100).toFixed(1)) })),
    [units]
  );
  const behind = units.filter((u) => operatingResult(u.ytd) < operatingResult(u.ytdBudget)).length;

  const visible = rows.filter((r) => r.level !== "pc" || !collapsed.has(r.parentId!));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Revenue" value={fmtINRCompact(company.month.revenue)} sublabel={`${signedPct(pct(company.month.revenue, company.prior.revenue))} on last month`} accent="info" />
        <KpiTile label="Operating result" info="Revenue less the costs of operating; interest and tax are below it" value={fmtINRCompact(operatingResult(company.month))} sublabel={budgeted ? `${signed(operatingResult(company.month) - operatingResult(company.budget))} against budget` : undefined} accent={budgeted && operatingResult(company.month) < operatingResult(company.budget) ? "warn" : "ok"} />
        <KpiTile label="Margin" value={fmtPct(margin(company.month) ?? 0)} sublabel={`was ${fmtPct(margin(company.prior) ?? 0)} last month`} />
        <KpiTile label="Result, year to date" value={fmtINRCompact(operatingResult(company.ytd))} sublabel={budgeted ? `${signed(operatingResult(company.ytd) - operatingResult(company.ytdBudget))} against budget` : undefined} />
        <KpiTile label="Behind budget" value={`${behind} of ${units.length}`} sublabel="business units, year to date" accent={behind ? "warn" : "ok"} />
      </div>

      <Panel title={`Operating margin by business unit, ${fmtMonth(`${month}-01`)}`}>
        <div className="h-56 w-full" role="img" aria-label="Operating margin by business unit: this month, prior month and budget">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tickLine={false} axisLine={false} width={40} unit="%" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 6, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="This month" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="Prior month" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
              <Bar dataKey="Budget" fill="hsl(var(--muted-foreground) / 0.45)" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <Panel
        title="Results by business unit and profit centre"
        bodyClassName="p-0"
        actions={
          <div className="flex rounded-md border border-border p-0.5 text-xs normal-case">
            {[
              { key: "month", label: "Month" },
              { key: "ytd", label: "Year to date" },
            ].map((m) => (
              <button key={m.key} type="button" onClick={() => setParams({ mview: m.key === "month" ? null : m.key })} className={cn("rounded px-2 py-0.5", (m.key === "ytd") === ytdView ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">On last month</TableHead>
              <TableHead className="text-right">On budget</TableHead>
              <TableHead className="text-right">Operating result</TableHead>
              <TableHead className="text-right">Margin</TableHead>
              <TableHead className="text-right">Result on last month</TableHead>
              <TableHead className="text-right">Result on budget</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((r) => {
              const c = cur(r);
              const b = base(r);
              const p = plan(r);
              const res = operatingResult(c);
              const dBase = b ? res - operatingResult(b) : undefined;
              const dPlan = budgeted && p.revenue + p.material + p.employee > 0 ? res - operatingResult(p) : undefined;
              const scope = r.level === "company" ? "" : r.level === "bu" ? `bu:${r.id}` : `pc:${r.id}`;
              return (
                <TableRow key={r.id} className={cn(r.level === "company" && "bg-muted/40 hover:bg-muted/40", r.level === "bu" && "bg-muted/20")}>
                  <TableCell className={cn("py-2 text-sm", r.level === "pc" && "pl-9", r.level !== "pc" && "font-medium")}>
                    {r.level === "bu" ? (
                      <button type="button" className="flex items-center gap-1" onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}>
                        {collapsed.has(r.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {r.label}
                      </button>
                    ) : (
                      r.label
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(c.revenue)}</TableCell>
                  <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", tone(b ? pct(c.revenue, b.revenue) : undefined))}>{b ? signedPct(pct(c.revenue, b.revenue)) : "-"}</TableCell>
                  <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", tone(budgeted ? pct(c.revenue, p.revenue) : undefined))}>{budgeted && p.revenue ? signedPct(pct(c.revenue, p.revenue)) : "-"}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINRCompact(res)}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{c.revenue ? fmtPct(margin(c) ?? 0) : "-"}</TableCell>
                  <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", tone(dBase))}>{dBase === undefined ? "-" : signed(dBase)}</TableCell>
                  <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", tone(dPlan))}>{dPlan === undefined ? "-" : signed(dPlan)}</TableCell>
                  <TableCell className="py-2 text-right">
                    <Link to={`/reporting/variance${scope ? `?vscope=${scope}` : ""}`} className="text-xs font-medium text-primary hover:underline">
                      Explain
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

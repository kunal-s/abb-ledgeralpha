import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DocLink } from "@/components/vocab";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { accountView, fiscalYearMonths } from "@/engine/financials";
import { CATEGORY_LABELS } from "@/lib/labels";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtINRCompact } from "@/lib/format";

/** An account behind a statement line: its month-end balances and its postings in the fiscal year. */
export function AccountBody({ gl }: { gl: string }) {
  const { from } = fiscalYearMonths(WORLD.asOf, TENANT.fiscalYear.startMonth);
  const v = accountView(gl, `${from}-01`, WORLD.asOf);
  if (!v) return <div className="p-5 text-sm">Account not found</div>;
  const data = v.trend.map((t) => ({ month: fmtMonth(`${t.month}-01`).slice(0, 3), closing: t.closing }));
  const reviewed = v.gl.category !== "pl";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="text-base font-semibold">{v.gl.description}</SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          <span className="font-mono">{v.gl.gl}</span> · {v.gl.statementLine} · {CATEGORY_LABELS[v.gl.category]}
        </SheetDescription>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="tnum text-2xl font-semibold tracking-tight">{fmtDrCr(data.at(-1)?.closing ?? 0)}</div>
          {reviewed && (
            <Link to={`/balance-sheet-review/${v.gl.gl}`} className="text-xs font-medium text-primary hover:underline">
              Open in Balance Sheet Review
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-6">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Closing balance by month</h3>
          <div className="h-40 w-full" role="img" aria-label="Closing balance by month">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tickLine={false} axisLine={false} width={64} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(x: number) => fmtINRCompact(x)} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip formatter={(x: number) => fmtDrCr(x)} contentStyle={{ borderRadius: 6, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} />
                <Bar dataKey="closing" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Postings this year, newest first{v.count > v.postings.length ? ` (${v.postings.length} of ${v.count})` : ` (${v.count})`}
          </h3>
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {v.postings.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="py-1.5">
                      <DocLink itemKey={l.key}>{l.docNo}</DocLink>
                      <div className="max-w-52 truncate text-2xs text-muted-foreground">{l.text ?? ""}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-xs tnum">{fmtDate(l.postingDate)}</TableCell>
                    <TableCell className="whitespace-nowrap py-1.5 text-right tnum text-xs">{fmtINR(l.amount)}</TableCell>
                  </TableRow>
                ))}
                {v.postings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                      No postings this year
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { KpiTile, Panel } from "@/components/vocab";
import type { BarGroup } from "@/components/review/StatusBars";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARTY_BY_ID, WORLD } from "@/data";
import { useExpectedCredits, useTds } from "@/state/tdsHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { CREDIT_AGE_BUCKETS, TDS_STATUS_LABELS, creditAgeBucket, taxYearsElapsed, type TdsCreditStatus } from "@/engine/tds";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

export const TDS_GROUPS: (BarGroup & { status: TdsCreditStatus })[] = [
  { key: "matched", label: TDS_STATUS_LABELS.matched, cls: "bg-ok", status: "matched" },
  { key: "wrong-tan", label: TDS_STATUS_LABELS["wrong-tan"], cls: "bg-info", status: "wrong-tan" },
  { key: "short", label: TDS_STATUS_LABELS.short, cls: "bg-warn", status: "short" },
  { key: "wrong-quarter", label: TDS_STATUS_LABELS["wrong-quarter"], cls: "bg-warn/55", status: "wrong-quarter" },
  { key: "missing", label: TDS_STATUS_LABELS.missing, cls: "bg-danger", status: "missing" },
  { key: "pending", label: TDS_STATUS_LABELS.pending, cls: "bg-muted-foreground/25", status: "pending" },
];

/** A quarter label sorts chronologically when the tax year leads: "Q4 FY2025-26" -> "FY2025-26 Q4". */
export const quarterSortKey = (q: string) => q.split(" ").reverse().join(" ");

const AT_RISK: TdsCreditStatus[] = ["short", "missing", "wrong-quarter"];

export function OverviewTab() {
  const { analysis, params } = useTds();
  const expected = useExpectedCredits();
  const [, setParams] = useQueryParams();

  const lines = useMemo(
    () => analysis.open.map((l) => ({ l, a: analysis.byLine.get(l.key) })).filter((x): x is { l: (typeof analysis.open)[number]; a: NonNullable<typeof x.a> } => !!x.a),
    [analysis],
  );

  const stats = useMemo(() => {
    const sum = (xs: typeof lines) => xs.reduce((s, x) => s + x.l.amount, 0);
    const of = (...st: TdsCreditStatus[]) => lines.filter((x) => st.includes(x.a.status));
    return { sum, of, risk: of(...AT_RISK) };
  }, [lines]);

  const byQuarter = useMemo(() => {
    const data: Record<string, Record<string, number>> = {};
    for (const x of lines) {
      const q = x.a.quarter;
      data[q] ??= {};
      data[q][x.a.status] = (data[q][x.a.status] ?? 0) + 1;
      data[q].amount = (data[q].amount ?? 0) + x.l.amount;
    }
    return data;
  }, [lines]);
  const quarters = Object.keys(byQuarter)
    .sort((a, b) => quarterSortKey(a).localeCompare(quarterSortKey(b)))
    .slice(-12);

  const ageing = useMemo(
    () =>
      CREDIT_AGE_BUCKETS.map((b) => {
        const xs = stats.risk.filter((x) => creditAgeBucket(x.l.postingDate, WORLD.asOf) === b.id);
        return { ...b, count: xs.length, value: stats.sum(xs), barred: xs.filter((x) => taxYearsElapsed(x.l.postingDate, WORLD.asOf) > params.writeOffYears).length };
      }),
    [stats, params.writeOffYears],
  );
  const barred = stats.risk.filter((x) => taxYearsElapsed(x.l.postingDate, WORLD.asOf) > params.writeOffYears);

  const deductors = useMemo(() => {
    const m = new Map<string, { id: string; n: number; v: number; oldest: string }>();
    for (const x of stats.risk) {
      const id = x.l.partner!.id;
      const e = m.get(id) ?? { id, n: 0, v: 0, oldest: x.l.postingDate };
      e.n += 1;
      e.v += x.l.amount;
      if (x.l.postingDate < e.oldest) e.oldest = x.l.postingDate;
      m.set(id, e);
    }
    return [...m.values()].sort((a, b) => b.v - a.v).slice(0, 5);
  }, [stats.risk]);

  const go = (extra: Record<string, string | null>) => setParams({ tab: "receivable", tstatus: null, tquarter: null, tage: null, ...extra }, { replace: false });
  const expectedMissing = expected.filter((e) => e.check.status === "missing" || e.check.status === "short" || e.check.status === "wrong-quarter");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Deductions open" value={fmtInt(lines.length)} sublabel={fmtINRCompact(stats.sum(lines))} onClick={() => go({})} />
        <KpiTile
          label="Matched to the statement"
          value={fmtInt(stats.of("matched").length)}
          sublabel={fmtINRCompact(stats.sum(stats.of("matched")))}
          accent="ok"
          onClick={() => go({ tstatus: "matched" })}
        />
        <KpiTile
          label="Short, missing or wrong quarter"
          value={fmtINRCompact(stats.sum(stats.risk))}
          sublabel={`${fmtInt(stats.risk.length)} deductions`}
          accent={stats.risk.length ? "danger" : "none"}
          onClick={() => go({ tstatus: "at-risk" })}
        />
        <KpiTile
          label="Wrong tax ID"
          value={fmtInt(stats.of("wrong-tan").length)}
          sublabel={fmtINRCompact(stats.sum(stats.of("wrong-tan")))}
          accent={stats.of("wrong-tan").length ? "info" : "none"}
          onClick={() => go({ tstatus: "wrong-tan" })}
        />
        <KpiTile label="Statement not yet available" value={fmtInt(stats.of("pending").length)} sublabel={fmtINRCompact(stats.sum(stats.of("pending")))} onClick={() => go({ tstatus: "pending" })} />
        <KpiTile
          label="Expected from applications"
          value={fmtINRCompact(expected.reduce((s, e) => s + e.amount, 0))}
          sublabel={`${fmtInt(expectedMissing.length)} not in the statement`}
          accent={expectedMissing.length ? "warn" : "none"}
          onClick={() => setParams({ tab: "expected" }, { replace: false })}
        />
      </div>

      <Panel title="Statement check by tax-year quarter" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quarter</TableHead>
              <TableHead className="text-right">Deducted</TableHead>
              {TDS_GROUPS.map((g) => (
                <TableHead key={g.key} className="text-right">
                  {g.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarters.map((q) => (
              <TableRow key={q}>
                <TableCell className="whitespace-nowrap">{q}</TableCell>
                <TableCell className="text-right tnum whitespace-nowrap">{fmtINRCompact(byQuarter[q].amount ?? 0)}</TableCell>
                {TDS_GROUPS.map((g) => {
                  const n = byQuarter[q][g.key] ?? 0;
                  const risky = AT_RISK.includes(g.status) || g.status === "wrong-tan";
                  return (
                    <TableCell key={g.key} className={cn("text-right tnum", n && risky && "font-medium text-danger-foreground", !n && "text-muted-foreground")}>
                      {n ? (
                        <button type="button" className="hover:underline" onClick={() => go({ tquarter: q, tstatus: g.key })}>
                          {fmtInt(n)}
                        </button>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Panel title="Credits at risk by age" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Age</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ageing.map((a) => (
                <TableRow key={a.id} className="cursor-pointer" onClick={() => go({ tstatus: "at-risk", tage: a.id })}>
                  <TableCell>{a.label}</TableCell>
                  <TableCell className="text-right tnum">{fmtInt(a.count)}</TableCell>
                  <TableCell className="text-right tnum whitespace-nowrap">{fmtINRCompact(a.value)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 border-border font-medium">
                <TableCell>Total at risk</TableCell>
                <TableCell className="text-right tnum">{fmtInt(stats.risk.length)}</TableCell>
                <TableCell className="text-right tnum whitespace-nowrap">{fmtINRCompact(stats.sum(stats.risk))}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
            {fmtInt(barred.length)} past the claim window of {params.writeOffYears} tax years ({fmtINRCompact(stats.sum(barred))}); write-off needs tax review
          </div>
        </Panel>

        <Panel title="Customers with the most at risk" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductors.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => go({ tstatus: "at-risk", tq: PARTY_BY_ID.get(d.id)?.name ?? null })}>
                  <TableCell className="truncate">{PARTY_BY_ID.get(d.id)?.name}</TableCell>
                  <TableCell className="text-right tnum">{fmtInt(d.n)}</TableCell>
                  <TableCell className="text-right tnum whitespace-nowrap">{fmtINRCompact(d.v)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}

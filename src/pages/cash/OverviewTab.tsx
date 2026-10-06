import { useMemo } from "react";
import { Link } from "react-router-dom";
import { KpiTile, Panel } from "@/components/vocab";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCashApp, type CashAppStatus, type ReceiptRow } from "@/state/cashAppHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { LEVEL_LABELS, type MatchLevel } from "@/engine/cashapp";
import { fmtINRCompact, fmtInt } from "@/lib/format";

export const CASH_GROUPS: (BarGroup & { statuses: CashAppStatus[] })[] = [
  { key: "ready", label: "Ready to confirm", cls: "bg-ok", statuses: ["ready"] },
  { key: "suggested", label: "Match to review", cls: "bg-info", statuses: ["suggested"] },
  { key: "progress", label: "Application in approval", cls: "bg-warn", statuses: ["decision-proposed"] },
  { key: "applied", label: "Approved or exported", cls: "bg-ok/55", statuses: ["approved", "exported", "closed-in-erp"] },
  { key: "parked", label: "Parked", cls: "bg-muted-foreground/25", statuses: ["parked"] },
  { key: "unmatched", label: "No match", cls: "bg-danger", statuses: ["unmatched", "in-follow-up"] },
];
export const groupOfStatus = (s: CashAppStatus) => CASH_GROUPS.find((g) => g.statuses.includes(s))!.key;

export const AGE_BUCKETS = [
  { id: "0-30", label: "Up to 30 days", min: 0, max: 30 },
  { id: "31-90", label: "31 to 90 days", min: 31, max: 90 },
  { id: "91-180", label: "91 to 180 days", min: 91, max: 180 },
  { id: "180+", label: "Over 180 days", min: 181, max: Infinity },
] as const;
export const bucketOfAge = (age: number) => AGE_BUCKETS.find((b) => age >= b.min && age <= b.max)!.id;

const LEVELS: (MatchLevel | "none")[] = ["L1", "L2", "L3", "L4", "none"];
const levelOf = (r: ReceiptRow) => r.best?.level ?? "none";

export function OverviewTab() {
  const { rows } = useCashApp();
  const [, setParams] = useQueryParams();

  const stats = useMemo(() => {
    const sum = (rs: ReceiptRow[]) => rs.reduce((s, r) => s + r.receipt.amount, 0);
    const by = (g: string) => rows.filter((r) => groupOfStatus(r.status) === g);
    const open = rows.filter((r) => !["approved", "exported", "closed-in-erp"].includes(r.status));
    const old = open.filter((r) => r.age > 30);
    const inApproval = rows.filter((r) => r.decision && r.decision.status === "proposed");
    return { sum, by, open, old, inApproval };
  }, [rows]);

  const chart = useMemo(() => {
    const data = Object.fromEntries(LEVELS.map((l) => [l, {} as Record<string, number>])) as Record<MatchLevel | "none", Record<string, number>>;
    for (const r of rows) {
      const g = groupOfStatus(r.status);
      data[levelOf(r)][g] = (data[levelOf(r)][g] ?? 0) + 1;
    }
    return data;
  }, [rows]);

  const ageing = useMemo(() => AGE_BUCKETS.map((b) => {
    const rs = stats.open.filter((r) => bucketOfAge(r.age) === b.id);
    return { ...b, count: rs.length, value: stats.sum(rs) };
  }), [stats]);
  const maxAge = Math.max(1, ...ageing.map((a) => a.value));

  const customers = useMemo(() => {
    const m = new Map<string, { name: string; count: number; value: number }>();
    for (const r of stats.open) {
      const k = r.customerId ?? "none";
      const e = m.get(k) ?? { name: r.customerName ?? "Not identified", count: 0, value: 0 };
      e.count += 1;
      e.value += r.receipt.amount;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 8);
  }, [stats.open]);

  const deductions = useMemo(() => {
    const out = { tds: { n: 0, v: 0 }, "gst-tds": { n: 0, v: 0 }, "bank-charges": { n: 0, v: 0 }, "small-difference": { n: 0, v: 0 } };
    for (const r of rows) {
      if (!r.best || ["approved", "exported", "closed-in-erp"].includes(r.status)) continue;
      for (const d of r.best.deductions) {
        out[d.kind].n += 1;
        out[d.kind].v += d.amount;
      }
    }
    return out;
  }, [rows]);

  const go = (extra: Record<string, string | null>) => setParams({ tab: "receipts", cstatus: null, clevel: null, cage: null, ...extra }, { replace: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Receipts in clearing" value={fmtInt(rows.length)} sublabel={fmtINRCompact(stats.sum(rows))} onClick={() => go({})} />
        <KpiTile label="Ready to confirm" value={fmtInt(stats.by("ready").length)} sublabel={fmtINRCompact(stats.sum(stats.by("ready")))} accent="ok" onClick={() => go({ cstatus: "ready" })} />
        <KpiTile label="Match to review" value={fmtInt(stats.by("suggested").length)} sublabel={fmtINRCompact(stats.sum(stats.by("suggested")))} accent="info" onClick={() => go({ cstatus: "suggested" })} />
        <KpiTile label="No match" value={fmtInt(stats.by("unmatched").length)} sublabel={fmtINRCompact(stats.sum(stats.by("unmatched")))} accent="danger" onClick={() => go({ cstatus: "unmatched" })} />
        <KpiTile label="Older than 30 days" value={fmtINRCompact(stats.sum(stats.old))} sublabel={`${fmtInt(stats.old.length)} receipts unapplied`} accent={stats.old.length ? "warn" : "none"} onClick={() => go({ cage: "31-90" })} />
        <KpiTile label="Applications proposed" value={fmtInt(stats.inApproval.length)} sublabel={`${fmtINRCompact(stats.sum(stats.inApproval))} in approval`} onClick={() => setParams({ tab: "decisions" }, { replace: false })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Receipts by match level and status" className="xl:col-span-2">
          <StatusBars
            data={chart}
            rows={LEVELS.map((l) => ({ key: l, label: l === "none" ? "No match" : `${l} ${LEVEL_LABELS[l]}` }))}
            groups={CASH_GROUPS}
            unit="receipts"
            labelWidth="12rem"
            onSelect={(l, g) => go({ clevel: l, cstatus: g })}
          />
        </Panel>

        <Panel title="Unapplied credits by age" bodyClassName="p-4">
          <ul className="space-y-3">
            {ageing.map((a) => (
              <li key={a.id}>
                <button type="button" className="block w-full text-left" onClick={() => go({ cage: a.id })}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{a.label}</span>
                    <span className="flex gap-3 text-xs tnum">
                      <span className="text-muted-foreground">{fmtInt(a.count)}</span>
                      <span className="w-20 text-right">{fmtINRCompact(a.value)}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-sm bg-muted">
                    <div className="h-1.5 rounded-sm bg-primary" style={{ width: `${a.value ? Math.max(1.5, (a.value / maxAge) * 100) : 0}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Unapplied credits by customer" className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Receipts</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className={c.name === "Not identified" ? "text-muted-foreground" : ""}>{c.name}</TableCell>
                  <TableCell className="text-right tnum">{fmtInt(c.count)}</TableCell>
                  <TableCell className="text-right tnum">{fmtINRCompact(c.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Deductions the matcher inferred" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deduction</TableHead>
                <TableHead className="text-right">Receipts</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {([["tds", "Withholding tax"], ["gst-tds", "GST TDS"], ["bank-charges", "Bank charges"], ["small-difference", "Small differences"]] as const).map(([k, label]) => (
                <TableRow key={k}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right tnum">{deductions[k].n ? fmtInt(deductions[k].n) : "-"}</TableCell>
                  <TableCell className="text-right tnum">{deductions[k].v ? fmtINRCompact(deductions[k].v) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-border/70 px-4 py-2 text-xs">
            <Link to="/tax/withholding?tab=expected" className="font-medium text-primary hover:underline">
              See the expected credits in TDS
            </Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}

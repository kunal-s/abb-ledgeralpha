import { useMemo } from "react";
import { Link } from "react-router-dom";
import { KpiTile, Panel, StatusChip } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBars, statusGroupOf } from "@/components/review/StatusBars";
import { useRecRows, type RecRow } from "@/state/recHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { RECON_TYPES, TREATMENT_LABELS } from "@/engine/recClasses";
import { RECON_POLICY } from "@/config/policies";
import { needsAction } from "@/engine/recs";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import type { ReconClass, ReconType } from "@/types";

/** Why a reconciliation needs somebody's attention, most pressing first. */
function attention(r: RecRow): { score: number; reason: string } | undefined {
  if (r.status === "reviewer-signed" || r.status === "preparer-signed") return undefined;
  const v = r.view;
  if (r.rec.reply && !v.work?.source) return { score: 100, reason: "Reply received, not yet applied" };
  if (v.unexplained !== null && !v.withinTolerance) return { score: 90 + Math.min(9, Math.log10(Math.abs(v.unexplained) + 1)), reason: `Unexplained ${fmtINR(Math.abs(v.unexplained))}` };
  if (r.undocumented > 0) return { score: 70, reason: `${r.undocumented} item${r.undocumented === 1 ? "" : "s"} without a decision or follow-up` };
  if (v.confirmation?.status === "not-sent") return { score: 60, reason: "Confirmation request not sent" };
  if (!v.prepared) return { score: 50, reason: "Not yet prepared" };
  if (r.status === "ready-for-signoff") return { score: 40, reason: "Ready for sign-off" };
  return undefined;
}

export function OverviewTab() {
  const rows = useRecRows();
  const [, setParams] = useQueryParams();

  const stats = useMemo(() => {
    const signed = rows.filter((r) => r.status === "reviewer-signed").length;
    const ready = rows.filter((r) => r.status === "ready-for-signoff").length;
    const outside = rows.filter((r) => r.view.unexplained !== null && !r.view.withinTolerance);
    const undocumented = rows.reduce((s, r) => s + r.undocumented, 0);
    const undocumentedValue = rows.reduce((s, r) => s + r.view.items.filter((i) => needsAction(i) && !r.documented.has(i.id)).reduce((t, i) => t + Math.abs(i.amount), 0), 0);
    const waiting = rows.filter((r) => r.view.confirmation && ["not-sent", "sent", "reply-received"].includes(r.view.confirmation.status)).length;
    const proposed = rows.flatMap((r) => [...r.decisionByItem.values()]).filter((d) => ["proposed", "approved", "exported", "closed-in-erp"].includes(d.status));
    return {
      signed, ready, outside,
      unexplained: outside.reduce((s, r) => s + Math.abs(r.view.unexplained ?? 0), 0),
      undocumented, undocumentedValue, waiting,
      proposed: proposed.length,
      proposedValue: proposed.reduce((s, d) => s + Math.abs(d.amount), 0),
      awaiting: proposed.filter((d) => d.status === "proposed").length,
    };
  }, [rows]);

  const chart = useMemo(() => {
    const data = Object.fromEntries(RECON_TYPES.map((t) => [t, {} as Record<string, number>])) as Record<ReconType, Record<string, number>>;
    for (const r of rows) {
      const g = statusGroupOf(r.status);
      data[r.rec.type][g] = (data[r.rec.type][g] ?? 0) + 1;
    }
    return data;
  }, [rows]);

  const needs = useMemo(
    () =>
      rows
        .map((r) => ({ r, a: attention(r) }))
        .filter((x): x is { r: RecRow; a: { score: number; reason: string } } => !!x.a)
        .sort((x, y) => y.a.score - x.a.score)
        .slice(0, 9),
    [rows]
  );

  const byTreatment = useMemo(() => {
    const m = new Map<ReconClass["treatment"] | "none", { count: number; value: number; aged: number }>();
    for (const r of rows) {
      for (const i of r.view.items) {
        const k = i.cls?.treatment ?? "none";
        const e = m.get(k) ?? { count: 0, value: 0, aged: 0 };
        e.count += 1;
        e.value += Math.abs(i.amount);
        if (i.cls && i.cls.treatment !== "classification" && i.ageDays > RECON_POLICY.agedItemDays) e.aged += 1;
        m.set(k, e);
      }
    }
    const order: (ReconClass["treatment"] | "none")[] = ["adjust-books", "adjust-source", "dispute", "investigate", "timing", "classification", "none"];
    return order.filter((k) => m.has(k)).map((k) => ({ key: k, label: k === "none" ? "Not classified" : TREATMENT_LABELS[k], ...m.get(k)! }));
  }, [rows]);

  const toRegister = (extra: Record<string, string | null>) => setParams({ tab: "register", ...extra }, { replace: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Signed off" value={`${stats.signed}/${rows.length}`} sublabel="reviewer signed" accent="ok" onClick={() => toRegister({ rstatus: "signed", type: null })} />
        <KpiTile label="Ready for sign-off" value={fmtInt(stats.ready)} sublabel="preparer can sign" accent={stats.ready ? "warn" : "none"} onClick={() => toRegister({ rstatus: "ready", type: null })} />
        <KpiTile label="Unexplained" value={fmtINRCompact(stats.unexplained)} sublabel={`${fmtInt(stats.outside.length)} outside tolerance`} accent={stats.outside.length ? "danger" : "none"} />
        <KpiTile label="Items needing action" value={fmtInt(stats.undocumented)} sublabel={`${fmtINRCompact(stats.undocumentedValue)} without a decision`} accent={stats.undocumented ? "warn" : "none"} />
        <KpiTile label="Awaiting counterparties" value={fmtInt(stats.waiting)} sublabel="confirmations open" accent="info" onClick={() => setParams({ tab: "statements" }, { replace: false })} />
        <KpiTile label="Entries proposed" value={fmtINRCompact(stats.proposedValue)} sublabel={`${fmtInt(stats.proposed)} entries · ${fmtInt(stats.awaiting)} awaiting approval`} onClick={() => setParams({ tab: "decisions" }, { replace: false })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Reconciliations by type and status" className="xl:col-span-2">
          <StatusBars
            data={chart}
            rows={RECON_TYPES.map((t) => ({ key: t, label: t }))}
            unit="reconciliations"
            labelWidth="9.5rem"
            onSelect={(t, g) => toRegister({ type: t, rstatus: g })}
          />
        </Panel>

        <Panel title="Needs attention" bodyClassName="p-0">
          {needs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing needs attention</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {needs.map(({ r, a }) => (
                <li key={r.rec.id}>
                  <Link to={`/reconciliations/${r.rec.id}`} className="block px-4 py-2.5 hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{r.rec.name}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {r.rec.type} · {a.reason}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Reconciling items by treatment" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Treatment</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Aged over {RECON_POLICY.agedItemDays} days</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byTreatment.map((t) => (
              <TableRow key={t.key}>
                <TableCell>{t.label}</TableCell>
                <TableCell className="text-right tnum">{fmtInt(t.count)}</TableCell>
                <TableCell className="text-right tnum">{fmtINRCompact(t.value)}</TableCell>
                <TableCell className="text-right tnum">{t.aged ? fmtInt(t.aged) : "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

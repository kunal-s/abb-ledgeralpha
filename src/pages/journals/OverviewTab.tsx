import { useMemo } from "react";
import { Link } from "react-router-dom";
import { KpiTile, Panel, SeverityBadge } from "@/components/vocab";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBars, type BarGroup } from "@/components/review/StatusBars";
import { FlagChips } from "@/components/journals/FlagChips";
import { WORLD } from "@/data";
import { isOpenFlag, useJournals, useProposalDecisions, type JournalRow } from "@/state/journalHooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { JOURNAL_CHECKS, userName } from "@/engine/journalReview";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";

const GROUPS: BarGroup[] = [
  { key: "flagged", label: "Awaiting review", cls: "bg-warn" },
  { key: "support-requested", label: "Support requested", cls: "bg-info" },
  { key: "accepted", label: "Accepted", cls: "bg-ok" },
];

const RANK = { high: 3, medium: 2, low: 1 } as const;

export function OverviewTab() {
  const { rows, flagged, manual } = useJournals();
  const proposals = useProposalDecisions();
  const [, setParams] = useQueryParams();

  const stats = useMemo(() => {
    const open = flagged.filter((r) => r.status === "flagged");
    const support = flagged.filter((r) => r.status === "support-requested");
    const accepted = flagged.filter((r) => r.status === "accepted");
    const manualValue = rows.filter((r) => r.doc.manual).reduce((s, r) => s + r.doc.amount, 0);
    const live = proposals.filter((d) => ["proposed", "approved", "exported", "closed-in-erp"].includes(d.status));
    return {
      open, support, accepted, manualValue,
      proposed: live.length,
      proposedValue: live.reduce((s, d) => s + Math.abs(d.amount), 0),
      awaiting: live.filter((d) => d.status === "proposed").length,
    };
  }, [rows, flagged, proposals]);

  const byCheck = useMemo(() => {
    const data: Record<string, Record<string, number>> = {};
    for (const c of JOURNAL_CHECKS) data[c.id] = {};
    for (const r of flagged) for (const f of r.flags) data[f.checkId][r.status] = (data[f.checkId][r.status] ?? 0) + 1;
    return data;
  }, [flagged]);

  const needs = useMemo(
    () =>
      flagged
        .filter(isOpenFlag)
        .sort((a, b) => RANK[b.severity!] - RANK[a.severity!] || b.doc.amount - a.doc.amount)
        .slice(0, 9),
    [flagged]
  );

  const byPreparer = useMemo(() => {
    const m = new Map<string, { user: string; journals: number; value: number; flagged: number; open: number }>();
    for (const r of rows) {
      if (!r.doc.manual) continue;
      const e = m.get(r.doc.enteredBy) ?? { user: r.doc.enteredBy, journals: 0, value: 0, flagged: 0, open: 0 };
      e.journals += 1;
      e.value += r.doc.amount;
      if (r.flags.length) e.flagged += 1;
      if (isOpenFlag(r)) e.open += 1;
      m.set(r.doc.enteredBy, e);
    }
    return [...m.values()].sort((a, b) => b.value - a.value);
  }, [rows]);

  const toReview = (extra: Record<string, string | null>) => setParams({ tab: "review", ...extra }, { replace: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Journals posted" value={fmtInt(rows.length)} sublabel={`${fmtInt(manual)} entered manually`} onClick={() => setParams({ tab: "register" }, { replace: false })} />
        <KpiTile label="Manual journal value" value={fmtINRCompact(stats.manualValue)} sublabel="total debits" />
        <KpiTile label="Awaiting review" value={fmtInt(stats.open.length)} sublabel={`of ${fmtInt(flagged.length)} flagged`} accent={stats.open.length ? "warn" : "ok"} onClick={() => toReview({ jstatus: "flagged" })} />
        <KpiTile label="Support requested" value={fmtInt(stats.support.length)} sublabel="waiting for the preparer" accent={stats.support.length ? "info" : "none"} onClick={() => toReview({ jstatus: "support-requested" })} />
        <KpiTile label="Accepted" value={`${fmtInt(stats.accepted.length)}/${fmtInt(flagged.length)}`} sublabel="flagged journals concluded" accent="ok" onClick={() => toReview({ jstatus: "accepted" })} />
        <KpiTile label="Entries proposed" value={fmtINRCompact(stats.proposedValue)} sublabel={`${fmtInt(stats.proposed)} entries · ${fmtInt(stats.awaiting)} awaiting approval`} onClick={() => setParams({ tab: "proposed" }, { replace: false })} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Flagged journals by check" className="xl:col-span-2">
          <StatusBars
            data={byCheck}
            rows={JOURNAL_CHECKS.map((c) => ({ key: c.id, label: `${c.id} ${c.name}` }))}
            groups={GROUPS}
            unit="journals"
            labelWidth="17rem"
            onSelect={(check, status) => toReview({ jcheck: check, jstatus: status })}
          />
        </Panel>

        <Panel title="Needs review" bodyClassName="p-0">
          {needs.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No flagged journal is waiting</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {needs.map((r: JournalRow) => (
                <li key={r.doc.key}>
                  <Link to={`/journals/${r.doc.key}`} className="block px-4 py-2.5 hover:bg-accent/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm">{r.doc.text ?? r.doc.docNo}</span>
                      <SeverityBadge severity={r.severity!} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{fmtDate(r.doc.postingDate)} · {userName(r.doc.enteredBy)} · {r.flags.map((f) => f.checkId).join(", ")}</span>
                      <span className="tnum">{fmtINR(r.doc.amount)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Manual journals by preparer" bodyClassName="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Entered by</TableHead>
              <TableHead className="text-right">Journals</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Flagged</TableHead>
              <TableHead className="text-right">Awaiting review</TableHead>
              <TableHead>Checks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byPreparer.map((p) => {
              const person = WORLD.people.find((x) => x.userId === p.user);
              const flags = flagged.filter((r) => r.doc.enteredBy === p.user).flatMap((r) => r.flags);
              const unique = [...new Map(flags.map((f) => [f.checkId, f])).values()];
              return (
                <TableRow key={p.user} className="cursor-pointer" onClick={() => setParams({ tab: "register", jby: p.user }, { replace: false })}>
                  <TableCell className="py-2">
                    <div className="text-sm">{person ? person.name : p.user}</div>
                    <div className="font-mono text-2xs text-muted-foreground">{p.user}</div>
                  </TableCell>
                  <TableCell className="py-2 text-right tnum">{fmtInt(p.journals)}</TableCell>
                  <TableCell className="py-2 text-right tnum">{fmtINRCompact(p.value)}</TableCell>
                  <TableCell className="py-2 text-right tnum">{p.flagged ? fmtInt(p.flagged) : "-"}</TableCell>
                  <TableCell className="py-2 text-right tnum">{p.open ? fmtInt(p.open) : "-"}</TableCell>
                  <TableCell className="py-2">
                    <FlagChips flags={unique} />
                  </TableCell>
                </TableRow>
              );
            })}
            {byPreparer.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No manual journals in the period
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

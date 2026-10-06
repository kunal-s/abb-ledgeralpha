import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocLink } from "@/components/vocab";
import { GL_BY_ID, PERSON_BY_ID } from "@/data";
import { useReview } from "@/state/ReviewContext";
import type { ItemRow } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { APPROVAL_BANDS } from "@/config/policies";
import { EXPORT_COLUMNS, exportRows } from "@/engine/journals";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useItemDrawer } from "@/state/drawer";
import type { ActionKind, Decision } from "@/types";

const ACTIONS: ActionKind[] = ["Clear", "Reclassify", "Write off", "Write back", "Provide", "Retain"];
const FILTERS = [
  { key: "mine", label: "Awaiting me" },
  { key: "open", label: "In progress" },
  { key: "approved", label: "Approved" },
  { key: "exported", label: "Exported" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function nextStep(d: Decision): string {
  if (d.status === "proposed") {
    const next = d.chain[d.approvals.length];
    if (next) return ROLES[next].label;
    return d.taxReviewRequired && !d.taxReview ? "Tax review" : "";
  }
  return "";
}

export function DecisionsTab() {
  const review = useReview();
  const role = useRoleStore((s) => s.role);
  const open = useItemDrawer((s) => s.open);
  const { approveDecisions, taxReview, exportDecisions, markPosted } = useWorkflow.getState();
  const [filter, setFilter] = useState<FilterKey>("mine");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(() => review.rows.filter((r): r is ItemRow & { decision: Decision } => !!r.decision), [review.rows]);
  const live = all.filter((r) => ["proposed", "approved", "exported", "closed-in-erp"].includes(r.decision.status));
  const awaitingMe = (d: Decision) => d.status === "proposed" && (d.chain[d.approvals.length] === role || (d.taxReviewRequired && !d.taxReview && can(role, "tax-review")));

  const rows = useMemo(
    () =>
      all
        .filter((r) => {
          const d = r.decision;
          if (filter === "mine") return awaitingMe(d);
          if (filter === "open") return d.status === "proposed";
          if (filter === "approved") return d.status === "approved";
          if (filter === "exported") return d.status === "exported" || d.status === "closed-in-erp";
          if (filter === "rejected") return d.status === "rejected";
          return true;
        })
        .sort((a, b) => b.decision.proposedAt.localeCompare(a.decision.proposedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, filter, role]
  );

  const matrix = ACTIONS.map((a) => ({
    action: a,
    bands: APPROVAL_BANDS.map((b) => {
      const ds = live.filter((r) => r.decision.action === a && r.decision.approvalBandId === b.id);
      return { id: b.id, count: ds.length, amount: ds.reduce((s, r) => s + Math.abs(r.decision.amount), 0) };
    }),
  }));
  const maxCell = Math.max(1, ...matrix.flatMap((m) => m.bands.map((b) => b.amount)));

  const waiting = new Map<string, number>();
  for (const r of all) {
    const n = nextStep(r.decision);
    if (n) waiting.set(n, (waiting.get(n) ?? 0) + 1);
    if (r.decision.status === "proposed" && r.decision.taxReviewRequired && !r.decision.taxReview && n !== "Tax review") waiting.set("Tax review", (waiting.get("Tax review") ?? 0) + 1);
  }
  const waitingList = [...waiting.entries()].sort((a, b) => b[1] - a[1]);
  const maxWait = Math.max(1, ...waitingList.map(([, n]) => n));

  const chosen = rows.filter((r) => selected.has(r.key)).map((r) => r.decision);
  const approvedAll = all.filter((r) => r.decision.status === "approved").map((r) => r.decision);
  const exportTargets = chosen.filter((d) => d.status === "approved").length ? chosen.filter((d) => d.status === "approved") : approvedAll;
  const exportedIds = [...new Set(all.filter((r) => r.decision.status === "exported" && r.decision.exportBatchId).map((r) => r.decision.exportBatchId!))];

  const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

  const doApprove = () => {
    const r = approveDecisions(chosen.map((d) => d.id));
    if (r.ok) {
      toast(`${r.approved} approved`, { description: r.skipped ? `${r.skipped} not waiting for ${ROLES[role].label}` : undefined, tone: "ok" });
      setSelected(new Set());
    } else toast(r.error, { tone: "danger" });
  };
  const doTax = () => {
    let done = 0;
    for (const d of chosen) if (taxReview(d.id, "cleared").ok) done += 1;
    if (done) {
      toast(`${done} tax reviews cleared`, { tone: "ok" });
      setSelected(new Set());
    } else toast("None of the selected decisions is waiting for tax review", { tone: "danger" });
  };
  const doExport = () => {
    const targets = exportTargets;
    const res = exportDecisions(targets.map((d) => d.id));
    if (!res.ok) return toast(res.error, { tone: "danger" });
    const decisions = targets.map((d) => useWorkflow.getState().decisions[d.id]);
    const rowsOut = exportRows(decisions, res.batchId, review.asOf).map((r) => [r.proposalId, r.companyCode, fmtDate(r.postingDate), r.docType, r.header, r.lineNo, r.gl, r.account, r.side, r.amount, r.profitCentre, r.wbs, r.text, r.source, r.approvals]);
    downloadCsv(`journal-proposals-${res.batchId}.csv`, EXPORT_COLUMNS, rowsOut, "Proposal only - to be reviewed and posted by the company in the ERP. Generated by LedgerAlpha on demo data.");
    toast(`${targets.length} decisions exported`, { description: `${res.batchId} · proposal file downloaded`, tone: "ok" });
    setSelected(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Panel title="Proposed actions by type and approval band" className="xl:col-span-3">
          <div className="grid grid-cols-[7rem_repeat(3,minmax(0,1fr))] gap-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span />
            {APPROVAL_BANDS.map((b) => (
              <span key={b.id} className="text-center">
                Band {b.id}
              </span>
            ))}
          </div>
          <div className="mt-1 space-y-1">
            {matrix.map((m) => (
              <div key={m.action} className="grid grid-cols-[7rem_repeat(3,minmax(0,1fr))] items-stretch gap-1">
                <span className="self-center text-sm">{m.action}</span>
                {m.bands.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-h-[2.1rem] flex-col items-center justify-center rounded-md text-xs tnum"
                    style={b.amount ? { background: `rgba(42, 120, 214, ${0.1 + 0.55 * Math.sqrt(b.amount / maxCell)})`, color: b.amount / maxCell > 0.45 ? "#fff" : undefined } : { background: "hsl(var(--muted))" }}
                  >
                    {b.count ? (
                      <>
                        <span className="font-medium">{fmtINRCompact(b.amount)}</span>
                        <span className="text-2xs opacity-80">{fmtInt(b.count)}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/60">-</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 text-2xs text-muted-foreground">Excludes rejected and withdrawn decisions</div>
        </Panel>

        <Panel title="Waiting on" className="xl:col-span-2">
          {waitingList.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No decisions waiting</div>
          ) : (
            <ul className="space-y-2.5">
              {waitingList.map(([who, n]) => (
                <li key={who}>
                  <div className="flex justify-between text-sm">
                    <span>{who}</span>
                    <span className="tnum">{n}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-sm bg-muted">
                    <div className="h-2 rounded-sm bg-primary" style={{ width: `${(n / maxWait) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Decisions" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("rounded px-2 py-1", filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {f.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{fmtInt(rows.length)} decisions · acting as {ROLES[role].label}</span>
          <div className="flex-1" />
          {chosen.length > 0 && (
            <>
              <Button size="sm" className="h-8" onClick={doApprove}>
                Approve {chosen.length}
              </Button>
              {can(role, "tax-review") && (
                <Button size="sm" variant="outline" className="h-8" onClick={doTax}>
                  Clear tax review
                </Button>
              )}
            </>
          )}
          {exportedIds.length > 0 && can(role, "export") && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => exportedIds.forEach((b) => run(markPosted(b), "Marked as posted (simulation)"))} title="Simulates the next data load closing the exported items">
              Mark exported as posted
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={!can(role, "export") || exportTargets.length === 0} title={can(role, "export") ? "Proposal file; nothing is posted" : `${ROLES[role].label} cannot export journal proposals`} onClick={doExport}>
            <Download className="h-3.5 w-3.5" /> Export{exportTargets.length ? ` ${exportTargets.length}` : ""} journal proposal{exportTargets.length === 1 ? "" : "s"}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 pr-0">
                <input type="checkbox" aria-label="Select all decisions shown" checked={rows.length > 0 && rows.every((r) => selected.has(r.key))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.key)) : new Set())} />
              </TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Band</TableHead>
              <TableHead>Proposed by</TableHead>
              <TableHead>Waiting for</TableHead>
              <TableHead>Tax review</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                  {filter === "mine" ? `Nothing is waiting for ${ROLES[role].label}` : "No decisions"}
                </TableCell>
              </TableRow>
            )}
            {rows.slice(0, 200).map((r) => {
              const d = r.decision;
              return (
                <TableRow key={r.key} className="cursor-pointer" onClick={() => open(r.key)} data-state={selected.has(r.key) ? "selected" : undefined}>
                  <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.item.docNo}`}
                      checked={selected.has(r.key)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(r.key)) n.delete(r.key);
                          else n.add(r.key);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2">
                    <DocLink itemKey={r.key}>{r.item.docNo}</DocLink>
                  </TableCell>
                  <TableCell className="max-w-48 truncate py-2 text-xs">{GL_BY_ID.get(r.item.gl)?.description}</TableCell>
                  <TableCell className="py-2 text-sm">{d.action}</TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(Math.abs(d.amount))}</TableCell>
                  <TableCell className="py-2 font-mono text-xs">{d.approvalBandId}</TableCell>
                  <TableCell className="whitespace-nowrap py-2">
                    <div className="text-sm">{PERSON_BY_ID.get(d.proposedBy)?.name}</div>
                    <div className="text-2xs text-muted-foreground">{fmtDateTime(d.proposedAt)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-sm">{nextStep(d) || <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="py-2">
                    {d.taxReviewRequired ? <StatusChip status={d.taxReview ? d.taxReview.outcome : "in-review"} label={d.taxReview ? undefined : "Pending"} /> : <span className="text-2xs text-muted-foreground">Not required</span>}
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusChip status={r.status} />
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

// A queue of decisions raised by one module: filter by who must act, approve or
// clear tax review in bulk, export approved entries as a proposal file. Shared by
// Reconciliations and Cash Application; the Balance Sheet Review keeps its own
// richer Decisions tab.

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DecisionApproval } from "@/components/review/drawerParts";
import { GL_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { itemStatus } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { EXPORT_COLUMNS, buildProposal, exportRows } from "@/engine/journals";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Decision } from "@/types";

export interface QueueEntry {
  decision: Decision;
  /** where it comes from: the reconciliation, the customer */
  source: string;
  primary: string;
  secondary?: string;
  open: () => void;
}

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
  if (d.status !== "proposed") return "";
  const next = d.chain[d.approvals.length];
  if (next) return ROLES[next].label;
  return d.taxReviewRequired && !d.taxReview ? "Tax review" : "";
}

export function DecisionQueue({ title, sourceLabel, itemLabel, entries }: { title: string; sourceLabel: string; itemLabel: string; entries: QueueEntry[] }) {
  const role = useRoleStore((s) => s.role);
  const { approveDecisions, taxReview, exportDecisions, markPosted } = useWorkflow.getState();
  const [filter, setFilter] = useState<FilterKey>("mine");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  const awaitingMe = (d: Decision) => d.status === "proposed" && (d.chain[d.approvals.length] === role || (d.taxReviewRequired && !d.taxReview && can(role, "tax-review")));
  const rows = useMemo(
    () =>
      entries
        .filter(({ decision: d }) => {
          if (filter === "mine") return awaitingMe(d);
          if (filter === "open") return d.status === "proposed";
          if (filter === "approved") return d.status === "approved";
          if (filter === "exported") return d.status === "exported" || d.status === "closed-in-erp";
          if (filter === "rejected") return d.status === "rejected";
          return true;
        })
        .sort((a, b) => b.decision.proposedAt.localeCompare(a.decision.proposedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, filter, role]
  );

  const chosen = rows.filter((r) => selected.has(r.decision.id)).map((r) => r.decision);
  const approvedAll = entries.filter((r) => r.decision.status === "approved").map((r) => r.decision);
  const exportTargets = chosen.filter((d) => d.status === "approved").length ? chosen.filter((d) => d.status === "approved") : approvedAll;
  const exportedIds = [...new Set(entries.filter((r) => r.decision.status === "exported" && r.decision.exportBatchId).map((r) => r.decision.exportBatchId!))];

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
    const res = exportDecisions(exportTargets.map((d) => d.id));
    if (!res.ok) return toast(res.error, { tone: "danger" });
    const decisions = exportTargets.map((d) => useWorkflow.getState().decisions[d.id]);
    const out = exportRows(decisions, res.batchId, WORLD.asOf).map((r) => [r.proposalId, r.companyCode, fmtDate(r.postingDate), r.docType, r.header, r.lineNo, r.gl, r.account, r.side, r.amount, r.profitCentre, r.wbs, r.text, r.source, r.approvals]);
    downloadCsv(`journal-proposals-${res.batchId}.csv`, EXPORT_COLUMNS, out, "Proposal only - to be reviewed and posted by the company in the ERP. Generated by LedgerAlpha on demo data.");
    toast(`${exportTargets.length} entries exported`, { description: `${res.batchId} · proposal file downloaded`, tone: "ok" });
    setSelected(new Set());
  };

  return (
    <Panel title={title} bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <div className="flex rounded-md border border-border p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={cn("rounded px-2 py-1", filter === f.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{fmtInt(rows.length)} entries · acting as {ROLES[role].label}</span>
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
          <Button size="sm" variant="ghost" className="h-8" onClick={() => exportedIds.forEach((b) => markPosted(b))} title="Simulates the next data load closing the exported items">
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
            <TableHead className="w-6 pr-0" />
            <TableHead className="w-8 pr-0">
              <input type="checkbox" aria-label="Select all entries shown" checked={rows.length > 0 && rows.every((r) => selected.has(r.decision.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.decision.id)) : new Set())} />
            </TableHead>
            <TableHead>{sourceLabel}</TableHead>
            <TableHead>{itemLabel}</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Proposed by</TableHead>
            <TableHead>Waiting for</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-5 text-center text-sm text-muted-foreground">
                {filter === "mine" ? `Nothing is waiting for ${ROLES[role].label}` : "No entries"}
              </TableCell>
            </TableRow>
          )}
          {rows.slice(0, 200).map((e) => {
            const d = e.decision;
            const expanded = openId === d.id;
            const proposal = expanded ? buildProposal(d) : undefined;
            return (
              <Fragment key={d.id}>
                <TableRow className="cursor-pointer" onClick={() => setOpenId(expanded ? null : d.id)} aria-expanded={expanded} data-state={selected.has(d.id) ? "selected" : undefined}>
                  <TableCell className="w-6 pr-0">
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-90")} />
                  </TableCell>
                  <TableCell className="w-8 pr-0" onClick={(ev) => ev.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${e.primary}`}
                      checked={selected.has(d.id)}
                      onChange={() =>
                        setSelected((s) => {
                          const n = new Set(s);
                          if (n.has(d.id)) n.delete(d.id);
                          else n.add(d.id);
                          return n;
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-28 truncate py-2 text-sm">{e.source}</TableCell>
                  <TableCell className="max-w-48 py-2">
                    <div className="truncate text-sm">{e.primary}</div>
                    {e.secondary && <div className="truncate text-2xs text-muted-foreground">{e.secondary}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-right">
                    <div className="tnum text-sm">{fmtINR(Math.abs(d.amount))}</div>
                    <div className="text-2xs text-muted-foreground">band {d.approvalBandId}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2">
                    <div className="text-sm">{PERSON_BY_ID.get(d.proposedBy)?.name}</div>
                    <div className="text-2xs text-muted-foreground">{fmtDateTime(d.proposedAt)}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2">
                    <div className="text-sm">{nextStep(d) || <span className="text-muted-foreground">-</span>}</div>
                    {d.taxReviewRequired && <div className="text-2xs text-muted-foreground">tax review {d.taxReview ? d.taxReview.outcome : "pending"}</div>}
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusChip status={itemStatus(false, d)} />
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <div className="grid grid-cols-1 gap-x-6 bg-muted/30 px-4 py-3 lg:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{proposal?.kind === "CLEARING" ? "Clearing instruction" : "Entry"}</div>
                          {proposal ? (
                            <>
                              <div className="mb-1 text-sm font-medium">{proposal.header}</div>
                              {proposal.lines.length > 0 && (
                                <table className="w-full text-xs">
                                  <tbody>
                                    {proposal.lines.map((l, i) => (
                                      <tr key={i} className="border-b border-border/60 last:border-0">
                                        <td className="w-8 py-1.5 text-muted-foreground">{l.side}</td>
                                        <td className="py-1.5">
                                          <span className="font-mono">{l.gl || "to confirm"}</span> <span className="text-muted-foreground">{l.glDescription}</span>
                                        </td>
                                        <td className="py-1.5 text-right tnum whitespace-nowrap">{fmtDrCr(l.side === "Dr" ? l.amount : -l.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">No entry: this decision does not post.</p>
                          )}
                          <button type="button" onClick={e.open} className="mt-3 text-sm font-medium text-primary hover:underline">
                            Open the item
                          </button>
                        </div>
                        <div className="[&_section]:border-t-0 [&_section]:px-0">
                          <DecisionApproval d={d} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}

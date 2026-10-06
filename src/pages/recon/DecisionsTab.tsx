import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERSON_BY_ID, WORLD } from "@/data";
import { itemStatus } from "@/state/hooks";
import { useRecRows } from "@/state/recHooks";
import { useItemDrawer } from "@/state/drawer";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { EXPORT_COLUMNS, exportRows } from "@/engine/journals";
import { parseRecItemKey } from "@/engine/recs";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Decision } from "@/types";

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

/** Entries proposed from reconciling items: approve, clear tax review, export as a proposal file. */
export function DecisionsTab() {
  const recRows = useRecRows();
  const role = useRoleStore((s) => s.role);
  const open = useItemDrawer((s) => s.open);
  const { approveDecisions, taxReview, exportDecisions, markPosted } = useWorkflow.getState();
  const [filter, setFilter] = useState<FilterKey>("mine");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(() => {
    const out: { d: Decision; recName: string; recId: string; itemId: string; narration: string; label: string }[] = [];
    for (const r of recRows) {
      for (const [itemId, d] of r.decisionByItem) {
        const item = r.view.items.find((i) => i.id === itemId);
        out.push({ d, recName: r.rec.name, recId: r.rec.id, itemId, narration: item?.reference ?? item?.narration ?? itemId, label: item?.cls?.label ?? "" });
      }
    }
    return out;
  }, [recRows]);

  const awaitingMe = (d: Decision) => d.status === "proposed" && (d.chain[d.approvals.length] === role || (d.taxReviewRequired && !d.taxReview && can(role, "tax-review")));
  const rows = useMemo(
    () =>
      all
        .filter(({ d }) => {
          if (filter === "mine") return awaitingMe(d);
          if (filter === "open") return d.status === "proposed";
          if (filter === "approved") return d.status === "approved";
          if (filter === "exported") return d.status === "exported" || d.status === "closed-in-erp";
          if (filter === "rejected") return d.status === "rejected";
          return true;
        })
        .sort((a, b) => b.d.proposedAt.localeCompare(a.d.proposedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, filter, role]
  );

  const chosen = rows.filter((r) => selected.has(r.d.id)).map((r) => r.d);
  const approvedAll = all.filter((r) => r.d.status === "approved").map((r) => r.d);
  const exportTargets = chosen.filter((d) => d.status === "approved").length ? chosen.filter((d) => d.status === "approved") : approvedAll;
  const exportedIds = [...new Set(all.filter((r) => r.d.status === "exported" && r.d.exportBatchId).map((r) => r.d.exportBatchId!))];

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
    <Panel title="Entries proposed from reconciling items" bodyClassName="p-0">
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
          <Download className="h-3.5 w-3.5" /> Export {exportTargets.length || ""} journal proposal{exportTargets.length === 1 ? "" : "s"}
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 pr-0">
              <input type="checkbox" aria-label="Select all entries shown" checked={rows.length > 0 && rows.every((r) => selected.has(r.d.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.d.id)) : new Set())} />
            </TableHead>
            <TableHead>Reconciliation</TableHead>
            <TableHead>Item</TableHead>
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
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                {filter === "mine" ? `Nothing is waiting for ${ROLES[role].label}` : "No entries"}
              </TableCell>
            </TableRow>
          )}
          {rows.slice(0, 200).map(({ d, recName, recId, itemId, narration, label }) => (
            <TableRow key={d.id} className="cursor-pointer" onClick={() => open(`${recId}::${parseRecItemKey(d.itemKey)!.itemId}`)} data-state={selected.has(d.id) ? "selected" : undefined}>
              <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${itemId}`}
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
              <TableCell className="max-w-56 truncate py-2 text-sm">{recName}</TableCell>
              <TableCell className="max-w-64 py-2">
                <div className="truncate text-sm">{narration}</div>
                <div className="truncate text-2xs text-muted-foreground">{label}</div>
              </TableCell>
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
                <StatusChip status={itemStatus(false, d)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

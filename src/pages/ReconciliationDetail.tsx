import { Link, useParams } from "react-router-dom";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddItemDialog } from "@/components/recon/AddItemDialog";
import { ConfirmationPanel } from "@/components/recon/ConfirmationPanel";
import { DifferenceBars } from "@/components/recon/DifferenceBars";
import { RecItemsTable } from "@/components/recon/RecItemsTable";
import { RecSignOffPanel } from "@/components/recon/RecSignOffPanel";
import { GL_BY_ID, PARTY_BY_ID, PERSON_BY_ID } from "@/data";
import { itemStatus } from "@/state/hooks";
import { useRecRow } from "@/state/recHooks";
import { useItemDrawer } from "@/state/drawer";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { RECON_POLICY } from "@/config/policies";
import { adjustmentJournal, recItemKey } from "@/engine/recs";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";

const RULES_VERSION = "reconciliations-1";

export function ReconciliationDetail() {
  const { id } = useParams();
  const row = useRecRow(id);
  const role = useRoleStore((s) => s.role);
  const open = useItemDrawer((s) => s.open);
  const { prepareRec, acceptSuggestions, proposeDecisions, approveDecision } = useWorkflow.getState();

  if (!row) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reconciliation not found" breadcrumbs={[{ label: "Reconciliations", to: "/reconciliations" }, { label: id ?? "" }]} />
        <Card className="p-5 text-sm">
          <Link to="/reconciliations?tab=register" className="font-medium text-primary hover:underline">
            Go to the register
          </Link>
        </Card>
      </div>
    );
  }

  const { rec, view } = row;
  const gl = rec.gl ? GL_BY_ID.get(rec.gl) : undefined;
  const party = rec.partyId ? PARTY_BY_ID.get(rec.partyId) : undefined;
  const locked = !!row.signOff?.preparer;

  const suggestions = view.items.filter((i) => !i.cls && i.suggestedClass);
  const proposable = view.items.filter((i) => i.cls?.treatment === "adjust-books" && (!row.decisionByItem.get(i.id) || row.decisionByItem.get(i.id)!.status === "rejected") && adjustmentJournal(rec, i, i.classId!));
  const decisions = [...row.decisionByItem.entries()].map(([itemId, d]) => ({ itemId, d, item: view.items.find((i) => i.id === itemId) })).sort((a, b) => b.d.proposedAt.localeCompare(a.d.proposedAt));

  const canPropose = can(role, "propose");
  const proposeAll = () => {
    const r = proposeDecisions(
      proposable.map((i) => ({
        itemKey: recItemKey(rec.id, i.id), module: "reconciliations", action: "Adjust books" as const, amount: i.amount, justification: `${i.cls!.label}: ${i.narration}`, hits: [], rulesVersion: RULES_VERSION,
        journal: adjustmentJournal(rec, i, i.classId!)!, taxReviewRequired: i.classId === "tds-not-recognised",
      }))
    );
    if (r.ok) toast(`${r.created} entr${r.created === 1 ? "y" : "ies"} proposed`, { description: r.skipped.length ? `${r.skipped.length} skipped` : "Nothing is posted; approvals follow the delegation bands", tone: "ok" });
    else toast(r.error, { tone: "danger" });
  };

  const detailRows: [string, React.ReactNode][] = [
    ["Type", rec.type],
    ["Source", rec.sourceDetail],
    ["Frequency", rec.frequency],
    ["Risk tier", `${rec.riskTier} risk`],
    ["Due", fmtDate(rec.dueDate)],
    ["Preparer", PERSON_BY_ID.get(rec.preparerId)?.name ?? ""],
    ["Reviewer", PERSON_BY_ID.get(rec.reviewerId)?.name ?? ""],
    ["Tolerance", fmtINR(RECON_POLICY.tolerance[rec.type])],
  ];
  if (rec.matched) detailRows.push(["Matched automatically", `${fmtInt(rec.matched.count)} lines · ${fmtINRCompact(rec.matched.value)}`]);
  if (gl) detailRows.splice(1, 0, ["Account", `${gl.gl} · ${gl.description}`]);
  if (party) detailRows.splice(1, 0, ["Business partner", `${party.name} · ${party.id}`]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={rec.name}
        breadcrumbs={[{ label: "Reconciliations", to: "/reconciliations" }, { label: rec.type, to: `/reconciliations?tab=register&type=${encodeURIComponent(rec.type)}` }, { label: rec.id }]}
        badge={<StatusChip status={row.status} />}
        actions={
          !view.prepared ? (
            <Button
              size="sm"
              disabled={!canPropose}
              title={canPropose ? "The reconciler classifies the items it can" : `${ROLES[role].label} cannot prepare reconciliations`}
              onClick={() => {
                const r = prepareRec(rec.id);
                if (r.ok) toast("Reconciliation prepared", { tone: "ok" });
                else toast(r.error, { tone: "danger" });
              }}
            >
              Prepare with the reconciler
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label={rec.booksLabel} value={fmtDrCr(rec.booksBalance, true)} sublabel={fmtDrCr(rec.booksBalance)} />
        <KpiTile label={rec.sourceLabel} value={view.sourceBalance === null ? "Awaiting" : fmtDrCr(view.sourceBalance, true)} sublabel={view.sourceBalance === null ? "no balance from the counterparty yet" : fmtDrCr(view.sourceBalance)} />
        <KpiTile label="Difference" value={view.difference === null ? "-" : view.difference === 0 ? "Nil" : fmtDrCr(view.difference, true)} sublabel={`${fmtInt(view.items.length)} reconciling item${view.items.length === 1 ? "" : "s"}`} />
        <KpiTile
          label="Unexplained"
          value={view.unexplained === null ? "-" : view.unexplained === 0 ? "Nil" : fmtDrCr(view.unexplained, true)}
          sublabel={`tolerance ${fmtINR(RECON_POLICY.tolerance[rec.type])}`}
          accent={view.unexplained === null ? "none" : view.withinTolerance ? "ok" : "danger"}
        />
        <KpiTile
          label="Items needing action"
          value={fmtInt(view.items.filter((i) => i.cls && ["adjust-books", "adjust-source", "dispute", "investigate"].includes(i.cls.treatment)).length)}
          sublabel={row.undocumented ? `${row.undocumented} without a decision or follow-up` : view.agedItems ? `${view.agedItems} aged over ${RECON_POLICY.agedItemDays} days` : "all documented"}
          accent={row.undocumented ? "warn" : "none"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title="Difference explained" className="xl:col-span-2">
          <DifferenceBars view={view} />
        </Panel>
        <div className="space-y-3">
          {rec.confirmation && <ConfirmationPanel row={row} />}
          <Panel title="Reconciliation" bodyClassName="p-0">
            <Fields rows={detailRows} compact />
          </Panel>
        </div>
      </div>

      <Panel
        title="Reconciling items"
        bodyClassName="p-0"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={suggestions.length === 0 || !canPropose || locked}
              title={suggestions.length === 0 ? "Every item with a suggestion is already classified" : canPropose ? undefined : `${ROLES[role].label} cannot classify items`}
              onClick={() => {
                const r = acceptSuggestions(rec.id);
                if (r.ok) toast(`${r.count} suggested class${r.count === 1 ? "" : "es"} accepted`, { tone: "ok" });
                else toast(r.error, { tone: "danger" });
              }}
            >
              Accept suggestions{suggestions.length ? ` (${suggestions.length})` : ""}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={proposable.length === 0 || !canPropose || locked}
              title={proposable.length === 0 ? "No classified item needs an entry that has not been proposed" : canPropose ? "Proposal only; nothing is posted" : `${ROLES[role].label} cannot propose decisions`}
              onClick={proposeAll}
            >
              Propose entries{proposable.length ? ` (${proposable.length})` : ""}
            </Button>
            <AddItemDialog row={row} />
          </>
        }
      >
        <RecItemsTable row={row} empty={view.sourceBalance === null ? "Waiting for the counterparty's balance" : view.difference === 0 ? "The balances agree; there are no reconciling items" : "No reconciling items yet"} />
      </Panel>

      {decisions.length > 0 && (
        <Panel title="Decisions" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Band</TableHead>
                <TableHead>Proposed by</TableHead>
                <TableHead>Waiting for</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {decisions.map(({ itemId, d, item }) => {
                const next = d.chain[d.approvals.length];
                const mine = d.status === "proposed" && role === next;
                return (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => open(recItemKey(rec.id, itemId))}>
                    <TableCell className="max-w-64 py-2">
                      <div className="truncate text-sm">{item?.reference ?? item?.narration ?? itemId}</div>
                      <div className="truncate text-2xs text-muted-foreground">{item?.cls?.label}</div>
                    </TableCell>
                    <TableCell className="py-2 text-sm">{d.action}</TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(Math.abs(d.amount))}</TableCell>
                    <TableCell className="py-2 font-mono text-xs">{d.approvalBandId}</TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-sm">{PERSON_BY_ID.get(d.proposedBy)?.name}</TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-sm">{d.status === "proposed" ? (next ? ROLES[next].label : d.taxReviewRequired && !d.taxReview ? "Tax review" : "") : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="py-2">
                      <StatusChip status={itemStatus(false, d)} />
                    </TableCell>
                    <TableCell className="py-2 text-right" onClick={(e) => e.stopPropagation()}>
                      {mine && (
                        <Button
                          size="sm"
                          className="h-7"
                          onClick={() => {
                            const r = approveDecision(d.id);
                            if (r.ok) toast("Approved", { tone: "ok" });
                            else toast(r.error, { tone: "danger" });
                          }}
                        >
                          Approve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
      )}

      <RecSignOffPanel key={`${rec.id}-${row.status}`} row={row} />
    </div>
  );
}

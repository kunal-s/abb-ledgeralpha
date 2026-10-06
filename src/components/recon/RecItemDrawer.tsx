// The drawer body for a reconciling item: its facts, classification, the next
// step its class calls for (an entry in the books, a follow-up, or nothing),
// the decision and the item's history. Opened with the same drawer as ledger
// lines, through the item key `${reconciliationId}::${itemId}`.

import { useState } from "react";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfidenceChip, DocLink, MethodBadge, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { DecisionApproval, FollowUpBody, History, Section } from "@/components/review/drawerParts";
import { GL_BY_ID, LINE_BY_KEY, PARTY_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { itemStatus } from "@/state/hooks";
import { useRecRow, type RecRow } from "@/state/recHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { MATERIALITY_POLICY, RECON_POLICY, bandFor } from "@/config/policies";
import { RECON_CLASSES, TREATMENT_LABELS } from "@/engine/recClasses";
import { adjustmentJournal, draftRecFollowUp, needsAction, recItemKey, type EffItem } from "@/engine/recs";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINR } from "@/lib/format";
import { toast } from "@/lib/toast";

const MODULE = "reconciliations";
const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

function Classification({ row, item, locked }: { row: RecRow; item: EffItem; locked: boolean }) {
  const role = useRoleStore((s) => s.role);
  const { classifyRecItem } = useWorkflow.getState();
  const classes = RECON_CLASSES[row.rec.type];
  const suggested = classes.find((c) => c.id === item.suggestedClass);
  const editable = !locked && can(role, "propose");
  return (
    <Section title="Classification" aside={suggested ? <MethodBadge method="judgement" showConfidence={false} /> : undefined}>
      <Select value={item.classId} onValueChange={(v) => run(classifyRecItem(row.rec.id, item.id, v), "Item classified")} disabled={!editable}>
        <SelectTrigger className="h-8">
          <SelectValue placeholder="Choose a class" />
        </SelectTrigger>
        <SelectContent>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {item.cls ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="mr-1.5 rounded bg-secondary px-1.5 py-0.5 text-2xs font-medium text-foreground">{TREATMENT_LABELS[item.cls.treatment]}</span>
          {item.cls.hint}
        </p>
      ) : (
        <p className="mt-2 text-xs text-warn-foreground">Not classified. An unclassified item blocks sign-off.</p>
      )}
      {suggested && item.classId !== suggested.id && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
          <div className="min-w-0 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Reconciler suggests</span>
              <span className="font-medium">{suggested.label}</span>
              {item.confidence !== undefined && <ConfidenceChip score={item.confidence} showIcon={false} />}
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={!editable} onClick={() => run(classifyRecItem(row.rec.id, item.id, suggested.id), "Suggestion accepted")}>
            Accept
          </Button>
        </div>
      )}
    </Section>
  );
}

function AdjustBooks({ row, item }: { row: RecRow; item: EffItem }) {
  const role = useRoleStore((s) => s.role);
  const { proposeDecision } = useWorkflow.getState();
  const decision = row.decisionByItem.get(item.id);
  const [justification, setJustification] = useState(`${item.cls!.label}: ${item.narration}`);
  const journal = adjustmentJournal(row.rec, item, item.classId!);
  const amount = Math.abs(item.amount);
  const needsJustification = amount >= MATERIALITY_POLICY.documentedActionAmount;
  const live = decision && decision.status !== "rejected";

  if (live) {
    return (
      <Section title="Decision" aside={<StatusChip status={itemStatus(false, decision)} />}>
        <DecisionApproval d={decision} />
      </Section>
    );
  }
  if (!journal) return null;

  return (
    <Section title="Entry in the books">
      {decision?.status === "rejected" && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger-foreground">
          Entry rejected{decision.rejection ? ` by ${PERSON_BY_ID.get(decision.rejection.personId)?.name}: ${decision.rejection.reason}` : ""}
        </div>
      )}
      <div className="rounded-md border border-border bg-background">
        <div className="border-b border-border px-3 py-1.5 text-xs font-medium">{journal.header}</div>
        <table className="w-full text-xs">
          <tbody>
            {journal.lines.map((l, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                <td className="w-8 px-3 py-1.5 text-muted-foreground">{l.side}</td>
                <td className="px-1 py-1.5">
                  <div className="font-mono">{l.gl || "Account to be confirmed"}</div>
                  <div className="text-2xs text-muted-foreground">{l.gl ? GL_BY_ID.get(l.gl)?.description : "Chosen by the preparer before posting"}</div>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tnum">{fmtINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid grid-cols-[8rem_1fr] items-start gap-2">
        <span className="pt-2 text-xs text-muted-foreground">Justification{needsJustification ? " *" : ""}</span>
        <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} placeholder={needsJustification ? `Required from ${fmtINR(MATERIALITY_POLICY.documentedActionAmount)}` : "Optional"} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-2xs text-muted-foreground">
          {fmtINR(amount)} · band {bandFor(amount).id}
          {item.classId === "tds-not-recognised" ? " · tax review required" : ""}
        </span>
        <Button
          size="sm"
          disabled={!can(role, "propose")}
          title={can(role, "propose") ? "Proposal only; nothing is posted" : `${ROLES[role].label} cannot propose decisions`}
          onClick={() =>
            run(
              proposeDecision({
                itemKey: recItemKey(row.rec.id, item.id), module: MODULE, action: "Adjust books", amount: item.amount, justification, hits: [], rulesVersion: "reconciliations-1",
                journal, taxReviewRequired: item.classId === "tds-not-recognised",
              }),
              "Entry proposed"
            )
          }
        >
          Propose entry
        </Button>
      </div>
    </Section>
  );
}

function ItemFollowUp({ row, item }: { row: RecRow; item: EffItem }) {
  const followUp = row.followUpByItem.get(item.id);
  return (
    <Section
      title="Follow-up"
      aside={followUp ? <StatusChip status={followUp.status === "open" ? "in-follow-up" : followUp.status === "responded" ? "approved" : "not-started"} label={followUp.status === "open" ? "Open" : followUp.status === "responded" ? "Responded" : "Closed"} /> : undefined}
    >
      <FollowUpBody
        key={`${followUp?.id ?? "none"}-${followUp?.status ?? ""}`}
        itemKey={recItemKey(row.rec.id, item.id)}
        module={MODULE}
        draft={draftRecFollowUp(row.rec, item, item.classId)}
        followUp={followUp}
        asOf={WORLD.asOf}
      />
    </Section>
  );
}

function Related({ row, item }: { row: RecRow; item: EffItem }) {
  const line = item.lineKey ? LINE_BY_KEY.get(item.lineKey) : undefined;
  const party = row.rec.partyId ? PARTY_BY_ID.get(row.rec.partyId) : line?.partner ? PARTY_BY_ID.get(line.partner.id) : undefined;
  const rows: [string, React.ReactNode][] = [];
  if (line) rows.push(["Ledger document", <DocLink key="d" itemKey={line.key}>{line.docNo}</DocLink>]);
  if (line) rows.push(["Posted", `${fmtDate(line.postingDate)} · ${line.docType} · ${line.sourceSystem}${line.manual ? " · manual entry" : ""}`]);
  if (party) rows.push(["Business partner", `${party.name} · ${party.type}`]);
  rows.push(["Reconciliation", `${row.rec.name} · ${row.rec.type}`]);
  return (
    <Section title="Related records">
      <Fields rows={rows} />
    </Section>
  );
}

export function RecItemBody({ recId, itemId }: { recId: string; itemId: string }) {
  const row = useRecRow(recId);
  const item = row?.view.items.find((i) => i.id === itemId);
  if (!row || !item) return <div className="p-5 text-sm text-muted-foreground">Item not found</div>;

  const key = recItemKey(recId, itemId);
  const decision = row.decisionByItem.get(itemId);
  const followUp = row.followUpByItem.get(itemId);
  const locked = !!row.signOff?.preparer;
  const action = needsAction(item);
  const status = itemStatus(action && !row.documented.has(itemId), decision, followUp);
  const treatment = item.cls?.treatment;
  const aged = !!item.cls && treatment !== "classification" && item.ageDays > RECON_POLICY.agedItemDays;

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-4 pt-5 pr-12">
        <SheetTitle className="flex items-baseline gap-2 text-base font-semibold">
          <span className="font-mono">{item.reference ?? `Item ${item.id}`}</span>
          <span className="text-xs font-normal text-muted-foreground">{item.id}</span>
        </SheetTitle>
        <SheetDescription className="mt-0.5 text-xs text-muted-foreground">
          {row.rec.name} · {row.rec.type}
        </SheetDescription>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="tnum text-2xl font-semibold tracking-tight">{fmtDrCr(item.amount)}</div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <StatusChip status={status} label={status === "flagged" ? "Needs action" : status === "within-policy" ? (item.cls ? "No action needed" : "Not classified") : undefined} />
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium">{item.side === "books" ? "In the books, not the source" : "In the source, not the books"}</span>
            <span className={aged ? "rounded-md bg-warn-subtle px-1.5 py-0.5 text-2xs font-medium text-warn-foreground" : "rounded-md bg-secondary px-1.5 py-0.5 text-2xs font-medium"}>
              {item.ageDays} days{aged ? ", aged" : ""}
            </span>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Dated {fmtDate(item.date)} · “{item.narration}”
          {item.origin === "agent" ? " · found by the reconciler" : item.origin === "person" ? " · added by a person" : ""}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <Classification row={row} item={item} locked={locked} />
        {treatment === "adjust-books" && <AdjustBooks key={`a-${key}-${decision?.id ?? "none"}-${decision?.status ?? ""}-${item.classId}`} row={row} item={item} />}
        {(treatment === "adjust-source" || treatment === "dispute" || treatment === "investigate") && <ItemFollowUp row={row} item={item} />}
        {(treatment === "timing" || treatment === "classification") && (
          <Section title="Next step">
            <p className="text-sm text-muted-foreground">
              {treatment === "timing"
                ? `No entry is needed. The item should clear with the next statement or run; it is flagged as aged after ${RECON_POLICY.agedItemDays} days.`
                : "No entry or follow-up is needed. The balances differ only in presentation."}
            </p>
          </Section>
        )}
        <Related row={row} item={item} />
        <History itemKey={key} />
      </div>
    </div>
  );
}

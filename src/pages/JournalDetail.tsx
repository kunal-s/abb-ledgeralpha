import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DocLink, KpiTile, MethodBadge, PageHeader, Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Fields } from "@/components/vocab/Fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FollowUpBody } from "@/components/review/drawerParts";
import { GL_BY_ID, PC_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { useJournalRow } from "@/state/journalHooks";
import { useItemHistory } from "@/state/hooks";
import { personForRole, useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { JOURNAL_CHECKS, draftJournalFollowUp, userName } from "@/engine/journalReview";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { toast } from "@/lib/toast";

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

export function JournalDetail() {
  const { id } = useParams();
  const row = useJournalRow(id);
  const role = useRoleStore((s) => s.role);
  const { reviewJournal, reopenJournalReview } = useWorkflow.getState();
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const history = useItemHistory(id);

  if (!row) {
    return (
      <div className="space-y-4">
        <PageHeader title="Journal not found" breadcrumbs={[{ label: "Journals", to: "/journals" }, { label: id ?? "" }]} />
        <Card className="p-5 text-sm">
          <Link to="/journals?tab=register" className="font-medium text-primary hover:underline">
            Go to the journal register
          </Link>
        </Card>
      </div>
    );
  }

  const { doc, flags, review, followUp, status } = row;
  const preparer = WORLD.people.find((p) => p.userId === doc.enteredBy);
  const reviewer = personForRole(role);
  const mayReview = can(role, "sign-reviewer");
  const selfEntered = reviewer.userId === doc.enteredBy;
  const concluded = review?.outcome === "accepted";
  const needsReview = doc.manual && flags.length > 0 && !concluded;
  const draft = draftJournalFollowUp(doc, flags, preparer?.name ?? doc.enteredBy);
  const blocked = !mayReview ? `${ROLES[role].label} cannot conclude a journal review` : selfEntered ? "The reviewer must be a different person from the one who entered the journal" : undefined;
  const reviewerOf = review ? PERSON_BY_ID.get(review.personId)?.name : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Journal ${doc.docNo}`}
        breadcrumbs={[{ label: "Journals", to: "/journals" }, { label: "Review", to: "/journals?tab=review" }, { label: doc.docNo }]}
        badge={<StatusChip status={status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Amount" value={fmtINR(doc.amount)} sublabel={`${doc.lines.length} lines · total debits`} />
        <KpiTile label="Posting date" value={fmtDate(doc.postingDate)} sublabel={`document type ${doc.docType}`} />
        <KpiTile label="Entered" value={preparer?.name.split(" ")[0] ?? doc.enteredBy} sublabel={`${fmtDate(doc.entryDate)}${doc.entryTime ? `, ${fmtTime(doc.entryTime)}` : ""}`} accent={flags.some((f) => f.checkId === "JNL-02") ? "warn" : "none"} />
        <KpiTile label="Checks flagged" value={flags.length} sublabel={flags.length ? flags.map((f) => f.checkId).join(", ") : "none"} accent={flags.length ? "warn" : "ok"} />
        <KpiTile label="Source" value={doc.manual ? "Manual" : "System"} sublabel={doc.sourceSystem} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          {flags.length > 0 && (
            <Panel title="Why it was flagged" bodyClassName="p-0" actions={<MethodBadge method="deterministic" />}>
              <ul className="divide-y divide-border/70">
                {flags.map((f) => {
                  const check = JOURNAL_CHECKS.find((c) => c.id === f.checkId)!;
                  return (
                    <li key={f.checkId} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-2xs">{f.checkId}</span>
                        <span className="text-sm font-medium">{check.name}</span>
                        <SeverityBadge severity={check.severity} />
                      </div>
                      <p className="mt-1.5 text-sm">{f.reason}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{check.logic}</p>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">A flag is a reason to look, not a finding.</div>
            </Panel>
          )}

          <Panel title="Entry" bodyClassName="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 whitespace-nowrap">Line</TableHead>
                  <TableHead className="w-16 whitespace-nowrap">Dr / Cr</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead>Profit centre</TableHead>
                  <TableHead>Assignment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {doc.lines.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell className="py-2">
                      <DocLink itemKey={l.key}>{l.lineItem}</DocLink>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">{l.amount >= 0 ? "Dr" : "Cr"}</TableCell>
                    <TableCell className="max-w-56 py-2">
                      <div className="font-mono text-xs">{l.gl}</div>
                      <div className="truncate text-xs text-muted-foreground">{GL_BY_ID.get(l.gl)?.description}</div>
                    </TableCell>
                    <TableCell className="max-w-48 truncate py-2 text-xs">{l.text ?? "-"}</TableCell>
                    <TableCell className="max-w-40 truncate py-2 text-xs">{PC_BY_ID.get(l.profitCentre)?.name ?? l.profitCentre}</TableCell>
                    <TableCell className="max-w-32 truncate py-2 font-mono text-2xs">{l.assignment ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(Math.abs(l.amount))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="Review" bodyClassName="space-y-3">
            {!doc.manual && <p className="text-sm text-muted-foreground">Posted by the system from a source document. The journal reviewer checks manual journals.</p>}
            {doc.manual && flags.length === 0 && <p className="text-sm text-muted-foreground">No check flagged this journal; no review is needed.</p>}

            {review && (
              <div className={`rounded-md border px-3 py-2 text-sm ${concluded ? "border-ok/30 bg-ok-subtle text-ok-foreground" : "border-warn/30 bg-warn-subtle text-warn-foreground"}`}>
                <div className="text-2xs">
                  {concluded ? "Accepted" : "Support requested"} by {reviewerOf}, {fmtDateTime(review.at)}
                </div>
                {review.note}
              </div>
            )}

            {needsReview && (
              <>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={status === "support-requested" ? "Why the support received is enough" : "What was checked, or what support is needed"} className="min-h-[4.5rem]" />
                {blocked && <p className="text-2xs text-muted-foreground">{blocked}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={!!blocked}
                    onClick={() => {
                      const r = reviewJournal(doc.key, "accepted", note);
                      run(r, "Journal accepted");
                      if (r.ok) setNote("");
                    }}
                  >
                    Accept journal
                  </Button>
                  {status === "flagged" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!blocked}
                      onClick={() => {
                        const r = reviewJournal(doc.key, "support-requested", note);
                        run(r, "Support requested from the preparer");
                        if (r.ok) setNote("");
                      }}
                    >
                      Request support
                    </Button>
                  )}
                </div>
              </>
            )}

            {review && mayReview && (
              <div className="flex items-center gap-2 border-t border-border/70 pt-3">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to reopen the review" className="h-8" />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const r = reopenJournalReview(doc.key, reason);
                    run(r, "Review reopened");
                    if (r.ok) setReason("");
                  }}
                >
                  Reopen
                </Button>
              </div>
            )}
          </Panel>

          {followUp && (
            <Panel title="Support from the preparer">
              <FollowUpBody key={`${followUp.id}-${followUp.status}`} itemKey={doc.key} module="journals" draft={draft} followUp={followUp} asOf={WORLD.asOf} />
            </Panel>
          )}

          <Panel title="Entered by" bodyClassName="p-0">
            <Fields
              compact
              rows={[
                ["Person", preparer ? preparer.name : userName(doc.enteredBy)],
                ["Role", preparer?.title ?? "Not on the roster"],
                ["Ledger user", <span key="u" className="font-mono text-xs">{doc.enteredBy}</span>],
                ["Entered", `${fmtDate(doc.entryDate)}${doc.entryTime ? `, ${fmtTime(doc.entryTime)}` : ""}`],
                ["Posted", fmtDate(doc.postingDate)],
                ["Document", `${doc.docNo}, ${doc.fiscalYear}`],
              ]}
            />
          </Panel>

          {history.length > 0 && (
            <Panel title="Activity">
              <ol className="space-y-2">
                {history.slice(0, 8).map((e) => (
                  <li key={e.id} className="text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="tnum text-muted-foreground">{fmtDateTime(e.at)}</span>
                      <span className="font-medium">{e.action}</span>
                    </div>
                    {(e.before || e.after) && <div className="text-muted-foreground">{e.before ? `${e.before} → ` : ""}{e.after}</div>}
                    {e.reason && <div className="text-muted-foreground">“{e.reason}”</div>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

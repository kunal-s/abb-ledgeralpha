// Parts shared by the item drawers (ledger lines and reconciling items): the
// section frame, the approval chain with its actions, and the item's history.

import { useState } from "react";
import { Check, CircleDashed, Clock, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Fields } from "@/components/vocab/Fields";
import { PERSON_BY_ID } from "@/data";
import { useItemHistory } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { addDays, fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { Decision, FollowUp } from "@/types";

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

/** A decision in flight or done: its facts, the approval chain, and the actions the acting role may take. */
export function DecisionApproval({ d }: { d: Decision }) {
  const role = useRoleStore((s) => s.role);
  const { approveDecision, rejectDecision, taxReview, withdrawDecision } = useWorkflow.getState();
  const [note, setNote] = useState("");

  const next = d.chain[d.approvals.length];
  const taxPending = d.taxReviewRequired && !d.taxReview;
  const canApprove = d.status === "proposed" && role === next;
  const canTax = d.status === "proposed" && taxPending && can(role, "tax-review");
  const proposerRole = PERSON_BY_ID.get(d.proposedBy)?.roleId;
  const canWithdraw = d.status === "proposed" && role === proposerRole;
  const waiting = d.status === "proposed" ? (next ? `Waiting for ${ROLES[next].label}` : taxPending ? "Waiting for tax review" : "") : "";

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">{d.action}</span>
        <span className="tnum text-sm">{fmtINR(Math.abs(d.amount))}</span>
        <span className="text-2xs text-muted-foreground">
          {d.id} · band {d.approvalBandId} · proposed by {PERSON_BY_ID.get(d.proposedBy)?.name}, {fmtDateTime(d.proposedAt)}
        </span>
      </div>
      {d.justification && <p className="mt-1 text-sm text-muted-foreground">{d.justification}</p>}

      <ol className="mt-3 space-y-1.5">
        {d.chain.map((r, i) => {
          const a = d.approvals[i];
          const current = !a && i === d.approvals.length && d.status === "proposed";
          return (
            <li key={r} className="flex items-center gap-2 text-xs">
              {a ? <Check className="h-3.5 w-3.5 text-ok" /> : current ? <Clock className="h-3.5 w-3.5 text-warn" /> : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground/50" />}
              <span className={cn("flex-1", !a && !current && "text-muted-foreground")}>
                {ROLES[r].label}
                {a && <span className="text-muted-foreground"> · {PERSON_BY_ID.get(a.personId)?.name}, {fmtDateTime(a.at)}</span>}
              </span>
            </li>
          );
        })}
        {d.taxReviewRequired && (
          <li className="flex items-center gap-2 text-xs">
            {d.taxReview?.outcome === "cleared" ? <Check className="h-3.5 w-3.5 text-ok" /> : d.taxReview ? <X className="h-3.5 w-3.5 text-danger" /> : <Clock className="h-3.5 w-3.5 text-warn" />}
            <span className="flex-1">
              Tax review
              {d.taxReview && <span className="text-muted-foreground"> · {d.taxReview.outcome} by {PERSON_BY_ID.get(d.taxReview.personId)?.name}, {fmtDateTime(d.taxReview.at)}</span>}
            </span>
          </li>
        )}
      </ol>

      {d.status === "proposed" && (
        <div className="mt-3 space-y-2">
          {waiting && <div className="text-xs text-muted-foreground">{waiting}. You are acting as {ROLES[role].label}.</div>}
          {(canApprove || canTax) && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to reject or object)" className="h-8" />}
          <div className="flex flex-wrap gap-2">
            {canApprove && (
              <>
                <Button size="sm" onClick={() => run(approveDecision(d.id, note || undefined), "Approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => run(rejectDecision(d.id, note), "Rejected")}>
                  Reject
                </Button>
              </>
            )}
            {canTax && (
              <>
                <Button size="sm" onClick={() => run(taxReview(d.id, "cleared", note || undefined), "Tax review cleared")}>
                  Clear tax review
                </Button>
                <Button size="sm" variant="outline" onClick={() => run(taxReview(d.id, "objected", note), "Tax review objected")}>
                  Object
                </Button>
              </>
            )}
            {canWithdraw && (
              <Button size="sm" variant="ghost" onClick={() => run(withdrawDecision(d.id), "Withdrawn")}>
                Withdraw
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Request, answer and close a follow-up on an item. Nothing is sent from the prototype; the request is recorded. */
export function FollowUpBody({ itemKey, module, draft, followUp, asOf }: { itemKey: string; module: string; draft: { owner: string; message: string }; followUp?: FollowUp; asOf: string }) {
  const role = useRoleStore((s) => s.role);
  const { requestFollowUp, respondFollowUp, closeFollowUp } = useWorkflow.getState();
  const [owner, setOwner] = useState(draft.owner);
  const [message, setMessage] = useState(draft.message);
  const [due, setDue] = useState(addDays(asOf, 20));
  const [response, setResponse] = useState("");
  const fu = followUp;
  const active = fu && fu.status !== "closed";

  if (active) {
    return (
      <div className="space-y-2">
        <Fields rows={[["Asked", fu.owner], ["Due", fmtDate(fu.dueDate)], ["Requested by", `${PERSON_BY_ID.get(fu.createdBy)?.name}, ${fmtDateTime(fu.createdAt)}`]]} />
        <p className="rounded-md bg-background p-3 text-sm">{fu.message}</p>
        {fu.response && (
          <div className="rounded-md border border-ok/30 bg-ok-subtle p-3 text-sm text-ok-foreground">
            <div className="text-2xs">{PERSON_BY_ID.get(fu.response.by)?.name} · {fmtDateTime(fu.response.at)}</div>
            {fu.response.text}
          </div>
        )}
        {fu.status === "open" && <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Response received" className="min-h-[3.5rem]" />}
        <div className="flex gap-2">
          {fu.status === "open" && (
            <Button size="sm" onClick={() => { const r = respondFollowUp(fu.id, response); run(r, "Response recorded"); if (r.ok) setResponse(""); }}>
              Record response
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => run(closeFollowUp(fu.id), "Follow-up closed")}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fu?.status === "closed" && <div className="text-xs text-muted-foreground">Previous follow-up closed.</div>}
      <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
        <span className="text-xs text-muted-foreground">Ask</span>
        <Input value={owner} onChange={(e) => setOwner(e.target.value)} className="h-8" />
        <span className="text-xs text-muted-foreground">Due</span>
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 w-40" />
      </div>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[6rem]" />
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          onClick={() => {
            navigator.clipboard?.writeText(message).then(() => toast("Message copied", { tone: "ok" }), () => toast("Copy not available", { tone: "warn" }));
          }}
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </Button>
        <Button
          size="sm"
          disabled={!can(role, "follow-up")}
          title={can(role, "follow-up") ? "Records the follow-up; nothing is sent from the prototype" : `${ROLES[role].label} cannot request follow-ups`}
          onClick={() => run(requestFollowUp({ itemKey, module, owner, dueDate: due, message }), "Follow-up requested")}
        >
          Request follow-up
        </Button>
      </div>
    </div>
  );
}

/** Activity that concerns an item, newest first. */
export function History({ itemKey }: { itemKey: string }) {
  const events = useItemHistory(itemKey);
  return (
    <Section title="History">
      {events.length === 0 ? (
        <div className="text-xs text-muted-foreground">No activity on this item yet</div>
      ) : (
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="text-xs">
              <div className="flex items-baseline gap-2">
                <span className="tnum text-muted-foreground">{fmtDateTime(e.at)}</span>
                <span className="font-medium">{e.action}</span>
                <span className="text-muted-foreground">{e.actorKind === "Person" ? PERSON_BY_ID.get(e.actorId)?.name : e.actorKind === "Agent" ? "Agent" : "System"}</span>
              </div>
              {(e.before || e.after) && <div className="text-muted-foreground">{e.before ? `${e.before} → ` : ""}{e.after}</div>}
              {e.reason && <div className="text-muted-foreground">“{e.reason}”</div>}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

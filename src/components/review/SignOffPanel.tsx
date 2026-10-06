import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel, StatusChip } from "@/components/vocab";
import { PERSON_BY_ID } from "@/data";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { MATERIALITY_POLICY } from "@/config/policies";
import { draftCommentary, type CommentaryFacts } from "@/engine/commentary";
import { fmtDateTime } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { followUpRows } from "@/components/review/bulk";
import type { AccountRow, ItemRow, Review } from "@/state/hooks";
import type { ActionKind } from "@/types";

interface SignOffPanelProps {
  acct: AccountRow;
  review: Review;
  rows: ItemRow[];
}

function Step({ done, label, detail }: { done: boolean; label: string; detail?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {done ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" />}
      <div className="min-w-0">
        <div className={cn(!done && "text-muted-foreground")}>{label}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
    </li>
  );
}

/** Commentary, readiness and sign-off for one account (FRD §4.4, FR-BSR-03/04). */
export function SignOffPanel({ acct, review, rows }: SignOffPanelProps) {
  const role = useRoleStore((s) => s.role);
  const { setCommentary, signOff, reopen } = useWorkflow.getState();
  const gl = acct.summary.gl;
  const so = acct.signOff;
  const locked = !!so?.preparer;

  const facts = useMemo<CommentaryFacts>(() => {
    const flagged = rows.filter((r) => r.flagged);
    const byAction: CommentaryFacts["byAction"] = {};
    for (const r of flagged) {
      if (!r.rec) continue;
      const a = (byAction[r.rec.action as ActionKind] ??= { count: 0, value: 0 });
      a.count += 1;
      a.value += Math.abs(r.item.amount);
    }
    const count = (s: string[]) => rows.filter((r) => r.decision && s.includes(r.decision.status)).length;
    const largest = [...flagged].sort((a, b) => Math.abs(b.item.amount) - Math.abs(a.item.amount))[0];
    return {
      gl,
      asOf: review.asOf,
      closing: acct.summary.closing,
      prior: acct.summary.prior,
      priorDate: review.priorDate,
      openItemManaged: gl.openItemManaged,
      overCount: acct.summary.overCount,
      overAmount: acct.summary.overAmount,
      flaggedCount: flagged.length,
      byAction,
      decisions: { proposed: count(["proposed"]), approved: count(["approved"]), exported: count(["exported", "closed-in-erp"]) },
      openFollowUps: rows.filter((r) => r.followUp?.status === "open").length,
      largest: largest ? { docNo: largest.item.docNo, amount: largest.item.amount, reason: largest.rec?.rationale.split(". ")[0] ?? largest.hits[0]?.reason ?? "" } : undefined,
    };
  }, [rows, acct, gl, review.asOf, review.priorDate]);
  const draft = useMemo(() => draftCommentary(facts), [facts]);

  const [text, setText] = useState(so?.commentary ?? "");
  const [reason, setReason] = useState("");
  useEffect(() => setText(so?.commentary ?? ""), [so?.commentary]);

  const rd = acct.readiness;
  const saved = !!so?.commentary?.trim();
  const dirty = text.trim() !== (so?.commentary ?? "");
  const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

  return (
    <Panel title="Commentary and sign-off" actions={<StatusChip status={acct.status} />} bodyClassName="p-0">
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
        <div className="space-y-2 border-b border-border p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commentary</span>
            {so?.commentaryEdited && <span className="text-2xs text-muted-foreground">Edited by owner</span>}
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={locked} placeholder="Draft the commentary from the account's facts, then edit it" className="min-h-[9rem]" />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={locked || !can(role, "sign-preparer")} onClick={() => setText(draft)} title="Template over this account's current facts">
              <Wand2 className="h-3.5 w-3.5" /> Draft from facts
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={locked || !dirty || !text.trim() || !can(role, "sign-preparer")}
              title={can(role, "sign-preparer") ? undefined : `${ROLES[role].label} cannot edit the commentary`}
              onClick={() => run(setCommentary(gl.gl, review.asOf, text, text.trim() !== draft), "Commentary saved")}
            >
              Save commentary
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-4 lg:col-span-2">
          <ul className="space-y-2.5">
            <Step
              done={rd.undocumented.length === 0}
              label={`Flagged items of ${fmtINR(MATERIALITY_POLICY.documentedActionAmount)} or more are documented`}
              detail={
                rd.required.length === 0
                  ? "None required"
                  : rd.undocumented.length === 0
                  ? `${fmtInt(rd.required.length)} of ${fmtInt(rd.required.length)} have a decision or follow-up`
                  : (
                    <span>
                      {fmtInt(rd.undocumented.length)} of {fmtInt(rd.required.length)} without a decision or follow-up ({fmtINRCompact(rd.undocumentedValue)})
                    </span>
                  )
              }
            />
            <Step done={saved} label="Commentary saved" />
            <Step done={!!so?.preparer} label="Preparer sign-off" detail={so?.preparer ? `${PERSON_BY_ID.get(so.preparer.personId)?.name}, ${fmtDateTime(so.preparer.at)}` : undefined} />
            <Step done={!!so?.reviewer} label="Reviewer sign-off" detail={so?.reviewer ? `${PERSON_BY_ID.get(so.reviewer.personId)?.name}, ${fmtDateTime(so.reviewer.at)}` : undefined} />
          </ul>
          {so?.reopened && !so.preparer && (
            <div className="rounded-md border border-warn/40 bg-warn-subtle px-3 py-2 text-xs text-warn-foreground">
              Reopened by {PERSON_BY_ID.get(so.reopened.personId)?.name}: {so.reopened.reason}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {rd.undocumented.length > 0 && !locked && (
              <Button
                size="sm"
                variant="outline"
                disabled={!can(role, "follow-up")}
                title={can(role, "follow-up") ? "Drafts a follow-up for each remaining item; nothing is sent" : `${ROLES[role].label} cannot request follow-ups`}
                onClick={() => followUpRows(rd.undocumented.map((l) => rows.find((r) => r.key === l.key)!).filter(Boolean), review.asOf)}
              >
                Request follow-up for the remaining {fmtInt(rd.undocumented.length)}
              </Button>
            )}
            {!so?.preparer && (
              <Button
                size="sm"
                disabled={!can(role, "sign-preparer") || !rd.ready || dirty}
                title={!can(role, "sign-preparer") ? `${ROLES[role].label} cannot sign off as preparer` : dirty ? "Save the commentary first" : !rd.ready ? "Document the flagged items and save the commentary first" : undefined}
                onClick={() => run(signOff(gl.gl, review.asOf, "preparer"), "Signed off as preparer")}
              >
                Sign off as preparer
              </Button>
            )}
            {so?.preparer && !so.reviewer && (
              <Button
                size="sm"
                disabled={!can(role, "sign-reviewer")}
                title={can(role, "sign-reviewer") ? undefined : `${ROLES[role].label} cannot sign off as reviewer`}
                onClick={() => run(signOff(gl.gl, review.asOf, "reviewer"), "Signed off as reviewer")}
              >
                Sign off as reviewer
              </Button>
            )}
          </div>
          {so?.preparer && can(role, "sign-reviewer") && (
            <div className="flex items-center gap-2">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason to reopen" className="h-8" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const r = reopen(gl.gl, review.asOf, reason);
                  run(r, "Account reopened");
                  if (r.ok) setReason("");
                }}
              >
                Reopen
              </Button>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

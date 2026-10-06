import { useEffect, useMemo, useState } from "react";
import { Check, CircleDashed, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel, StatusChip } from "@/components/vocab";
import { PERSON_BY_ID, WORLD } from "@/data";
import type { RecRow } from "@/state/recHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { ROLES, can } from "@/config/roles";
import { RECON_POLICY } from "@/config/policies";
import { draftRecCommentary, needsAction } from "@/engine/recs";
import { fmtDateTime } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

const run = (r: { ok: boolean; error?: string }, ok: string) => (r.ok ? toast(ok, { tone: "ok" }) : toast(r.error ?? "Not allowed", { tone: "danger" }));

/** Commentary, readiness and sign-off for one reconciliation. */
export function RecSignOffPanel({ row }: { row: RecRow }) {
  const role = useRoleStore((s) => s.role);
  const { setCommentary, signOff, reopen } = useWorkflow.getState();
  const { rec, view, signOff: so } = row;
  const locked = !!so?.preparer;
  const draft = useMemo(() => draftRecCommentary(view, WORLD.asOf), [view]);
  const [text, setText] = useState(so?.commentary ?? "");
  const [reason, setReason] = useState("");
  useEffect(() => setText(so?.commentary ?? ""), [so?.commentary]);

  const saved = row.hasCommentary;
  const dirty = text.trim() !== (so?.commentary ?? "");
  const actionItems = view.items.filter(needsAction);
  const undocumented = actionItems.filter((i) => !row.documented.has(i.id));
  const commentaryNeeded = view.items.length > 0;
  const blockers = row.blockers.filter((b) => b !== "Commentary not saved");
  const canSign = blockers.length === 0 && (!commentaryNeeded || (saved && !dirty));

  return (
    <Panel title="Commentary and sign-off" actions={<StatusChip status={row.status} />} bodyClassName="p-0">
      <div className="grid grid-cols-1 gap-0 lg:grid-cols-5">
        <div className="space-y-2 border-b border-border p-4 lg:col-span-3 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Commentary</span>
            {so?.commentaryEdited && <span className="text-2xs text-muted-foreground">Edited by preparer</span>}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={locked}
            placeholder={commentaryNeeded ? "Draft the commentary from the reconciliation, then edit it" : "Optional: there are no reconciling items"}
            className="min-h-[9rem]"
          />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={locked || !can(role, "sign-preparer")} onClick={() => setText(draft)} title="Template over this reconciliation's current facts">
              <Wand2 className="h-3.5 w-3.5" /> Draft from facts
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={locked || !dirty || !text.trim() || !can(role, "sign-preparer")}
              title={can(role, "sign-preparer") ? undefined : `${ROLES[role].label} cannot edit the commentary`}
              onClick={() => run(setCommentary(rec.id, WORLD.asOf, text, text.trim() !== draft), "Commentary saved")}
            >
              Save commentary
            </Button>
          </div>
        </div>

        <div className="space-y-3 p-4 lg:col-span-2">
          <ul className="space-y-2.5">
            <Step done={view.prepared} label="Prepared" />
            {rec.confirmation && <Step done={view.sourceBalance !== null} label="Counterparty balance received" />}
            <Step done={view.unclassified === 0} label="Every item classified" detail={view.unclassified > 0 ? `${fmtInt(view.unclassified)} not classified` : undefined} />
            <Step
              done={view.unexplained !== null && view.withinTolerance}
              label={`Unexplained difference within ${fmtINR(RECON_POLICY.tolerance[rec.type])}`}
              detail={view.unexplained !== null && !view.withinTolerance ? `${fmtINR(Math.abs(view.unexplained))} unexplained` : undefined}
            />
            <Step
              done={undocumented.length === 0}
              label="Items needing action have a decision or follow-up"
              detail={actionItems.length === 0 ? "None needed" : undocumented.length === 0 ? `${fmtInt(actionItems.length)} of ${fmtInt(actionItems.length)} documented` : `${fmtInt(undocumented.length)} of ${fmtInt(actionItems.length)} without one`}
            />
            {commentaryNeeded && <Step done={saved} label="Commentary saved" />}
            <Step done={!!so?.preparer} label="Preparer sign-off" detail={so?.preparer ? `${PERSON_BY_ID.get(so.preparer.personId)?.name}, ${fmtDateTime(so.preparer.at)}` : undefined} />
            <Step done={!!so?.reviewer} label="Reviewer sign-off" detail={so?.reviewer ? `${PERSON_BY_ID.get(so.reviewer.personId)?.name}, ${fmtDateTime(so.reviewer.at)}` : undefined} />
          </ul>
          {so?.reopened && !so.preparer && (
            <div className="rounded-md border border-warn/40 bg-warn-subtle px-3 py-2 text-xs text-warn-foreground">
              Reopened by {PERSON_BY_ID.get(so.reopened.personId)?.name}: {so.reopened.reason}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {!so?.preparer && (
              <Button
                size="sm"
                disabled={!can(role, "sign-preparer") || !canSign}
                title={!can(role, "sign-preparer") ? `${ROLES[role].label} cannot sign off as preparer` : dirty ? "Save the commentary first" : blockers[0] ?? (commentaryNeeded && !saved ? "Save the commentary first" : undefined)}
                onClick={() => run(signOff(rec.id, WORLD.asOf, "preparer"), "Signed off as preparer")}
              >
                Sign off as preparer
              </Button>
            )}
            {so?.preparer && !so.reviewer && (
              <Button
                size="sm"
                disabled={!can(role, "sign-reviewer")}
                title={can(role, "sign-reviewer") ? undefined : `${ROLES[role].label} cannot sign off as reviewer`}
                onClick={() => run(signOff(rec.id, WORLD.asOf, "reviewer"), "Signed off as reviewer")}
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
                  const r = reopen(rec.id, WORLD.asOf, reason);
                  run(r, "Reconciliation reopened");
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

// Bulk actions over selected item rows, shared by the exceptions queue and the
// account page. Each row is validated on its own by the workflow store; one
// activity event covers the batch.

import { toast } from "@/lib/toast";
import { addDays } from "@/lib/dates";
import { draftFollowUp } from "@/engine/followup";
import { useWorkflow } from "@/state/workflow";
import type { ItemRow } from "@/state/hooks";

const MODULE = "balance-sheet-review";
const LIVE = ["proposed", "approved", "exported"];

/** Rows that can still receive a follow-up: none open already. */
export const followable = (rows: ItemRow[]) => rows.filter((r) => !(r.followUp && r.followUp.status !== "closed"));

/** Rows with a recommended action other than follow-up and no live decision. */
export const proposable = (rows: ItemRow[]) =>
  rows.filter((r) => r.rec && r.rec.action !== "Follow up" && !(r.decision && LIVE.includes(r.decision.status)));

export function followUpRows(rows: ItemRow[], asOf: string, module = MODULE): boolean {
  const targets = followable(rows);
  if (!targets.length) {
    toast("Nothing to follow up", { description: "Every selected item already has an open follow-up.", tone: "info" });
    return false;
  }
  const due = addDays(asOf, 20);
  const res = useWorkflow.getState().requestFollowUps(
    targets.map((r) => {
      const d = draftFollowUp(r.item, r.rec, r.hits);
      return { itemKey: r.key, module, owner: d.owner, dueDate: due, message: d.message };
    })
  );
  if (!res.ok) {
    toast(res.error, { tone: "danger" });
    return false;
  }
  toast(`${res.created} follow-up${res.created === 1 ? "" : "s"} requested`, { description: "Messages are drafted from each item's facts; nothing is sent.", tone: "ok" });
  return true;
}

export function proposeRows(rows: ItemRow[], rulesVersion: string, module = MODULE): boolean {
  const targets = proposable(rows);
  if (!targets.length) return false;
  const res = useWorkflow.getState().proposeDecisions(
    targets.map((r) => ({
      itemKey: r.key,
      module,
      action: r.rec!.action,
      amount: r.item.amount,
      justification: `Accepted the recommendation (confidence ${r.rec!.confidence.toFixed(2)}). ${r.rec!.rationale}`,
      recommendation: r.rec,
      hits: r.hits,
      rulesVersion,
    }))
  );
  if (!res.ok) {
    toast(res.error, { tone: "danger" });
    return false;
  }
  toast(`${res.created} decision${res.created === 1 ? "" : "s"} proposed`, { description: res.skipped.length ? `${res.skipped.length} skipped` : "Routed to approvers by amount band.", tone: "ok" });
  return true;
}

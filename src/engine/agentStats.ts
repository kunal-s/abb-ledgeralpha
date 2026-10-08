// What each agent has done and what people made of it (docs/FRD.md §6.19,
// D-59, FR-AGT-02): acceptance and override are counted from the recorded
// decisions, classifications, reviews and edits, never held as numbers. An
// agent that has proposed nothing a person has answered shows no rate rather
// than 0%.

import type { AccountSignOff, ActivityEvent, Decision, FollowUp, JournalReview } from "@/types";
import { AGENTS, type AgentDef } from "@/engine/agents";
import type { CloseModel } from "@/state/closeModel";
import type { Review } from "@/state/hooks";
import type { ReceiptRow } from "@/state/cashAppHooks";
import type { RecRow } from "@/state/recHooks";
import type { JournalRow } from "@/state/journalHooks";
import { fmtInt } from "@/lib/format";

export interface AgentStat {
  agent: AgentDef;
  touched: number;
  touchedLabel: string;
  /** proposals a person answered the way the agent proposed, and otherwise */
  accepted: number;
  overridden: number;
  /** proposals nobody has answered yet */
  open: number;
  /** accepted over answered; null until a person has answered one, and always null for an agent whose work is not accepted or overridden */
  rate: number | null;
  /** whether acceptance means anything for this agent */
  rated: boolean;
  /** what the two counts mean for this agent, in the agent's own terms */
  words: { accepted: string; overridden: string; open: string };
  facts: { label: string; value: string }[];
  runs: number;
  lastRun?: ActivityEvent;
}

export interface AgentInput {
  decisions: Decision[];
  review: Review;
  recRows: RecRow[];
  receipts: ReceiptRow[];
  journals: JournalRow[];
  close: CloseModel;
  signOffs: Record<string, AccountSignOff>;
  followUps: FollowUp[];
  journalReviews: Record<string, JournalReview>;
  events: ActivityEvent[];
}

const rateOf = (a: number, o: number) => (a + o > 0 ? a / (a + o) : null);
const answered = (d: Decision) => d.status !== "withdrawn";

export function buildAgentStats(i: AgentInput): AgentStat[] {
  const runsOf = (id: string) => i.events.filter((e) => e.actorId === id);
  const mk = (agent: AgentDef, s: Omit<AgentStat, "agent" | "rate" | "rated" | "runs" | "lastRun" | "facts"> & { facts?: AgentStat["facts"]; rated?: boolean }): AgentStat => {
    const runs = runsOf(agent.id);
    const last = runs.reduce<ActivityEvent | undefined>((m, e) => (!m || e.at > m.at ? e : m), undefined);
    const rated = s.rated ?? true;
    return { ...s, facts: s.facts ?? [], agent, rated, rate: rated ? rateOf(s.accepted, s.overridden) : null, runs: runs.length, lastRun: last };
  };
  const out: AgentStat[] = [];

  for (const agent of AGENTS) {
    switch (agent.id) {
      case "agent:scrutiny": {
        const recs = i.review.rows.filter((r) => r.rec && r.isOpen);
        const decided = i.decisions.filter((d) => d.module === "balance-sheet-review" && answered(d) && d.snapshot.recommendation);
        const accepted = decided.filter((d) => d.action === d.snapshot.recommendation!.action).length;
        const overridden = decided.length - accepted;
        const conf = recs.length ? recs.reduce((s, r) => s + r.rec!.confidence, 0) / recs.length : 0;
        out.push(mk(agent, {
          touched: recs.length, touchedLabel: "items recommended on", accepted, overridden, open: Math.max(0, recs.length - decided.length),
          words: { accepted: "decided as recommended", overridden: "decided differently", open: "not yet decided" },
          facts: [
            { label: "Average confidence", value: conf.toFixed(2) },
            { label: "Fell back to follow-up", value: fmtInt(recs.filter((r) => r.rec!.action === "Follow up").length) },
            { label: "Recommended to escalate", value: fmtInt(recs.filter((r) => r.rec!.action === "Escalate").length) },
          ],
        }));
        break;
      }
      case "agent:reconciler": {
        const items = i.recRows.flatMap((r) => r.view.items);
        const suggested = i.recRows.flatMap((r) => r.view.items.filter((x) => x.suggestedClass).map((x) => ({ x, signed: !!r.signOff?.preparer })));
        // a suggestion is accepted when the preparer has signed the reconciliation with it in place, overridden when a person classed the item otherwise
        const accepted = suggested.filter((s) => s.signed && s.x.classId === s.x.suggestedClass).length;
        const overridden = suggested.filter((s) => s.x.classId && s.x.classId !== s.x.suggestedClass).length;
        out.push(mk(agent, {
          touched: items.length, touchedLabel: "reconciling items looked at", accepted, overridden, open: suggested.length - accepted - overridden,
          words: { accepted: "signed off as suggested", overridden: "classified differently", open: "not yet signed off" },
          facts: [
            { label: "Reconciliations prepared", value: `${fmtInt(i.recRows.filter((r) => r.view.prepared).length)} of ${fmtInt(i.recRows.length)}` },
            { label: "Items left to a person", value: fmtInt(items.filter((x) => !x.suggestedClass).length) },
          ],
        }));
        break;
      }
      case "agent:matcher": {
        const proposed = i.receipts.filter((r) => r.best);
        const live = i.receipts.filter((r) => r.decision && r.decision.status !== "rejected" && r.decision.status !== "withdrawn");
        const rejected = i.receipts.reduce((s, r) => s + r.rejected, 0);
        out.push(mk(agent, {
          touched: i.receipts.length, touchedLabel: "receipts looked at", accepted: live.length, overridden: rejected, open: proposed.filter((r) => !r.decision).length,
          words: { accepted: "matches confirmed", overridden: "matches rejected", open: "proposed, waiting" },
          facts: [
            { label: "Matched with confidence", value: `${fmtInt(proposed.length)} of ${fmtInt(i.receipts.length)}` },
            { label: "Parked by a person", value: fmtInt(i.receipts.filter((r) => r.parked).length) },
          ],
        }));
        break;
      }
      case "agent:tax-matcher": {
        const dec = i.decisions.filter((d) => d.module === "withholding-tax" && answered(d));
        out.push(mk(agent, {
          touched: i.review.rows.filter((r) => r.category === "tds-recv" && r.isOpen).length, touchedLabel: "deductions looked at", accepted: 0, overridden: 0, open: dec.length,
          words: { accepted: "", overridden: "", open: "decisions on its findings" },
          rated: false,
          facts: [{ label: "Method", value: "Deterministic: the same statement gives the same result" }],
        }));
        break;
      }
      case "agent:close": {
        const states = i.close.evaluation.states;
        out.push(mk(agent, {
          touched: states.length, touchedLabel: "tasks tracked", accepted: 0, overridden: 0, open: states.filter((s) => s.status !== "complete").length,
          words: { accepted: "", overridden: "", open: "tasks still open" },
          rated: false,
          facts: [
            { label: "Complete", value: fmtInt(states.filter((s) => s.status === "complete").length) },
            { label: "Late", value: fmtInt(states.filter((s) => s.late).length) },
            { label: "Blocked", value: fmtInt(states.filter((s) => s.status === "blocked").length) },
          ],
        }));
        break;
      }
      case "agent:journal-reviewer": {
        const flagged = i.journals.filter((j) => j.flags.length > 0);
        const concluded = flagged.filter((j) => j.review);
        const upheld = concluded.filter((j) => j.review!.outcome === "support-requested").length;
        out.push(mk(agent, {
          touched: i.journals.length, touchedLabel: "journals checked", accepted: upheld, overridden: concluded.length - upheld, open: flagged.length - concluded.length,
          words: { accepted: "flags upheld by the reviewer", overridden: "flags cleared by the reviewer", open: "flags waiting for review" },
          facts: [{ label: "Journals flagged", value: fmtInt(flagged.length) }],
        }));
        break;
      }
      case "agent:narrator": {
        const drafted = Object.values(i.signOffs).filter((s) => s.commentary?.trim());
        const edited = drafted.filter((s) => s.commentaryEdited).length;
        out.push(mk(agent, {
          touched: drafted.length, touchedLabel: "commentaries written", accepted: drafted.length - edited, overridden: edited, open: 0,
          words: { accepted: "kept as drafted", overridden: "edited by the owner", open: "" },
          facts: [{ label: "Method", value: "A template over the facts; every figure comes from the review" }],
        }));
        break;
      }
      case "agent:follow-up": {
        const responded = i.followUps.filter((f) => f.status !== "open").length;
        out.push(mk(agent, {
          touched: i.followUps.length, touchedLabel: "follow-ups drafted", accepted: responded, overridden: 0, open: i.followUps.length - responded,
          words: { accepted: "answered", overridden: "", open: "waiting for an answer" },
          rated: false,
          facts: [{ label: "Overdue", value: fmtInt(i.followUps.filter((f) => f.status === "open" && f.dueDate < (i.close.today ?? "")).length) }],
        }));
        break;
      }
    }
  }
  return out;
}

/** Every decision a person made differently from what an agent recommended, newest first. */
export function overrides(decisions: Decision[]): Decision[] {
  return decisions
    .filter((d) => answered(d) && d.snapshot.recommendation && d.action !== d.snapshot.recommendation.action)
    .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
}

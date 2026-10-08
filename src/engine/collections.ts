// Collections (docs/FRD.md §6.16): the next step for an open receivable or
// payable. The step follows from the document alone (how far past its due
// date it is, its age, whether it is a retention or a credit, the stage of the
// project) and the thresholds of the collection policy. It is a proposal: a
// person asks for the follow-up, and the item drawer holds the reply.

import type { IsoDate, LineItem } from "@/types";
import { PARTY_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { COLLECTION_POLICY as P } from "@/config/policies";
import { ageOf } from "@/engine/review";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";

export type Side = "receivables" | "payables";

export type StepId = "not-due" | "remind" | "confirm" | "escalate" | "retention-hold" | "retention-ask" | "retention-release" | "apply-credit" | "pay";

export interface Step {
  id: StepId;
  label: string;
  /** whether anyone has to do something */
  action: boolean;
  /** who is asked: the follow-up's owner */
  owner: string;
  dueInDays: number;
  /** the facts the step rests on, for the tooltip */
  basis: string[];
  /** an invoice old enough for its provision to be reviewed */
  reviewProvision: boolean;
  /** how pressing the step is: the higher the sooner */
  urgency: number;
}

/** The steps in the order they are listed: the most pressing first. */
export const STEP_ORDER: { id: StepId; label: string }[] = [
  { id: "escalate", label: "Escalate to the project or sales manager" },
  { id: "retention-release", label: "Ask for the retention to be released" },
  { id: "retention-ask", label: "Confirm the retention release date" },
  { id: "confirm", label: "Confirm the payment date" },
  { id: "pay", label: "Schedule the payment" },
  { id: "remind", label: "Send a reminder" },
  { id: "apply-credit", label: "Apply the credit" },
  { id: "retention-hold", label: "Retention held" },
  { id: "not-due", label: "Not yet due" },
];

export const STEP_LABEL = new Map(STEP_ORDER.map((s) => [s.id, s.label]));

const URGENCY: Record<StepId, number> = { escalate: 8, "retention-release": 7, "retention-ask": 6, confirm: 5, pay: 5, remind: 3, "apply-credit": 2, "retention-hold": 1, "not-due": 0 };

// ---------------------------------------------------------------------------
// how a business partner pays
// ---------------------------------------------------------------------------
export interface Behaviour {
  invoices: number;
  /** days from the posting date of an invoice to its clearing, on average */
  averageDays: number;
}

let behaviour: Map<string, Behaviour> | undefined;

const INVOICE_GLS: Record<Side, Set<string>> = { receivables: new Set(["140100", "140200", "140300"]), payables: new Set(["210100", "210200", "210300"]) };

/** How long a customer or supplier takes to settle an invoice, from the invoices that are settled. */
export function behaviourOf(partyId: string): Behaviour | undefined {
  if (!behaviour) {
    const sums = new Map<string, { n: number; days: number }>();
    for (const l of WORLD.lines) {
      if (!l.partner || !l.clearing) continue;
      const invoice = (INVOICE_GLS.receivables.has(l.gl) && l.amount > 0) || (INVOICE_GLS.payables.has(l.gl) && l.amount < 0);
      if (!invoice) continue;
      const e = sums.get(l.partner.id) ?? { n: 0, days: 0 };
      e.n += 1;
      e.days += daysBetween(l.postingDate, l.clearing.date);
      sums.set(l.partner.id, e);
    }
    behaviour = new Map([...sums].map(([id, e]) => [id, { invoices: e.n, averageDays: e.days / e.n }]));
  }
  return behaviour.get(partyId);
}

// ---------------------------------------------------------------------------
// the step
// ---------------------------------------------------------------------------
const RETENTION_GL = "142100";

const step = (id: StepId, label: string, owner: string, dueInDays: number, basis: string[], reviewProvision = false): Step => ({
  id, label, action: id !== "not-due" && id !== "retention-hold", owner, dueInDays, basis, reviewProvision, urgency: URGENCY[id],
});

export function stepOf(side: Side, l: LineItem, asOf: IsoDate = WORLD.asOf): Step {
  const age = ageOf(l, asOf);
  const party = l.partner ? PARTY_BY_ID.get(l.partner.id) : undefined;
  const partyName = party?.name ?? (side === "receivables" ? "Customer" : "Supplier");
  const project = l.wbs ? PROJECT_BY_WBS.get(l.wbs) : undefined;
  const manager = project ? `Project manager, ${project.name}` : side === "receivables" ? "Sales manager" : "Accounts payable";
  const pastDue = l.dueDate ? daysBetween(l.dueDate, asOf) : undefined;
  const pays = party ? behaviourOf(party.id) : undefined;
  const facts: string[] = [`${age} days since posting`];
  if (l.dueDate) facts.push(pastDue! > 0 ? `Due ${fmtDate(l.dueDate)}, ${pastDue} days past due` : `Due ${fmtDate(l.dueDate)}`);
  if (pays && pays.invoices >= 3) facts.push(`${partyName} settles an invoice in ${Math.round(pays.averageDays)} days on average (${pays.invoices} invoices)`);
  if (project) facts.push(`Project ${project.name} is ${project.stage.toLowerCase()}`);

  if (side === "payables") {
    if (l.amount > 0) return step("apply-credit", "Adjust against an invoice or recover", "Accounts payable", P.dueInDays.payable, [`A debit balance of ${fmtINR(l.amount)} on a supplier account`, ...facts]);
    if (pastDue !== undefined && pastDue > 0) return step("pay", "Schedule the payment or record the dispute", "Accounts payable", P.dueInDays.payable, facts);
    return step("not-due", "Not yet due", "Accounts payable", 0, facts);
  }

  if (l.amount < 0) return step("apply-credit", "Apply the credit to an open invoice", "Receivables specialist", P.dueInDays.remind, [`A credit of ${fmtINR(-l.amount)} on a customer account`, ...facts]);

  if (l.gl === RETENTION_GL) {
    const ended = project && (project.stage === "DLP ended" || project.stage === "Closed" || (project.dlpEnd !== undefined && project.dlpEnd < asOf));
    if (ended) {
      const basis = [...facts, project?.dlpEnd ? `Defects liability period ended ${fmtDate(project.dlpEnd)}` : "Defects liability period has ended"];
      return step("retention-release", "Ask the customer to release the retention", partyName, P.dueInDays.retention, basis);
    }
    if (age > P.retentionQueryAfterAgeDays) return step("retention-ask", "Confirm the release date with the project manager", manager, P.dueInDays.retention, facts);
    return step("retention-hold", "Held until the release milestone", manager, 0, facts);
  }

  const lateBy = pastDue ?? age;
  if (age > P.provisionReviewAfterAgeDays) return step("escalate", "Escalate and review the provision", manager, P.dueInDays.escalate, facts, true);
  if (lateBy >= P.escalateAfterDaysPastDue) return step("escalate", "Escalate to the project or sales manager", manager, P.dueInDays.escalate, facts);
  if (lateBy >= P.confirmAfterDaysPastDue) return step("confirm", "Confirm the payment date", partyName, P.dueInDays.confirm, facts);
  if (lateBy >= 1) return step("remind", "Send a reminder", partyName, P.dueInDays.remind, facts);
  return step("not-due", "Not yet due", partyName, 0, facts);
}

// ---------------------------------------------------------------------------
// the follow-up that carries the step out
// ---------------------------------------------------------------------------
export interface FollowUpRequest {
  itemKey: string;
  module: string;
  owner: string;
  dueDate: IsoDate;
  message: string;
}

/** The request for the follow-up of a step, with a message built from the document's own facts. */
export function followUpFor(side: Side, l: LineItem, s: Step, today: IsoDate, asOf: IsoDate = WORLD.asOf): FollowUpRequest {
  const ref = l.reference ?? l.docNo;
  const age = ageOf(l, asOf);
  const amount = fmtINR(Math.abs(l.amount));
  const party = l.partner ? PARTY_BY_ID.get(l.partner.id)?.name : undefined;
  const project = l.wbs ? PROJECT_BY_WBS.get(l.wbs) : undefined;
  const pastDue = l.dueDate ? daysBetween(l.dueDate, asOf) : age;
  const due = l.dueDate ? fmtDate(l.dueDate) : "";
  let message: string;
  switch (s.id) {
    case "remind":
      message = `Please arrange payment of ${amount} on invoice ${ref} dated ${fmtDate(l.postingDate)}. It was due on ${due} and is ${pastDue} days past due.`;
      break;
    case "confirm":
      message = `Please confirm when ${amount} on invoice ${ref} will be paid. It was due on ${due} and is ${pastDue} days past due.`;
      break;
    case "escalate":
      message = `Invoice ${ref} of ${party ?? "the customer"}, ${amount}, is ${age} days old${l.dueDate ? ` and ${pastDue} days past due` : ""}. Please help resolve it with the customer and tell us the expected payment date${s.reviewProvision ? ", or whether it should be provided for" : ""}.`;
      break;
    case "retention-release":
      message = `The defects liability period of ${project?.name ?? "the project"} has ended${project?.dlpEnd ? ` on ${fmtDate(project.dlpEnd)}` : ""}. Please release the retention of ${amount} held on ${ref}.`;
      break;
    case "retention-ask":
      message = `Retention ${ref} of ${amount} on ${project?.name ?? "the project"} has been held for ${age} days. Please confirm the release milestone and the expected date.`;
      break;
    case "apply-credit":
      message = side === "receivables" ? `A credit of ${amount} on ${ref} has been unapplied for ${age} days. Please apply it to an open invoice or arrange a refund.` : `A debit of ${amount} on ${ref} of ${party ?? "the supplier"} has been open for ${age} days. Please adjust it against an invoice or recover it.`;
      break;
    case "pay":
      message = `Please confirm the payment date for ${ref} of ${party ?? "the supplier"}, ${amount} dated ${fmtDate(l.postingDate)}. It is ${pastDue} days past due.`;
      break;
    default:
      message = `Please confirm the status of ${ref}, ${amount} dated ${fmtDate(l.postingDate)}.`;
  }
  return { itemKey: l.key, module: "working-capital", owner: s.owner, dueDate: addDays(today, Math.max(1, s.dueInDays)), message };
}

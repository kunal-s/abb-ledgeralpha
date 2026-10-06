// Drafted follow-up messages (decision D-04: templates over the item's facts).
// Messages are copied or exported - the prototype never sends anything.

import type { LineItem, Recommendation, RuleHit } from "@/types";
import { fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { GL_BY_ID, PARTY_BY_ID, PERSON_BY_ID } from "@/data";

export interface FollowUpDraft {
  /** who is asked */
  owner: string;
  message: string;
}

export function draftFollowUp(item: LineItem, rec: Recommendation | undefined, hits: RuleHit[]): FollowUpDraft {
  const gl = GL_BY_ID.get(item.gl)!;
  const party = item.partner ? PARTY_BY_ID.get(item.partner.id) : undefined;
  const amount = fmtINR(Math.abs(item.amount));
  const doc = `document ${item.docNo} dated ${fmtDate(item.postingDate)}`;
  const primary = hits.find((h) => h.ruleId === rec?.primaryRuleId) ?? hits[0];
  const f = primary?.facts ?? {};
  const internal = `${PERSON_BY_ID.get(gl.ownerId)?.name ?? "Account owner"} (account owner)`;

  const rule = primary?.ruleId;
  if (rule === "BSR-05" && party) {
    const bg = String(f.bgNo ?? "");
    return {
      owner: `Vendor - ${party.name}`,
      message: bg
        ? `Please confirm delivery status against PO ${item.po?.number}, or refund the advance of ${amount} paid on ${fmtDate(item.postingDate)}. We hold advance-payment guarantee ${bg}, valid to ${fmtDate(String(f.bgValidTo))}; if the advance is not settled before then we will invoke it.`
        : `Please confirm delivery status against PO ${item.po?.number}, or refund the advance of ${amount} paid on ${fmtDate(item.postingDate)}. No deliveries have been recorded for ${f.poIdleDays} days.`,
    };
  }
  if (rule === "BSR-07" && party) {
    return {
      owner: `Customer - ${party.name}`,
      message: `Our records show tax deducted of ${amount} on your payments for ${f.quarter}, which is not reflected in the tax credit statement for deductor ${f.deductor}. Please correct your return so the credit appears, and share the revised acknowledgement.`,
    };
  }
  if (rule === "BSR-09" && party) {
    return {
      owner: `Customer - ${party.name}`,
      message: `The defect liability period ended ${f.daysPastDlp} days ago. Please release the retention of ${amount} held against ${item.wbs ?? "the project"}, or let us know what is outstanding. A retention guarantee can replace the cash retention.`,
    };
  }
  if (rule === "BSR-08") {
    return {
      owner: "Project manager",
      message: `${amount} is recognised as unbilled revenue on ${item.wbs ?? "the project"} with nothing billed for ${f.daysSinceBilling} days. Please confirm the next billing milestone and expected date, or tell us if it cannot be billed.`,
    };
  }
  if (rule === "BSR-04" && party) {
    return {
      owner: `Stores / ${party.name}`,
      message: `Invoice ${item.reference ?? item.docNo} for ${amount} on PO ${item.po?.number} was booked ${f.ageDays} days ago but no goods receipt is recorded. Please confirm receipt, or we will raise a debit note.`,
    };
  }
  if (rule === "BSR-02" && party) {
    return {
      owner: `Vendor - ${party.name}`,
      message: `Goods on PO ${item.po?.number} were received ${f.ageDays} days ago (${amount}) and no invoice has been received. Please confirm whether any amount is still payable; otherwise we will close the liability.`,
    };
  }
  if (rule === "BSR-06" && party) {
    return {
      owner: `Customer - ${party.name}`,
      message: `An advance of ${amount} received on ${fmtDate(item.postingDate)} has not been adjusted against billing. Please confirm whether it should be refunded or adjusted against a future invoice.`,
    };
  }
  if (party) {
    const kind = party.type === "Customer" ? "Customer" : party.type === "Vendor" ? "Vendor" : "Group company";
    return {
      owner: `${kind} - ${party.name}`,
      message: `Please confirm the status of ${doc} (${amount}) on ${gl.description.toLowerCase()}, open for ${f.ageDays ?? "more than 180"} days.`,
    };
  }
  return {
    owner: internal,
    message: `Please provide the support and status for ${doc} (${amount}) on ${gl.description.toLowerCase()}${item.text ? ` - "${item.text}"` : ""}.`,
  };
}

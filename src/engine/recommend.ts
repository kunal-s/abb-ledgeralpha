// Recommendation framework (docs/FRD.md §6.6): for every flagged item, choose
// the most specific finding, propose an action, and derive confidence from
// evidence factors that are shown with it. Below 0.60 the recommendation falls
// back to Follow up. Narratives are templates over the facts (decision D-04).

import type { ActionKind, ConfidenceFactor, LineItem, Recommendation, RuleHit } from "@/types";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { bandFor } from "@/config/policies";
import { WORLD } from "@/data";
import type { RuleRun } from "@/engine/run";
import type { EvalContext } from "@/engine/context";

/** Most specific finding first; BSR-01 (age alone) is the fallback. */
export const RULE_PRIORITY = [
  "BSR-03", "BSR-02", "BSR-05", "BSR-06", "BSR-07", "BSR-09", "BSR-08", "BSR-16", "BSR-11",
  "BSR-04", "BSR-10", "BSR-18", "BSR-17", "BSR-15", "BSR-12", "BSR-13", "BSR-14", "BSR-01",
];

const WEAK = 0.6;

interface Draft {
  action: ActionKind;
  factors: ConfidenceFactor[];
  rationale: string;
  nextStep: string;
}

const f = (label: string, weight: number, met: boolean): ConfidenceFactor => ({ label, weight, met });
const num = (h: RuleHit, k: string) => Number(h.facts[k] ?? 0);
const str = (h: RuleHit, k: string) => String(h.facts[k] ?? "");

/** Customer named in a bank narration (first word of the customer's name). */
function customerFromNarration(narration: string) {
  const upper = narration.toUpperCase();
  return WORLD.parties.find((p) => p.type === "Customer" && p.country === "IN" && upper.includes(p.name.split(" ")[0].toUpperCase()));
}

function draft(ctx: EvalContext, item: LineItem, hit: RuleHit, all: RuleHit[], openFollowUp: boolean): Draft {
  const amount = fmtINR(Math.abs(item.amount));
  const partner = item.partner ? ctx.party.get(item.partner.id) : undefined;
  const partnerActive = !partner || partner.status === "Active";
  const gl = ctx.gl.get(item.gl)!;
  const ageDays = num(hit, "ageDays") || daysBetween(item.postingDate, ctx.asOf);
  const project = item.wbs ? ctx.project.get(item.wbs) : undefined;

  switch (hit.ruleId) {
    case "BSR-03": {
      const net = num(hit, "net");
      return {
        action: "Clear",
        factors: [
          f("Offsetting item on the same PO line or assignment", 0.35, true),
          f("Amounts agree within tolerance", 0.3, true),
          f("Exact amount match", 0.15, net === 0),
          f("Item older than 30 days", 0.2, ageDays > 30),
        ],
        rationale: `Document ${item.docNo} and its counter-item offset ${net === 0 ? "exactly" : `with a difference of ${fmtINR(Math.abs(net))}`}. Clearing them removes both from the account.`,
        nextStep: "Clear the pair in the ERP",
      };
    }
    case "BSR-02":
      return {
        action: "Write back",
        factors: [
          f("Received more than 365 days ago", 0.25, ageDays > 365),
          f("Purchase order closed", 0.25, str(hit, "poStatus") !== "Open"),
          f("No invoice since the goods receipt", 0.2, true),
          f("Vendor inactive or blocked", 0.1, str(hit, "vendorStatus") !== "Active"),
          f("No offsetting item on the PO line", 0.1, !all.some((h) => h.ruleId === "BSR-03")),
          f("No open follow-up", 0.1, !openFollowUp),
        ],
        rationale: `Goods received on PO ${str(hit, "po")} ${ageDays} days ago were never invoiced and the PO is ${str(hit, "poStatus").toLowerCase()}. The vendor is unlikely to claim ${amount}; write it back to income, subject to tax review.`,
        nextStep: "Propose write-back for tax review",
      };
    case "BSR-05": {
      const bgNo = str(hit, "bgNo");
      if (bgNo) {
        return {
          action: "Follow up",
          factors: [
            f("Valid advance-payment BG held", 0.35, true),
            f("BG covers the advance", 0.25, num(hit, "bgAmount") >= Math.abs(item.amount)),
            f("Advance older than 365 days", 0.2, ageDays > 365),
            f("Vendor blocked or inactive", 0.2, str(hit, "vendorStatus") !== "Active"),
          ],
          rationale: `Advance of ${amount} paid ${ageDays} days ago with no deliveries for ${num(hit, "poIdleDays")} days. BG ${bgNo} is valid to ${fmtDate(str(hit, "bgValidTo"))}: recover the advance or invoke the guarantee before it expires.`,
          nextStep: `Recover from the vendor or invoke BG ${bgNo} before ${fmtDate(str(hit, "bgValidTo"))}`,
        };
      }
      return {
        action: "Provide",
        factors: [
          f("Advance older than 365 days", 0.25, ageDays > 365),
          f("No deliveries against the PO", 0.2, true),
          f("Purchase order closed", 0.2, str(hit, "poStatus") !== "Open"),
          f("Vendor blocked or inactive", 0.2, str(hit, "vendorStatus") !== "Active"),
          f("No bank guarantee to fall back on", 0.15, true),
        ],
        rationale: `Advance of ${amount} paid ${ageDays} days ago; no deliveries for ${num(hit, "poIdleDays")} days and no guarantee held. Provide in full and pursue recovery; write off with approval if recovery fails.`,
        nextStep: "Provide 100% and pursue recovery",
      };
    }
    case "BSR-06": {
      const closed = ["Closed", "DLP ended"].includes(str(hit, "projectStage"));
      return {
        action: "Write back",
        factors: [
          f("Advance older than 365 days", 0.3, ageDays > 365),
          f("Project closed or DLP ended", 0.3, closed),
          f("Nothing billed for more than 365 days", 0.25, num(hit, "daysSinceBilling") > 365),
          f("No open follow-up", 0.15, !openFollowUp),
        ],
        rationale: `Advance of ${amount} received ${ageDays} days ago was never adjusted against billing${closed ? ` and the project is ${str(hit, "projectStage").toLowerCase()}` : ""}. Confirm no refund is owed, then write it back, subject to tax review.`,
        nextStep: "Confirm with the customer, then propose write-back",
      };
    }
    case "BSR-07": {
      const status = str(hit, "creditStatus");
      const quarter = str(hit, "quarter");
      const tooOld = num(hit, "taxYearsElapsed") > num(hit, "writeOffYears");
      if (tooOld) {
        return {
          action: "Write off",
          factors: [
            f(`Older than ${num(hit, "writeOffYears")} tax years`, 0.35, true),
            f("Not credited in the tax statement", 0.35, status === "missing"),
            f("No credit in another quarter", 0.15, status !== "credited in another quarter"),
            f("No open follow-up", 0.15, !openFollowUp),
          ],
          rationale: `Deduction of ${amount} for ${quarter} is ${num(hit, "taxYearsElapsed")} tax years old and was never credited; it can no longer be claimed. Write off, subject to tax review.`,
          nextStep: "Propose write-off for tax review",
        };
      }
      return {
        action: "Follow up",
        factors: [
          f("Tax statement available for the quarter", 0.3, true),
          f(status === "short credit" ? "Credited short" : status === "missing" ? "Not credited" : "Credited in the wrong quarter", 0.4, true),
          f("Still within the claim window", 0.15, !tooOld),
          f("Customer active", 0.15, partnerActive),
        ],
        rationale:
          status === "credited in another quarter"
            ? `The credit appears in another quarter; align the receivable to that quarter and clear it.`
            : `${partner?.name ?? "The customer"} deducted ${amount} for ${quarter} but it is ${status === "short credit" ? "only partly" : "not"} in the tax statement. Ask the customer to correct their return (deductor ${str(hit, "deductor")}).`,
        nextStep: status === "credited in another quarter" ? "Align the quarter and clear" : "Request a return correction from the customer",
      };
    }
    case "BSR-09": {
      const provide = num(hit, "daysPastDlp") > num(hit, "provideAfterDays");
      return provide
        ? {
            action: "Provide",
            factors: [
              f("More than a year past DLP", 0.4, true),
              f("No release since DLP", 0.3, true),
              f("Project closed", 0.3, project?.stage === "Closed"),
            ],
            rationale: `Retention of ${amount} is ${num(hit, "daysPastDlp")} days past the defect liability period with no release. Provide for expected credit loss while recovery continues.`,
            nextStep: "Provide for expected credit loss; continue recovery",
          }
        : {
            action: "Follow up",
            factors: [
              f("Defect liability period over", 0.4, true),
              f("Retention due under the contract", 0.3, true),
              f("Customer active", 0.3, partnerActive),
            ],
            rationale: `The defect liability period on ${project?.name ?? "the project"} ended ${num(hit, "daysPastDlp")} days ago; retention of ${amount} is due. Request release, or offer a retention BG in exchange.`,
            nextStep: "Request retention release from the customer",
          };
    }
    case "BSR-08": {
      const onHold = str(hit, "projectStage") === "On hold";
      const since = num(hit, "daysSinceBilling");
      const provide = onHold && since > num(hit, "provideAfterDays");
      return {
        action: provide ? "Provide" : "Follow up",
        factors: provide
          ? [f("Project on hold", 0.4, true), f(`Nothing billed for more than ${num(hit, "provideAfterDays")} days`, 0.4, true), f("Customer active", 0.2, partnerActive)]
          : [
              f("Nothing billed for more than 180 days", 0.35, since > 180),
              f("Project on hold", 0.25, onHold),
              f("Unbilled for more than 180 days", 0.2, ageDays > 180),
              f("Customer active", 0.2, partnerActive),
            ],
        rationale: `${amount} recognised on ${project?.name ?? "the project"} with nothing billed for ${since} days${onHold ? "; the project is on hold" : ""}. ${provide ? "Provide for expected credit loss." : "Confirm the billing milestone with the project manager; provide if it cannot be billed."}`,
        nextStep: provide ? "Provide for expected credit loss" : "Confirm the billing milestone with the project manager",
      };
    }
    case "BSR-16":
      return {
        action: "Follow up",
        factors: [f("Open more than 180 days", 0.4, ageDays > 180), f("Statutory liability", 0.3, true), f("No deposit recorded since", 0.3, true)],
        rationale: `${gl.description} of ${amount} open since ${fmtDate(item.postingDate)} has not been deposited. Deposit with interest and file the return; it is reportable as an undisputed statutory due outstanding over six months.`,
        nextStep: "Deposit, file, and flag for CARO reporting",
      };
    case "BSR-11": {
      const toPayables = gl.category === "vendor-adv" && item.amount < 0;
      return {
        action: "Reclassify",
        factors: [
          f("Opposite to the account's normal balance", 0.4, true),
          f("Posted with a business partner", 0.2, !!item.partner),
          f("Posted by an invoice document", 0.25, ["KR", "DR", "RE"].includes(item.docType)),
          f("Posted in the last 90 days", 0.15, ageDays <= 90),
        ],
        rationale: `A ${item.amount < 0 ? "credit" : "debit"} of ${amount} on ${gl.description.toLowerCase()} ${toPayables ? "looks like a supplier invoice posted to the advance account" : "does not belong on this account"}. Reclassify it.`,
        nextStep: toPayables ? "Reclassify to trade payables" : "Reclassify to the correct account",
      };
    }
    case "BSR-04":
      return {
        action: "Follow up",
        factors: [
          f("Invoiced more than 90 days ago", 0.3, ageDays > 90),
          f("No goods receipt since", 0.3, true),
          f("Purchase order still open", 0.2, str(hit, "poStatus") === "Open"),
          f("Vendor active", 0.2, partnerActive),
        ],
        rationale: `Invoice on PO ${str(hit, "po")} booked ${ageDays} days ago with no goods receipt. Confirm receipt with stores, or raise a debit note if the goods never arrived.`,
        nextStep: "Confirm goods receipt or raise a debit note",
      };
    case "BSR-10": {
      if (item.gl === "171200") {
        const named = customerFromNarration(item.text ?? "");
        return named
          ? {
              action: "Reclassify",
              factors: [
                f("Parked beyond the threshold", 0.3, true),
                f("Remitter identified from the narration", 0.4, true),
                f("Customer has open invoices", 0.3, ctx.customersWithOpenInvoices.has(named.id)),
              ],
              rationale: `Receipt of ${amount} parked ${ageDays} days; the narration names ${named.name}. Apply it to the customer's open invoices in Cash Application.`,
              nextStep: "Apply to the customer in Cash Application",
            }
          : {
              action: "Follow up",
              factors: [f("Parked beyond the threshold", 0.5, true), f("Remitter not identifiable", 0.5, true)],
              rationale: `Receipt of ${amount} parked ${ageDays} days with no identifiable remitter. Ask the bank for remitter details.`,
              nextStep: "Obtain remitter details from the bank",
            };
      }
      if (item.gl === "171400") {
        return {
          action: "Reclassify",
          factors: [f("Bank charge debited by the bank", 0.5, true), f("Small amount", 0.3, Math.abs(item.amount) < 25_000), f("Parked beyond the threshold", 0.2, true)],
          rationale: `Bank charge of ${amount} awaiting allocation for ${ageDays} days. Reclassify to bank charges.`,
          nextStep: "Reclassify to bank charges expense",
        };
      }
      const steps: Record<string, string> = {
        "171100": "Investigate and post to the correct account",
        "171300": "Confirm the bank debit or reissue the payment",
        "171500": "Confirm receipt in the destination account",
      };
      return {
        action: "Follow up",
        factors: [f("Parked beyond the threshold", 0.5, true), f("Manual posting", 0.25, item.manual), f("Has a supporting reference", 0.25, !!item.assignment)],
        rationale: `${amount} parked in ${gl.description.toLowerCase()} for ${ageDays} days.`,
        nextStep: steps[item.gl] ?? "Investigate and clear",
      };
    }
    case "BSR-12":
      return {
        action: "Follow up",
        factors: [f("Manual entry", 0.3, item.manual), f("Exact round amount", 0.4, true), f("Balance-sheet account", 0.3, true)],
        rationale: `Manual entry of exactly ${amount} by ${item.enteredBy}. Round amounts often indicate estimates; obtain the working behind it.`,
        nextStep: `Obtain the supporting working from ${item.enteredBy}`,
      };
    case "BSR-13":
      return {
        action: "Follow up",
        factors: [f("Manual entry", 0.3, true), f("Entered after the period end", 0.35, hit.facts.lateEntry === true), f("Entered outside working hours", 0.35, hit.facts.afterHours === true)],
        rationale: `Manual entry posted ${fmtDate(item.postingDate)} ${hit.facts.lateEntry ? `but entered ${fmtDate(item.entryDate)}` : `at ${item.entryTime}`}. Confirm cut-off and approval.`,
        nextStep: "Confirm cut-off and approval of the entry",
      };
    case "BSR-14":
      return {
        action: "Follow up",
        factors: [f(`Account quiet for ${num(hit, "quietDays")} days`, 0.6, true), f("Manual entry", 0.4, item.manual)],
        rationale: `First posting on ${gl.description.toLowerCase()} in ${num(hit, "quietDays")} days. Confirm the account is the right one.`,
        nextStep: "Confirm the account and support",
      };
    case "BSR-15":
      return {
        action: "Follow up",
        factors: [f("Moved across three or more accounts", 0.6, true), f("Manual reclassifications", 0.4, item.manual)],
        rationale: `${item.assignment} has been moved across ${num(hit, "accountCount")} accounts (${str(hit, "accounts")}). Resolve it at source instead of moving it again.`,
        nextStep: "Resolve the underlying item",
      };
    case "BSR-17":
    case "BSR-18":
      return {
        action: "Follow up",
        factors: [f("Unpaid beyond the window", 0.6, true), f("Vendor active", 0.4, partnerActive)],
        rationale: hit.ruleId === "BSR-18"
          ? `Invoice of ${amount} from a ${str(hit, "msme").toLowerCase()} enterprise unpaid ${ageDays} days. Pay now; the expense may be disallowed until paid.`
          : `Supplier invoice of ${amount} unpaid ${ageDays} days; input tax credit must be reversed if it stays unpaid.`,
        nextStep: hit.ruleId === "BSR-18" ? "Pay the supplier" : "Pay or reverse input tax credit",
      };
    default: {
      const steps: Partial<Record<string, string>> = {
        "trade-recv": "Chase collection; consider expected credit loss",
        "trade-pay": "Confirm with the vendor, then pay or clear",
        grir: "Confirm invoice status with the vendor",
        "vendor-adv": "Confirm the delivery schedule with the vendor",
        "customer-adv": "Confirm billing against the advance",
        deposits: "Confirm refund status",
        cwip: "Confirm the capitalisation date",
        "employee-adv": "Settle the advance or recover from salary",
        intercompany: "Confirm the balance with the group company",
        retention: "Confirm the release date",
        unbilled: "Confirm the billing milestone",
        "tds-recv": "Check the tax statement once available",
      };
      return {
        action: "Follow up",
        factors: [f("Older than the review threshold", 0.35, true), f("Business partner active", 0.2, partnerActive), f("No open follow-up", 0.15, !openFollowUp)],
        rationale: `${amount} open ${ageDays} days on ${gl.description.toLowerCase()}${partner ? ` - ${partner.name}` : ""}.`,
        nextStep: steps[gl.category] ?? "Review and document",
      };
    }
  }
}

export function recommend(run: RuleRun, itemKey: string, openFollowUps: ReadonlySet<string>): Recommendation | undefined {
  const hits = run.byItem.get(itemKey);
  const item = run.items.get(itemKey);
  if (!hits?.length || !item) return undefined;
  const primary = [...hits].sort((a, b) => RULE_PRIORITY.indexOf(a.ruleId) - RULE_PRIORITY.indexOf(b.ruleId))[0];
  const d = draft(run.ctx, item, primary, hits, openFollowUps.has(itemKey));
  let confidence = Math.round(d.factors.reduce((s, x) => s + (x.met ? x.weight : 0), 0) * 100) / 100;
  let action = d.action;
  let rationale = d.rationale;
  let nextStep = d.nextStep;
  if (action !== "Follow up" && confidence < WEAK) {
    rationale = `Evidence is not yet strong enough to ${action.toLowerCase()}. ${d.rationale}`;
    nextStep = `Gather evidence before proposing to ${action.toLowerCase()}`;
    action = "Follow up";
  }
  confidence = Math.min(1, confidence);
  const category = run.ctx.gl.get(item.gl)!.category;
  return {
    itemKey,
    action,
    primaryRuleId: primary.ruleId,
    confidence,
    factors: d.factors,
    rationale,
    nextStep,
    requiresTaxReview: action === "Write back" || (action === "Write off" && (category === "tds-recv" || category === "gst")),
    approvalBandId: bandFor(item.amount).id,
  };
}

export function recommendAll(run: RuleRun, openFollowUps: ReadonlySet<string>): Map<string, Recommendation> {
  const out = new Map<string, Recommendation>();
  for (const key of run.byItem.keys()) {
    const r = recommend(run, key, openFollowUps);
    if (r) out.set(key, r);
  }
  return out;
}

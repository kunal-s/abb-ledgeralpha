// Balance Sheet Review rule library - product defaults (docs/FRD.md §6.6).
// Each rule is a definition (data) plus a deterministic evaluator. Reasons are
// built from the item's own facts so the queue reads in plain language.

import type { LineItem, RuleDefinition, RuleHit, FactValue } from "@/types";
import { daysBetween, fmtDate, addDays } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { LOCALISATION } from "@/config/localisation";
import { latestUpTo, type EvalContext } from "@/engine/context";
import { allocateTdsCredits, taxYearsElapsed } from "@/engine/tds";

type Params = Record<string, number>;
export type Evaluator = (ctx: EvalContext, p: Params) => RuleHit[];

const TAX = LOCALISATION.taxes.withholding.label; // "TDS"
const TAX_STATEMENT = "Form 26AS";

const age = (ctx: EvalContext, l: LineItem) => daysBetween(l.postingDate, ctx.asOf);
const cat = (ctx: EvalContext, l: LineItem) => ctx.gl.get(l.gl)!.category;
const partyName = (ctx: EvalContext, l: LineItem) => (l.partner ? ctx.party.get(l.partner.id)?.name ?? l.partner.id : undefined);

function make(ruleId: string, l: LineItem, reason: string, facts: Record<string, FactValue>): RuleHit {
  return { ruleId, itemKey: l.key, reason, facts: { amount: l.amount, ...facts } };
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------
export const BSR_RULES: RuleDefinition[] = [
  {
    id: "BSR-01", module: "balance-sheet-review", name: "Aged beyond review threshold",
    scope: "Open items on open-item-managed accounts, except retention (judged against its defect liability period, BSR-09)",
    logic: "Open longer than the review threshold",
    categories: "all", severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "ageDays", label: "Older than", value: 180, unit: "days" },
      { key: "minAmount", label: "Amount at least", value: 0, unit: "amount" },
    ],
    basis: "Review policy",
  },
  {
    id: "BSR-02", module: "balance-sheet-review", name: "Received, not invoiced",
    scope: "GR/IR credits",
    logic: "Goods received long ago, never invoiced, and the PO is closed or idle",
    categories: ["grir"], severity: "high", candidateAction: "Write back", enabledByDefault: true,
    params: [
      { key: "ageDays", label: "Received more than", value: 365, unit: "days" },
      { key: "poIdleDays", label: "PO idle for more than", value: 180, unit: "days" },
    ],
    basis: "Liability no longer expected to be settled; a write-back is taxable income",
  },
  {
    id: "BSR-03", module: "balance-sheet-review", name: "Counter-item available",
    scope: "GR/IR and suspense items",
    logic: "A debit and a credit on the same PO line or assignment that offset within tolerance",
    categories: ["grir", "suspense"], severity: "low", candidateAction: "Clear", enabledByDefault: true,
    params: [
      { key: "toleranceAmount", label: "Tolerance", value: 100, unit: "amount" },
      { key: "tolerancePct", label: "or", value: 0.5, unit: "%" },
    ],
    basis: "Mechanical clearing gap",
  },
  {
    id: "BSR-04", module: "balance-sheet-review", name: "Invoiced, not received",
    scope: "GR/IR debits",
    logic: "Invoice posted against the PO with no goods receipt since",
    categories: ["grir"], severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [{ key: "ageDays", label: "Invoiced more than", value: 90, unit: "days" }],
    basis: "Goods receipt or price variance pending",
  },
  {
    id: "BSR-05", module: "balance-sheet-review", name: "Stale vendor advance",
    scope: "Advances to suppliers",
    logic: "Old advance with no deliveries against the PO; checks for a valid advance-payment BG",
    categories: ["vendor-adv"], severity: "high", candidateAction: "Provide", enabledByDefault: true,
    params: [
      { key: "ageDays", label: "Paid more than", value: 365, unit: "days" },
      { key: "poIdleDays", label: "No PO activity for", value: 180, unit: "days" },
    ],
    basis: "A material advance should be secured by an advance-payment BG",
  },
  {
    id: "BSR-06", module: "balance-sheet-review", name: "Stale customer advance",
    scope: "Advances from customers",
    logic: "Old advance where the project is closed or nothing has been billed for a long time",
    categories: ["customer-adv"], severity: "high", candidateAction: "Write back", enabledByDefault: true,
    params: [
      { key: "ageDays", label: "Received more than", value: 365, unit: "days" },
      { key: "noBillingDays", label: "No billing for", value: 365, unit: "days" },
    ],
    basis: "Ind AS 115 contract liability",
  },
  {
    id: "BSR-07", module: "balance-sheet-review", name: `${TAX} credit missing`,
    scope: `${TAX} receivable`,
    logic: `Deduction not reflected in ${TAX_STATEMENT} once the quarter's statement is available`,
    categories: ["tds-recv"], severity: "high", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "statementLagDays", label: "Statement available after quarter end", value: 75, unit: "days" },
      { key: "toleranceAmount", label: "Match tolerance", value: 10, unit: "amount" },
      { key: "writeOffYears", label: "Write off when older than", value: 3, unit: "years" },
    ],
    basis: `Credit follows the ${TAX_STATEMENT}; section references to be verified`,
  },
  {
    id: "BSR-08", module: "balance-sheet-review", name: "Stale unbilled revenue",
    scope: "Unbilled revenue",
    logic: "Nothing billed on the project for a long time, or the project is on hold",
    categories: ["unbilled"], severity: "high", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "noBillingDays", label: "No billing for", value: 180, unit: "days" },
      { key: "provideAfterDays", label: "Provide when on hold for more than", value: 365, unit: "days" },
    ],
    basis: "Ind AS 115 contract asset; Ind AS 109 expected credit loss",
  },
  {
    id: "BSR-09", module: "balance-sheet-review", name: "Retention overdue",
    scope: "Retention receivable",
    logic: "Defect liability period over and retention not released",
    categories: ["retention"], severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "graceDays", label: "Days after DLP end", value: 90, unit: "days" },
      { key: "provideAfterDays", label: "Provide when past DLP by", value: 365, unit: "days" },
    ],
    basis: "Retention is released after DLP and final acceptance",
  },
  {
    id: "BSR-10", module: "balance-sheet-review", name: "Suspense or clearing aged",
    scope: "Suspense and clearing accounts",
    logic: "Item still parked in a suspense or clearing account",
    categories: ["suspense"], severity: "medium", candidateAction: "Reclassify", enabledByDefault: true,
    params: [{ key: "ageDays", label: "Older than", value: 45, unit: "days" }],
    basis: "Suspense should be transient",
  },
  {
    id: "BSR-11", module: "balance-sheet-review", name: "Wrong sign",
    scope: "Open items on one-sided accounts",
    logic: "Item opposite to the account's normal balance",
    categories: ["vendor-adv", "customer-adv", "unbilled", "retention", "tds-recv", "deposits", "employee-adv", "cwip", "statutory-dues"],
    severity: "medium", candidateAction: "Reclassify", enabledByDefault: true,
    params: [{ key: "minAmount", label: "Amount at least", value: 10_000, unit: "amount" }],
  },
  {
    id: "BSR-12", module: "balance-sheet-review", name: "Round-number manual entry",
    scope: "Manual entries on balance-sheet accounts in the review period",
    logic: "Exact multiple of a round amount",
    categories: "all", severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "minAmount", label: "Amount at least", value: 1_00_000, unit: "amount" },
      { key: "roundTo", label: "Multiple of", value: 1_00_000, unit: "amount" },
    ],
    basis: "Estimate or plug indicator",
  },
  {
    id: "BSR-13", module: "balance-sheet-review", name: "After-hours or late manual entry",
    scope: "Manual entries on balance-sheet accounts in the review period",
    logic: "Entered outside working hours, or entered after the period end with a posting date inside it",
    categories: "all", severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "lateHour", label: "Entered at or after", value: 22, unit: "count" },
      { key: "earlyHour", label: "Entered before", value: 6, unit: "count" },
    ],
    basis: "Cut-off and override risk",
  },
  {
    id: "BSR-14", module: "balance-sheet-review", name: "Posting to a dormant account",
    scope: "Balance-sheet postings in the review period",
    logic: "No other posting on the account for a long time before this one",
    categories: "all", severity: "low", candidateAction: "Follow up", enabledByDefault: true,
    params: [{ key: "dormantDays", label: "Quiet for more than", value: 180, unit: "days" }],
  },
  {
    id: "BSR-15", module: "balance-sheet-review", name: "Account-to-account churn",
    scope: "Manual balance-sheet entries with an assignment",
    logic: "The same assignment moved across several accounts",
    categories: "all", severity: "medium", candidateAction: "Follow up", enabledByDefault: true,
    params: [
      { key: "minAccounts", label: "Accounts at least", value: 3, unit: "count" },
      { key: "windowDays", label: "Within", value: 180, unit: "days" },
    ],
    basis: "Items moved rather than resolved",
  },
  {
    id: "BSR-16", module: "balance-sheet-review", name: "Statutory dues overdue",
    scope: "Statutory dues payable",
    logic: "Deducted or collected but not deposited",
    categories: ["statutory-dues"], severity: "high", candidateAction: "Follow up", enabledByDefault: true,
    params: [{ key: "ageDays", label: "Open more than", value: 180, unit: "days" }],
    basis: "Undisputed statutory dues over six months are reportable under CARO 2020 cl. 3(vii)(a)",
  },
  {
    id: "BSR-17", module: "balance-sheet-review", name: `${LOCALISATION.taxes.indirect.label} credit at risk`,
    scope: "Domestic supplier invoices",
    logic: "Supplier invoice unpaid beyond the payment window for input tax credit",
    categories: ["trade-pay"], severity: "medium", candidateAction: "Follow up", enabledByDefault: false,
    params: [{ key: "ageDays", label: "Unpaid more than", value: 180, unit: "days" }],
    basis: "CGST Act s.16(2), second proviso",
  },
  {
    id: "BSR-18", module: "balance-sheet-review", name: "MSME payable overdue",
    scope: "Invoices from micro and small enterprises",
    logic: "Unpaid beyond the statutory payment window",
    categories: ["trade-pay"], severity: "medium", candidateAction: "Follow up", enabledByDefault: false,
    params: [{ key: "paymentDays", label: "Unpaid more than", value: 45, unit: "days" }],
    basis: "MSMED Act s.15; income-tax disallowance (reference to be verified)",
  },
];

// ---------------------------------------------------------------------------
// Evaluators
// ---------------------------------------------------------------------------
const ONE_SIDED = new Set(BSR_RULES.find((r) => r.id === "BSR-11")!.categories as string[]);

export const BSR_EVALUATORS: Record<string, Evaluator> = {
  "BSR-01": (ctx, p) =>
    ctx.open
      // retention is held until the defect liability period ends, so its age alone is not a finding
      .filter((l) => cat(ctx, l) !== "retention" && age(ctx, l) > p.ageDays && Math.abs(l.amount) >= p.minAmount)
      .map((l) => make("BSR-01", l, `Open ${age(ctx, l)} days since ${fmtDate(l.postingDate)}`, { ageDays: age(ctx, l) })),

  "BSR-02": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      if (cat(ctx, l) !== "grir" || l.amount >= 0 || !l.po) continue;
      const a = age(ctx, l);
      if (a <= p.ageDays) continue;
      const ps = ctx.po.get(`${l.po.number}/${l.po.item}`);
      const invoiced = ps?.lastInvoiceDate && ps.lastInvoiceDate >= l.postingDate && ps.lastInvoiceDate <= ctx.asOf;
      if (invoiced) continue;
      const last = latestUpTo(ctx.asOf, ps?.lastGrDate, ps?.lastInvoiceDate) ?? l.postingDate;
      const idle = daysBetween(last, ctx.asOf);
      const status = ps?.status ?? "Open";
      if (status === "Open" && idle <= p.poIdleDays) continue;
      hits.push(make("BSR-02", l, `Goods received ${a} days ago on PO ${l.po.number}; never invoiced; PO ${status === "Open" ? `idle ${idle} days` : status.toLowerCase()}`, {
        ageDays: a, po: l.po.number, poStatus: status, poIdleDays: idle, vendorStatus: l.partner ? ctx.party.get(l.partner.id)?.status ?? "" : "",
      }));
    }
    return hits;
  },

  "BSR-03": (ctx, p) => {
    const groups = new Map<string, LineItem[]>();
    for (const l of ctx.open) {
      const c = cat(ctx, l);
      const k = c === "grir" && l.po ? `${l.gl}|${l.po.number}/${l.po.item}` : c === "suspense" && l.assignment ? `${l.gl}|${l.assignment}` : null;
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), l]);
    }
    const hits: RuleHit[] = [];
    for (const items of groups.values()) {
      const debits = items.filter((i) => i.amount > 0);
      const credits = items.filter((i) => i.amount < 0);
      for (const c of credits) {
        const d = debits.find((x) => Math.abs(x.amount + c.amount) <= Math.max(p.toleranceAmount, (Math.abs(c.amount) * p.tolerancePct) / 100));
        if (!d) continue;
        debits.splice(debits.indexOf(d), 1);
        const net = d.amount + c.amount;
        const ref = c.po ? `PO ${c.po.number}` : `assignment ${c.assignment}`;
        hits.push(make("BSR-03", c, `Offsets document ${d.docNo} (${fmtINR(d.amount)}) on ${ref}`, { counterKey: d.key, net, ageDays: age(ctx, c) }));
        hits.push(make("BSR-03", d, `Offsets document ${c.docNo} (${fmtINR(c.amount)}) on ${ref}`, { counterKey: c.key, net, ageDays: age(ctx, d) }));
      }
    }
    return hits;
  },

  "BSR-04": (ctx, p) =>
    ctx.open
      .filter((l) => cat(ctx, l) === "grir" && l.amount > 0 && l.po && age(ctx, l) > p.ageDays)
      .filter((l) => {
        const ps = ctx.po.get(`${l.po!.number}/${l.po!.item}`);
        return !(ps?.lastGrDate && ps.lastGrDate >= l.postingDate && ps.lastGrDate <= ctx.asOf);
      })
      .map((l) => make("BSR-04", l, `Invoiced ${age(ctx, l)} days ago on PO ${l.po!.number}; no goods receipt since`, {
        ageDays: age(ctx, l), po: l.po!.number, poStatus: ctx.po.get(`${l.po!.number}/${l.po!.item}`)?.status ?? "Open",
      })),

  "BSR-05": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      if (cat(ctx, l) !== "vendor-adv" || l.amount <= 0) continue;
      const a = age(ctx, l);
      if (a <= p.ageDays) continue;
      const ps = l.po ? ctx.po.get(`${l.po.number}/${l.po.item}`) : undefined;
      const since = [ps?.lastGrDate, ps?.lastInvoiceDate].filter((d) => d && d >= l.postingDate);
      const last = latestUpTo(ctx.asOf, ...since);
      const idle = last ? daysBetween(last, ctx.asOf) : a;
      if (idle <= p.poIdleDays) continue;
      const bg = (l.po ? ctx.bgByPo.get(l.po.number) ?? [] : []).find(
        (b) => b.direction === "Received" && b.type === "Advance payment" && b.validTo >= ctx.asOf
      );
      const vendor = l.partner ? ctx.party.get(l.partner.id) : undefined;
      hits.push(make("BSR-05", l,
        `Advance paid ${a} days ago; no deliveries against PO ${l.po?.number ?? "-"} for ${idle} days; ${bg ? `covered by BG ${bg.bgNo} valid to ${fmtDate(bg.validTo)}` : "no bank guarantee held"}`,
        {
          ageDays: a, po: l.po?.number ?? "", poStatus: ps?.status ?? "Open", poIdleDays: idle, vendorStatus: vendor?.status ?? "",
          bgNo: bg?.bgNo ?? "", bgValidTo: bg?.validTo ?? "", bgAmount: bg?.amount ?? 0,
        }));
    }
    return hits;
  },

  "BSR-06": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      if (cat(ctx, l) !== "customer-adv" || l.amount >= 0) continue;
      const a = age(ctx, l);
      if (a <= p.ageDays) continue;
      const project = l.wbs ? ctx.project.get(l.wbs) : undefined;
      const closed = project && (project.stage === "Closed" || project.stage === "DLP ended");
      const lastBill = l.wbs ? ctx.lastBillingByWbs.get(l.wbs) : l.partner ? ctx.lastBillingByCustomer.get(l.partner.id) : undefined;
      const sinceBill = lastBill ? daysBetween(lastBill, ctx.asOf) : a;
      if (!closed && sinceBill <= p.noBillingDays) continue;
      hits.push(make("BSR-06", l,
        `Advance received ${a} days ago; ${closed ? `project ${project!.stage.toLowerCase()}` : `nothing billed for ${sinceBill} days`}`,
        { ageDays: a, projectStage: project?.stage ?? "", daysSinceBilling: sinceBill }));
    }
    return hits;
  },

  "BSR-07": (ctx, p) => {
    const hits: RuleHit[] = [];
    // deductions already claimed use up their statement lines first, so the open ones are checked against what is left
    const { byLine } = allocateTdsCredits(ctx.tdsLines, ctx.creditsByCustomer, ctx.party, ctx.asOf, { statementLagDays: p.statementLagDays, toleranceAmount: p.toleranceAmount });
    const lines = ctx.open.filter((l) => cat(ctx, l) === "tds-recv" && l.amount > 0 && l.partner);
    for (const l of lines) {
      const a = byLine.get(l.key);
      if (!a || (a.status !== "missing" && a.status !== "short" && a.status !== "wrong-quarter")) continue;
      const status = a.status === "short" ? "short credit" : a.status === "wrong-quarter" ? "credited in another quarter" : "missing";
      const reason =
        a.status === "missing" ? `Deduction of ${fmtINR(l.amount)} for ${a.quarter} not in ${TAX_STATEMENT}`
        : a.status === "short" ? `${TAX_STATEMENT} shows ${fmtINR(a.credited)} of ${fmtINR(l.amount)} for ${a.quarter}`
        : `Credited in ${a.statementQuarter} instead of ${a.quarter}`;
      hits.push(make("BSR-07", l, reason, {
        quarter: a.quarter, creditStatus: status, credited: a.credited,
        taxYearsElapsed: taxYearsElapsed(l.postingDate, ctx.asOf), writeOffYears: p.writeOffYears, ageDays: age(ctx, l),
        deductor: ctx.party.get(l.partner!.id)?.deductorIdMasked ?? "",
      }));
    }
    return hits;
  },

  "BSR-08": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      if (cat(ctx, l) !== "unbilled" || l.amount <= 0) continue;
      const project = l.wbs ? ctx.project.get(l.wbs) : undefined;
      const lastBill = l.wbs ? ctx.lastBillingByWbs.get(l.wbs) : undefined;
      const since = lastBill ? daysBetween(lastBill, ctx.asOf) : age(ctx, l);
      const onHold = project?.stage === "On hold";
      if (since <= p.noBillingDays && !onHold) continue;
      hits.push(make("BSR-08", l,
        `${onHold ? "Project on hold; " : ""}nothing billed for ${since} days${lastBill ? ` (last billed ${fmtDate(lastBill)})` : ""}`,
        { daysSinceBilling: since, projectStage: project?.stage ?? "", provideAfterDays: p.provideAfterDays, ageDays: age(ctx, l) }));
    }
    return hits;
  },

  "BSR-09": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      if (cat(ctx, l) !== "retention" || l.amount <= 0 || !l.wbs) continue;
      const project = ctx.project.get(l.wbs);
      if (!project?.dlpEnd || project.dlpEnd > ctx.asOf) continue;
      const past = daysBetween(project.dlpEnd, ctx.asOf);
      if (past <= p.graceDays) continue;
      hits.push(make("BSR-09", l, `Defect liability period ended ${fmtDate(project.dlpEnd)} (${past} days ago); retention not released`, {
        daysPastDlp: past, provideAfterDays: p.provideAfterDays, projectStage: project.stage, ageDays: age(ctx, l),
      }));
    }
    return hits;
  },

  "BSR-10": (ctx, p) =>
    ctx.open
      .filter((l) => cat(ctx, l) === "suspense" && age(ctx, l) > p.ageDays)
      .map((l) => make("BSR-10", l, `Parked in ${ctx.gl.get(l.gl)!.description.toLowerCase()} for ${age(ctx, l)} days`, { ageDays: age(ctx, l), narration: l.text ?? "" })),

  "BSR-11": (ctx, p) =>
    ctx.open
      .filter((l) => ONE_SIDED.has(cat(ctx, l)) && Math.abs(l.amount) >= p.minAmount)
      .filter((l) => (ctx.gl.get(l.gl)!.normalBalance === "Dr" ? l.amount < 0 : l.amount > 0))
      .map((l) => make("BSR-11", l, `${l.amount < 0 ? "Credit" : "Debit"} of ${fmtINR(Math.abs(l.amount))} on a ${ctx.gl.get(l.gl)!.normalBalance === "Dr" ? "debit" : "credit"}-balance account${partyName(ctx, l) ? ` - ${partyName(ctx, l)}` : ""}`, {
        docType: l.docType, ageDays: age(ctx, l),
      })),

  "BSR-12": (ctx, p) =>
    ctx.reviewLines
      .filter((l) => l.manual && Math.abs(l.amount) >= p.minAmount && Math.abs(l.amount) % p.roundTo === 0)
      .map((l) => make("BSR-12", l, `Manual entry of exactly ${fmtINR(Math.abs(l.amount))} by ${l.enteredBy}`, { enteredBy: l.enteredBy })),

  "BSR-13": (ctx, p) =>
    ctx.reviewLines
      .filter((l) => l.manual)
      .flatMap((l) => {
        const hour = l.entryTime ? Number(l.entryTime.slice(0, 2)) : 12;
        const afterHours = hour >= p.lateHour || hour < p.earlyHour;
        const late = l.entryDate > ctx.asOf;
        if (!afterHours && !late) return [];
        const reason = late
          ? `Entered ${fmtDate(l.entryDate)}, after the period end, with posting date ${fmtDate(l.postingDate)}`
          : `Entered at ${l.entryTime} on ${fmtDate(l.entryDate)} by ${l.enteredBy}`;
        return [make("BSR-13", l, reason, { entryDate: l.entryDate, entryTime: l.entryTime ?? "", enteredBy: l.enteredBy, lateEntry: late, afterHours })];
      }),

  "BSR-14": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.reviewLines) {
      const dates = ctx.glPostingDates.get(l.gl) ?? [];
      // latest posting strictly before this line's posting date
      let lo = 0;
      let hi = dates.length - 1;
      let prev: string | undefined;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (dates[mid] < l.postingDate) {
          prev = dates[mid];
          lo = mid + 1;
        } else hi = mid - 1;
      }
      if (!prev) continue;
      const quiet = daysBetween(prev, l.postingDate);
      if (quiet <= p.dormantDays) continue;
      hits.push(make("BSR-14", l, `First posting on this account in ${quiet} days (previous ${fmtDate(prev)})`, { quietDays: quiet, previousPosting: prev }));
    }
    return hits;
  },

  "BSR-15": (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const lines of ctx.manualByAssignment.values()) {
      const inPeriod = lines.filter((l) => l.postingDate > ctx.reviewFrom && l.postingDate <= ctx.asOf);
      if (!inPeriod.length) continue;
      const latest = inPeriod.reduce((m, l) => (l.postingDate > m.postingDate || (l.postingDate === m.postingDate && l.amount < m.amount) ? l : m));
      const windowStart = addDays(latest.postingDate, -p.windowDays);
      const gls = new Set(lines.filter((l) => l.postingDate >= windowStart && l.postingDate <= latest.postingDate).map((l) => l.gl));
      if (gls.size < p.minAccounts) continue;
      hits.push(make("BSR-15", latest, `Assignment ${latest.assignment} moved across ${gls.size} accounts within ${p.windowDays} days`, {
        accounts: [...gls].join(", "), accountCount: gls.size,
      }));
    }
    return hits;
  },

  "BSR-16": (ctx, p) =>
    ctx.open
      .filter((l) => cat(ctx, l) === "statutory-dues" && l.amount < 0 && age(ctx, l) > p.ageDays)
      .map((l) => make("BSR-16", l, `${ctx.gl.get(l.gl)!.description} of ${fmtINR(-l.amount)} open ${age(ctx, l)} days - not deposited`, { ageDays: age(ctx, l) })),

  "BSR-17": (ctx, p) =>
    ctx.open
      .filter((l) => l.gl === "210100" && l.amount < 0 && l.partner && ctx.party.get(l.partner.id)?.indirectTaxIdMasked && daysBetween(l.documentDate, ctx.asOf) > p.ageDays)
      .map((l) => make("BSR-17", l, `Supplier invoice unpaid ${daysBetween(l.documentDate, ctx.asOf)} days - input tax credit at risk`, { ageDays: daysBetween(l.documentDate, ctx.asOf) })),

  "BSR-18": (ctx, p) =>
    ctx.open
      .filter((l) => {
        if (!l.gl.startsWith("2101") || l.amount >= 0 || !l.partner) return false;
        const v = ctx.party.get(l.partner.id);
        return (v?.msme === "Micro" || v?.msme === "Small") && age(ctx, l) > p.paymentDays;
      })
      .map((l) => make("BSR-18", l, `${ctx.party.get(l.partner!.id)!.msme} enterprise invoice unpaid ${age(ctx, l)} days`, { ageDays: age(ctx, l), msme: ctx.party.get(l.partner!.id)!.msme ?? "" })),
};

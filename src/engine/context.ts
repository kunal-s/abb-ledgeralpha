// Evaluation context: the indexes rules and recommenders need, built once per
// as-at date from the loaded world. Rules are deterministic functions of this
// context and their parameters (docs/FRD.md §4.2).

import type { BankGuarantee, GlAccount, IsoDate, LineItem, Party, Project, PurchaseOrderStatus, TaxCreditStatementLine } from "@/types";
import { WORLD, GL_BY_ID, PARTY_BY_ID, PROJECT_BY_WBS, isOpenAt } from "@/data";
import { addDays, fiscalYearStartDate, monthEnd } from "@/lib/dates";
import { TENANT } from "@/config/tenant";

export interface EvalContext {
  asOf: IsoDate;
  /** last day of the previous fiscal quarter - the review period runs from the day after */
  reviewFrom: IsoDate;
  open: LineItem[];
  /** balance-sheet lines posted in the review period */
  reviewLines: LineItem[];
  gl: Map<string, GlAccount>;
  party: Map<string, Party>;
  project: Map<string, Project>;
  po: Map<string, PurchaseOrderStatus>;
  bgByPo: Map<string, BankGuarantee[]>;
  creditsByCustomer: Map<string, TaxCreditStatementLine[]>;
  lastBillingByWbs: Map<string, IsoDate>;
  lastBillingByCustomer: Map<string, IsoDate>;
  /** sorted posting dates per GL (all lines up to as-at) */
  glPostingDates: Map<string, IsoDate[]>;
  /** manual balance-sheet lines by assignment */
  manualByAssignment: Map<string, LineItem[]>;
  /** customers with at least one open receivable */
  customersWithOpenInvoices: Set<string>;
}

const cache = new Map<IsoDate, EvalContext>();

/** Last day of the fiscal quarter before the one containing `asOf`. */
export function previousQuarterEnd(asOf: IsoDate, fyStartMonth = TENANT.fiscalYear.startMonth): IsoDate {
  const fyStart = fiscalYearStartDate(asOf, fyStartMonth);
  let qStart = fyStart;
  for (let i = 0; i < 4; i++) {
    const next = addDays(monthEnd(addDays(monthEnd(addDays(monthEnd(qStart), 1)), 1)), 1);
    if (next > asOf) break;
    qStart = next;
  }
  return addDays(qStart, -1);
}

export function buildContext(asOf: IsoDate): EvalContext {
  const cached = cache.get(asOf);
  if (cached) return cached;

  const reviewFrom = previousQuarterEnd(asOf);
  const open: LineItem[] = [];
  const reviewLines: LineItem[] = [];
  const lastBillingByWbs = new Map<string, IsoDate>();
  const lastBillingByCustomer = new Map<string, IsoDate>();
  const glPostingDates = new Map<string, IsoDate[]>();
  const manualByAssignment = new Map<string, LineItem[]>();

  for (const l of WORLD.lines) {
    if (l.postingDate > asOf) break; // lines are sorted by posting date
    const g = GL_BY_ID.get(l.gl)!;
    const dates = glPostingDates.get(l.gl);
    if (dates) dates.push(l.postingDate);
    else glPostingDates.set(l.gl, [l.postingDate]);

    if (g.openItemManaged && isOpenAt(l, asOf)) open.push(l);
    if (g.category !== "pl" && l.postingDate > reviewFrom) reviewLines.push(l);
    if (l.docType === "DR" && (l.gl === "140100" || l.gl === "142100") && l.amount > 0) {
      if (l.wbs) lastBillingByWbs.set(l.wbs, l.postingDate);
      if (l.partner) lastBillingByCustomer.set(l.partner.id, l.postingDate);
    }
    if (l.manual && l.assignment && g.category !== "pl") {
      const list = manualByAssignment.get(l.assignment) ?? [];
      list.push(l);
      manualByAssignment.set(l.assignment, list);
    }
  }

  const bgByPo = new Map<string, BankGuarantee[]>();
  for (const bg of WORLD.bankGuarantees) {
    if (!bg.linkedPo) continue;
    bgByPo.set(bg.linkedPo, [...(bgByPo.get(bg.linkedPo) ?? []), bg]);
  }
  const creditsByCustomer = new Map<string, TaxCreditStatementLine[]>();
  for (const c of WORLD.taxCredits) {
    if (c.transactionDate > asOf) continue;
    creditsByCustomer.set(c.customerId, [...(creditsByCustomer.get(c.customerId) ?? []), c]);
  }

  const ctx: EvalContext = {
    asOf,
    reviewFrom,
    open,
    reviewLines,
    gl: GL_BY_ID,
    party: PARTY_BY_ID,
    project: PROJECT_BY_WBS,
    po: new Map(WORLD.purchaseOrders.map((p) => [`${p.po}/${p.item}`, p])),
    bgByPo,
    creditsByCustomer,
    lastBillingByWbs,
    lastBillingByCustomer,
    glPostingDates,
    manualByAssignment,
    customersWithOpenInvoices: new Set(open.filter((l) => l.gl === "140100" && l.amount > 0 && l.partner).map((l) => l.partner!.id)),
  };
  cache.set(asOf, ctx);
  return ctx;
}

/** Latest of a set of optional dates, ignoring anything after as-at. */
export function latestUpTo(asOf: IsoDate, ...dates: (IsoDate | undefined)[]): IsoDate | undefined {
  return dates.filter((d): d is IsoDate => !!d && d <= asOf).sort().pop();
}

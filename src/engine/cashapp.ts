// Cash application matcher (docs/FRD.md §6.8). Given a receipt sitting in
// incoming-payments clearing and a customer's open invoices, it finds the
// invoices the receipt pays and explains the gap between them and the money
// received, line by line. Levels:
//   L1 reference     the remittance cites the invoice
//   L2 customer and amount   one open invoice equals the receipt
//   L3 deduction inferred    one invoice less withholding tax and bank charges
//   L4 combination   several invoices of the customer (or of one legal entity)
// Deterministic: the arithmetic is exact and every proposal carries the factors
// behind its confidence. Pure over the data it is given.

import type { ConfidenceFactor, IsoDate, JournalSpec, Party } from "@/types";
import { CASH_APP_POLICY as P } from "@/config/policies";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";
import { taxQuarterOf } from "@/engine/tds";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export interface InvoiceRef {
  key: string;
  docNo: string;
  reference: string;
  customerId: string;
  date: IsoDate;
  dueDate?: IsoDate;
  gross: number;
  /** value excluding GST: the base withholding tax is deducted on */
  taxable: number;
  profitCentre: string;
  wbs?: string;
}

export interface Receipt {
  key: string;
  docNo: string;
  /** positive, as received */
  amount: number;
  date: IsoDate;
  /** bank reference (UTR or cheque number) */
  utr?: string;
  narration: string;
  profitCentre: string;
}

export interface CashAppData {
  asOf: IsoDate;
  customers: Party[];
  /** tokens of each customer's name without legal suffixes */
  nameTokens: Map<string, string[]>;
  /** open invoices, oldest first */
  invoicesByCustomer: Map<string, InvoiceRef[]>;
  invoiceByRef: Map<string, InvoiceRef>;
  /** customer ids that belong to the same legal entity (same tax ID), including the customer itself */
  entityOf: Map<string, string[]>;
  /** the withholding rate a customer usually deducts, from its history */
  usualRate: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------
export type MatchLevel = "L1" | "L2" | "L3" | "L4";

export const LEVEL_LABELS: Record<MatchLevel, string> = {
  L1: "Reference",
  L2: "Customer and amount",
  L3: "Deduction inferred",
  L4: "Combination",
};

export type DeductionKind = "tds" | "gst-tds" | "bank-charges" | "small-difference";

export interface Deduction {
  kind: DeductionKind;
  label: string;
  amount: number;
  /** the arithmetic, in words */
  basis: string;
  rate?: number;
}

export interface Proposal {
  receiptKey: string;
  level: MatchLevel;
  customerId: string;
  /** how the customer was identified */
  customerBasis: string;
  invoices: InvoiceRef[];
  deductions: Deduction[];
  invoiceTotal: number;
  receipt: number;
  /** invoices less deductions less receipt: what remains unexplained (nil when fully explained) */
  residual: number;
  confidence: number;
  factors: ConfidenceFactor[];
  rationale: string;
  /** identifies the invoice set, so a rejected match is not proposed again */
  signature: string;
}

export interface Match {
  receipt: Receipt;
  /** best first; the first is the proposal when its confidence reaches the policy floor */
  proposals: Proposal[];
  /** customers the remittance could belong to, best first */
  customers: { customerId: string; score: number; basis: string }[];
}

export const signatureOf = (invoices: InvoiceRef[]) => invoices.map((i) => i.key).sort().join("+");

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pct = (r: number) => `${+(r * 100).toFixed(2)}%`;

// ---------------------------------------------------------------------------
// Customer identification
// ---------------------------------------------------------------------------
const SUFFIXES = new Set(["LTD", "LIMITED", "PVT", "PRIVATE", "INC", "LLP", "CO"]);

export function tokens(s: string): string[] {
  return s.toUpperCase().replace(/[^A-Z0-9/]+/g, " ").split(" ").filter(Boolean);
}

export const nameTokensOf = (name: string) => tokens(name).filter((t) => !SUFFIXES.has(t));

/**
 * How well the narration names the customer: 1 for the full name, high when the
 * bank cut it off, lower when only the first words match.
 */
function nameScore(narration: string[], name: string[]): { score: number; basis: string } {
  if (!name.length) return { score: 0, basis: "" };
  let best = 0;
  let basis = "";
  for (let i = 0; i < narration.length; i += 1) {
    let full = 0;
    while (full < name.length && i + full < narration.length && narration[i + full] === name[full]) full += 1;
    let partial = 0;
    if (full < name.length && i + full === narration.length - 1) {
      const last = narration[i + full];
      if (last.length >= 3 && name[full].startsWith(last)) partial = last.length / name[full].length;
    }
    if (full === 0 && partial === 0) continue;
    let score = (full + partial) / name.length;
    let how = `Remitter name starts like the customer's (${full} of ${name.length} words)`;
    if (full === name.length) {
      score = 1;
      how = "Remitter name is the customer's name";
    } else if (partial > 0 && (full >= 2 || (full >= 1 && narration[i + full].length >= 5))) {
      score = Math.max(score, 0.92);
      how = "Remitter name is the customer's name, cut off by the bank";
    }
    if (score > best) {
      best = score;
      basis = how;
    }
  }
  return { score: best, basis };
}

function identify(narration: string, d: CashAppData): Match["customers"] {
  const t = tokens(narration);
  const cited = new Map<string, string>();
  for (const tok of t) {
    const inv = d.invoiceByRef.get(tok);
    if (inv) cited.set(inv.customerId, inv.reference);
  }
  const out: Match["customers"] = [];
  for (const c of d.customers) {
    const ref = cited.get(c.id);
    if (ref) {
      out.push({ customerId: c.id, score: 1, basis: `Remittance cites invoice ${ref}` });
      continue;
    }
    const s = nameScore(t, d.nameTokens.get(c.id) ?? []);
    if (s.score >= 0.6) out.push({ customerId: c.id, score: s.score, basis: s.basis });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Explaining the gap
// ---------------------------------------------------------------------------
interface Recipe {
  rate: number;
  gst: boolean;
}

function recipesFor(govt: boolean): Recipe[] {
  const out: Recipe[] = [{ rate: 0, gst: false }];
  for (const rate of P.tdsRates) out.push({ rate, gst: false });
  if (govt) for (const rate of [0, ...P.tdsRates]) out.push({ rate, gst: true });
  return out;
}

interface Explained {
  deductions: Deduction[];
  /** unexplained amount after the deductions (positive: the receipt is short) */
  residual: number;
  /** explained to the rupee: no small difference was written off */
  exact: boolean;
}

/** Explain `receipt` as `invoices` less a withholding recipe, a standard bank charge or a small difference. */
function explain(invoices: InvoiceRef[], receipt: number, recipe: Recipe, allowShort = false): Explained | undefined {
  const gross = sum(invoices.map((i) => i.gross));
  const tds = recipe.rate > 0 ? sum(invoices.map((i) => Math.round(i.taxable * recipe.rate))) : 0;
  const gst = recipe.gst ? sum(invoices.map((i) => Math.round(i.taxable * P.gstTdsRate))) : 0;
  const left = gross - tds - gst - receipt;
  if (left < -P.exactTolerance) return undefined; // more received than the invoices can explain
  const small = Math.min(P.smallDifferenceMax, Math.round(gross * P.smallDifferencePct));
  const standard = left > P.exactTolerance ? P.standardBankCharges.find((c) => Math.abs(c - left) <= P.exactTolerance) : undefined;
  if (left > small && standard === undefined && !allowShort) return undefined;

  const taxable = sum(invoices.map((i) => i.taxable));
  const deductions: Deduction[] = [];
  if (tds > 0) deductions.push({ kind: "tds", label: `TDS ${pct(recipe.rate)}`, amount: tds, basis: `${pct(recipe.rate)} on taxable value ${fmtINR(taxable)}`, rate: recipe.rate });
  if (gst > 0) deductions.push({ kind: "gst-tds", label: `GST TDS ${pct(P.gstTdsRate)}`, amount: gst, basis: `${pct(P.gstTdsRate)} on taxable value ${fmtINR(taxable)}`, rate: P.gstTdsRate });
  if (left <= P.exactTolerance) return { deductions, residual: 0, exact: true };
  if (standard !== undefined) {
    deductions.push({ kind: "bank-charges", label: "Bank charges", amount: left, basis: `${fmtINR(left)} is a standard bank charge with GST` });
    return { deductions, residual: 0, exact: true };
  }
  if (left <= small) {
    deductions.push({ kind: "small-difference", label: "Bank charges and small difference", amount: left, basis: `${fmtINR(left)} is within the small-difference policy of ${fmtINR(small)}` });
    return { deductions, residual: 0, exact: false };
  }
  return { deductions, residual: left, exact: false };
}

/**
 * Index subsets of `nets` with up to `max` members whose sum lies in [lo, hi],
 * each in ascending index order. Sizes 3 and 4 are found by pairing, so a
 * customer with dozens of open invoices is searched in a few thousand steps.
 */
function windowSubsets(nets: number[], max: number, lo: number, hi: number): number[][] {
  const n = nets.length;
  const out: number[][] = [];
  if (lo <= 0 && hi >= 0) out.push([]);
  if (max >= 1) for (let i = 0; i < n; i += 1) if (nets[i] >= lo && nets[i] <= hi) out.push([i]);
  if (max < 2) return out;

  // every pair, by sum
  const pairs: { s: number; i: number; j: number }[] = [];
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) pairs.push({ s: nets[i] + nets[j], i, j });
  pairs.sort((a, b) => a.s - b.s);
  const first = (target: number) => {
    let a = 0;
    let b = pairs.length;
    while (a < b) {
      const m = (a + b) >> 1;
      if (pairs[m].s < target) a = m + 1;
      else b = m;
    }
    return a;
  };
  const inRange = (l: number, h: number, visit: (p: { s: number; i: number; j: number }) => void) => {
    for (let k = first(l); k < pairs.length && pairs[k].s <= h; k += 1) visit(pairs[k]);
  };

  inRange(lo, hi, (p) => out.push([p.i, p.j]));
  if (max >= 3) {
    for (let i = 0; i < n; i += 1) inRange(lo - nets[i], hi - nets[i], (p) => p.i > i && out.push([i, p.i, p.j]));
  }
  if (max >= 4) {
    for (const a of pairs) inRange(lo - a.s, hi - a.s, (p) => p.i > a.j && out.push([a.i, a.j, p.i, p.j]));
  }
  return out;
}

interface Candidate {
  invoices: InvoiceRef[];
  recipe: Recipe;
  explained: Explained;
  priority: number;
}

function factorsOf(c: Candidate, x: { cited: boolean; identified: boolean; competing: boolean; usual?: number }): ConfidenceFactor[] {
  const rate = c.recipe.rate;
  const ratesAgree = rate === 0 || (x.usual !== undefined && Math.abs(x.usual - rate) < 1e-9);
  return [
    { label: "Remitter identified as the customer", weight: 0.2, met: x.identified },
    { label: "Remittance cites the invoice", weight: 0.2, met: x.cited },
    { label: "Receipt explained by the invoices and standard deductions", weight: 0.2, met: c.explained.residual === 0 },
    { label: "Explained to the rupee, no small difference written off", weight: 0.1, met: c.explained.residual === 0 && c.explained.exact },
    { label: rate === 0 ? "No withholding deducted" : "Withholding at the customer's usual rate", weight: 0.1, met: ratesAgree },
    { label: "No competing explanation of similar quality", weight: 0.1, met: !x.competing },
    { label: "Invoices open and not held by another receipt", weight: 0.1, met: true },
  ];
}

const confidenceOf = (f: ConfidenceFactor[]) => Math.round(f.reduce((s, x) => s + (x.met ? x.weight : 0), 0) * 100) / 100;

function rationaleOf(p: Pick<Proposal, "invoices" | "deductions" | "residual" | "receipt">): string {
  const inv = p.invoices.length === 1 ? `invoice ${p.invoices[0].reference}` : `${p.invoices.length} invoices (${p.invoices.map((i) => i.reference).join(", ")})`;
  // the tax names stay as they are; other labels read as running text
  const ded = p.deductions.length ? ` less ${p.deductions.map((d) => (d.kind === "tds" || d.kind === "gst-tds" ? d.label : d.label.toLowerCase())).join(" and ")}` : "";
  const tail = p.residual > 0 ? `; ${fmtINR(p.residual)} is not explained and stays open as a short payment` : "";
  return `${fmtINR(p.receipt)} pays ${inv}${ded}${tail}.`;
}

// ---------------------------------------------------------------------------
// Matching one receipt
// ---------------------------------------------------------------------------
export interface MatchOptions {
  /** invoice key -> the receipt whose live decision holds it; other receipts cannot use these */
  reserved?: Map<string, string>;
  /** invoice keys another receipt's best match already uses */
  claimed?: Set<string>;
  /** invoice-set signatures a person rejected for this receipt */
  rejected?: Set<string>;
}

export function matchReceipt(r: Receipt, d: CashAppData, o: MatchOptions = {}): Match {
  const customers = identify(r.narration, d);
  const citedKeys = new Set<string>();
  for (const tok of tokens(r.narration)) {
    const inv = d.invoiceByRef.get(tok);
    if (inv) citedKeys.add(inv.key);
  }
  const available = (i: InvoiceRef) => i.date <= r.date && !(o.reserved?.has(i.key) && o.reserved.get(i.key) !== r.key) && !o.claimed?.has(i.key);
  const ambiguous = customers.length > 1 && customers[1].score >= customers[0].score - 0.2;

  const proposals: Proposal[] = [];
  for (const cust of customers) {
    // a customer belongs to a legal entity: invoices of every account with the same tax ID can be paid together
    const entity = d.entityOf.get(cust.customerId) ?? [cust.customerId];
    const all = entity.flatMap((id) => d.invoicesByCustomer.get(id) ?? []).filter(available).sort((a, b) => a.date.localeCompare(b.date));
    if (!all.length) continue;
    const cited = all.filter((i) => citedKeys.has(i.key));
    // the invoices nearest the receipt date, plus any it cites
    const rest = all.filter((i) => !citedKeys.has(i.key)).reverse().slice(0, Math.max(0, P.poolSize - cited.length)).reverse();
    const govt = !!d.customers.find((c) => c.id === cust.customerId)?.governmentOrPsu;
    const recipes = recipesFor(govt);
    const usual = d.usualRate.get(cust.customerId);

    const found: Candidate[] = [];
    for (const recipe of recipes) {
      // what each invoice contributes to the receipt after the withholding in this recipe
      const net = (i: InvoiceRef) => i.gross - (recipe.rate > 0 ? Math.round(i.taxable * recipe.rate) : 0) - (recipe.gst ? Math.round(i.taxable * P.gstTdsRate) : 0);
      const fixed = sum(cited.map(net));
      const lo = r.amount - P.exactTolerance - fixed;
      const hi = r.amount + P.smallDifferenceMax - fixed;
      for (const idx of windowSubsets(rest.map(net), P.maxInvoices - cited.length, lo, hi)) {
        const set = [...cited, ...idx.map((k) => rest[k])];
        if (!set.length) continue;
        const explained = explain(set, r.amount, recipe);
        if (!explained) continue;
        // fewer invoices first; then exact over a small difference written off; then no deduction over one, and the customer's usual rate over another
        const priority =
          -10 * set.length + (explained.exact ? 10 : 0) + (recipe.rate === 0 && !recipe.gst ? 2 : usual !== undefined && recipe.rate === usual ? 4 : 0) - (recipe.gst ? 2 : 0);
        found.push({ invoices: set, recipe, explained, priority });
      }
    }
    found.sort((a, b) => b.priority - a.priority);

    // the best explanation of each distinct invoice set
    const seen = new Set<string>();
    const distinct = found.filter((c) => {
      const s = signatureOf(c.invoices);
      return seen.has(s) ? false : (seen.add(s), true);
    });

    const identified = (cust.score >= 0.9 && !ambiguous) || cited.length > 0;
    distinct.forEach((c, idx) => {
      // another explanation that is as simple and as exact makes this one less certain
      const competing = idx > 0 || distinct.slice(1).some((x) => x.invoices.length <= c.invoices.length && (x.explained.exact || !c.explained.exact));
      const factors = factorsOf(c, { cited: cited.length > 0, identified, competing, usual });
      const level: MatchLevel = cited.length > 0 ? "L1" : c.invoices.length > 1 ? "L4" : c.explained.deductions.length === 0 ? "L2" : "L3";
      const base = {
        receiptKey: r.key, level, customerId: cust.customerId, customerBasis: cust.basis, invoices: c.invoices, deductions: c.explained.deductions,
        invoiceTotal: sum(c.invoices.map((i) => i.gross)), receipt: r.amount, residual: 0, signature: signatureOf(c.invoices),
      };
      proposals.push({ ...base, confidence: confidenceOf(factors), factors, rationale: rationaleOf(base) });
    });

    // the remittance cites an invoice but nothing explains the amount: apply what was received and leave the difference open
    if (!distinct.length && cited.length > 0) {
      const gross = sum(cited.map((i) => i.gross));
      const options = recipes.map((recipe) => ({ recipe, e: explain(cited, r.amount, recipe, true) })).filter((x): x is { recipe: Recipe; e: Explained } => !!x.e && x.e.residual > 0);
      const best = options.sort((a, b) => a.e.residual - b.e.residual)[0];
      if (best && best.e.residual < gross) {
        const c: Candidate = { invoices: cited, recipe: best.recipe, explained: best.e, priority: -100 };
        const factors = factorsOf(c, { cited: true, identified: true, competing: false, usual });
        const base = {
          receiptKey: r.key, level: "L1" as MatchLevel, customerId: cust.customerId, customerBasis: cust.basis, invoices: cited, deductions: best.e.deductions,
          invoiceTotal: gross, receipt: r.amount, residual: best.e.residual, signature: signatureOf(cited),
        };
        proposals.push({ ...base, confidence: confidenceOf(factors), factors, rationale: rationaleOf(base) });
      }
    }
  }

  // a customer the remittance only partly names scores lower than a surer one
  const top = customers[0]?.score ?? 0;
  const ranked = proposals
    .filter((p) => !o.rejected?.has(p.signature))
    .map((p) => {
      const score = customers.find((c) => c.customerId === p.customerId)?.score ?? 0;
      return score + 1e-9 < top ? { ...p, confidence: Math.max(0, Math.round((p.confidence - 0.1) * 100) / 100) } : p;
    })
    .sort((a, b) => b.confidence - a.confidence || a.invoices.length - b.invoices.length);
  const seenSig = new Set<string>();
  const unique = ranked.filter((p) => (seenSig.has(p.signature) ? false : (seenSig.add(p.signature), true)));
  return { receipt: r, proposals: unique.slice(0, 4), customers };
}

/**
 * Match every receipt, then resolve conflicts: when two receipts' best matches
 * want the same invoice the more confident one keeps it and the other is
 * matched again without it.
 */
export function matchAll(receipts: Receipt[], d: CashAppData, o: { reserved?: Map<string, string>; rejected?: Map<string, Set<string>> } = {}): Map<string, Match> {
  const run = (claimed: Map<string, Set<string>>) => {
    const out = new Map<string, Match>();
    for (const r of receipts) out.set(r.key, matchReceipt(r, d, { reserved: o.reserved, rejected: o.rejected?.get(r.key), claimed: claimed.get(r.key) }));
    return out;
  };
  const excluded = new Map<string, Set<string>>();
  let result = run(excluded);
  for (let round = 0; round < 6; round += 1) {
    const holders = new Map<string, { receiptKey: string; confidence: number; date: IsoDate }>();
    const losers = new Map<string, Set<string>>();
    for (const [key, m] of result) {
      const best = m.proposals[0];
      if (!best || best.confidence < P.proposeFrom) continue;
      for (const inv of best.invoices) {
        const cur = holders.get(inv.key);
        if (!cur) {
          holders.set(inv.key, { receiptKey: key, confidence: best.confidence, date: m.receipt.date });
          continue;
        }
        const keepsIt = best.confidence > cur.confidence || (best.confidence === cur.confidence && m.receipt.date < cur.date);
        const loser = keepsIt ? cur.receiptKey : key;
        if (keepsIt) holders.set(inv.key, { receiptKey: key, confidence: best.confidence, date: m.receipt.date });
        losers.set(loser, (losers.get(loser) ?? new Set()).add(inv.key));
      }
    }
    if (!losers.size) break;
    for (const [k, invs] of losers) excluded.set(k, new Set([...(excluded.get(k) ?? []), ...invs]));
    result = run(excluded);
  }
  return result;
}

// ---------------------------------------------------------------------------
// The clearing entry a confirmed match proposes
// ---------------------------------------------------------------------------
const NATURE_BY_RATE: Record<string, string> = { "0.001": "purchase of goods", "0.01": "contract work", "0.02": "contract work", "0.05": "commission", "0.1": "professional services" };

export function applicationJournal(p: Proposal, r: Receipt): JournalSpec {
  const pc = p.invoices[0].profitCentre;
  const quarter = taxQuarterOf(r.date);
  const lines: JournalSpec["lines"] = [{ gl: "171200", side: "Dr", amount: r.amount, text: `Receipt ${r.utr ?? r.docNo} of ${fmtDate(r.date)} applied`, profitCentre: r.profitCentre }];
  for (const d of p.deductions) {
    if (d.kind === "tds") lines.push({ gl: "161100", side: "Dr", amount: d.amount, text: `TDS ${NATURE_BY_RATE[String(d.rate)] ?? "deducted"} - ${quarter}`, profitCentre: pc, partnerId: p.customerId, assignment: p.invoices[0].reference });
    else if (d.kind === "gst-tds") lines.push({ gl: "162400", side: "Dr", amount: d.amount, text: `GST TDS - ${quarter}`, profitCentre: pc, partnerId: p.customerId, assignment: p.invoices[0].reference });
    else lines.push({ gl: "531100", side: "Dr", amount: d.amount, text: d.label, profitCentre: pc });
  }
  let toCredit = r.amount + sum(p.deductions.map((d) => d.amount));
  for (const inv of p.invoices) {
    const amount = Math.min(inv.gross, toCredit);
    if (amount <= 0) break;
    lines.push({ gl: "140100", side: "Cr", amount, text: amount < inv.gross ? `Part payment of invoice ${inv.reference}` : `Invoice ${inv.reference}`, profitCentre: inv.profitCentre, partnerId: p.customerId, assignment: inv.reference });
    toCredit -= amount;
  }
  return {
    header: `Receipt ${r.utr ?? r.docNo} applied to ${p.invoices.length === 1 ? `invoice ${p.invoices[0].reference}` : `${p.invoices.length} invoices`}`,
    lines,
    clears: [r.key, ...p.invoices.map((i) => i.key)],
  };
}

export const receiptAge = (r: Receipt, asOf: IsoDate) => daysBetween(r.date, asOf);

/** The request for a remittance advice, drafted from what is known about the receipt. */
export function draftRemittanceRequest(r: Receipt, customerName?: string): { owner: string; message: string } {
  const what = `${fmtINR(r.amount)} received on ${fmtDate(r.date)}${r.utr ? ` (reference ${r.utr})` : ""}`;
  if (customerName) {
    return {
      owner: `Accounts payable, ${customerName}`,
      message: `We received ${what}. Please send the remittance advice listing the invoices it settles and any amounts deducted (tax deducted at source, bank charges, other), so that we can apply the payment to your account.`,
    };
  }
  return {
    owner: "Bank relationship manager",
    message: `We received a credit of ${what} with the narration "${r.narration}", and cannot tell who sent it. Please share the remitter's name and account details so that we can identify the customer and apply the payment.`,
  };
}

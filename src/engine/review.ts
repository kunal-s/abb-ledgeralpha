// Balance Sheet Review aggregates (docs/FRD.md §6.6): the category × ageing
// heatmap, the one-pass ledger scan behind the account register and movement
// since the last review, sign-off readiness, and account status. Pure
// functions over the loaded world; the UI only formats and drills.

import type { AccountCategory, AccountReviewStatus, AccountSignOff, GlAccount, IsoDate, LineItem } from "@/types";
import { AGEING_POLICY, MATERIALITY_POLICY } from "@/config/policies";
import { daysBetween, fiscalYearStartDate } from "@/lib/dates";
import { TENANT } from "@/config/tenant";
import { GL_BY_ID, PC_BY_ID, WORLD, isOpenAt } from "@/data";
import { RETAINED_EARNINGS_GL } from "@/data/balances";

export const BUCKETS = AGEING_POLICY.buckets;
export type BucketId = (typeof AGEING_POLICY.buckets)[number]["id"];

/** Categories the review looks at, in presentation order. */
export const REVIEW_CATEGORIES: AccountCategory[] = [
  "grir", "vendor-adv", "customer-adv", "unbilled", "retention", "tds-recv", "suspense",
  "trade-recv", "trade-pay", "deposits", "statutory-dues", "employee-adv", "cwip", "intercompany", "gst", "other-payables",
];

export function ageOf(l: LineItem, asOf: IsoDate): number {
  const basis =
    AGEING_POLICY.basis === "documentDate" ? l.documentDate
    : AGEING_POLICY.basis === "dueDate" ? l.dueDate ?? l.postingDate
    : l.postingDate;
  return daysBetween(basis, asOf);
}

export function bucketOf(age: number): BucketId {
  for (const b of BUCKETS) if (b.max === null || age <= b.max) return b.id;
  return BUCKETS[BUCKETS.length - 1].id;
}

/** Business unit filter ("all" = the whole company). */
export function inScope(l: LineItem, businessUnitId: string): boolean {
  return businessUnitId === "all" || PC_BY_ID.get(l.profitCentre)?.businessUnitId === businessUnitId;
}

// ---------------------------------------------------------------------------
// Heatmap
// ---------------------------------------------------------------------------
export interface HeatCell {
  count: number;
  /** gross: sum of absolute amounts, so debits and credits never net out */
  amount: number;
  flagged: number;
  flaggedAmount: number;
}

const empty = (): HeatCell => ({ count: 0, amount: 0, flagged: 0, flaggedAmount: 0 });

export interface Heatmap {
  categories: AccountCategory[];
  cell: (c: AccountCategory, b: BucketId) => HeatCell;
  rowTotal: (c: AccountCategory) => HeatCell;
  colTotal: (b: BucketId) => HeatCell;
  total: HeatCell;
}

export function buildHeatmap(open: LineItem[], flagged: ReadonlySet<string>, asOf: IsoDate): Heatmap {
  const cells = new Map<string, HeatCell>();
  const rows = new Map<AccountCategory, HeatCell>();
  const cols = new Map<BucketId, HeatCell>();
  const total = empty();
  const add = (cell: HeatCell, l: LineItem, isFlagged: boolean) => {
    const a = Math.abs(l.amount);
    cell.count += 1;
    cell.amount += a;
    if (isFlagged) {
      cell.flagged += 1;
      cell.flaggedAmount += a;
    }
  };
  for (const l of open) {
    const category = GL_BY_ID.get(l.gl)!.category;
    const bucket = bucketOf(ageOf(l, asOf));
    const isFlagged = flagged.has(l.key);
    const k = `${category}|${bucket}`;
    add(cells.get(k) ?? cells.set(k, empty()).get(k)!, l, isFlagged);
    add(rows.get(category) ?? rows.set(category, empty()).get(category)!, l, isFlagged);
    add(cols.get(bucket) ?? cols.set(bucket, empty()).get(bucket)!, l, isFlagged);
    add(total, l, isFlagged);
  }
  return {
    categories: REVIEW_CATEGORIES.filter((c) => rows.has(c)),
    cell: (c, b) => cells.get(`${c}|${b}`) ?? empty(),
    rowTotal: (c) => rows.get(c) ?? empty(),
    colTotal: (b) => cols.get(b) ?? empty(),
    total,
  };
}

// ---------------------------------------------------------------------------
// One-pass ledger scan: account summaries and movement since the last review
// ---------------------------------------------------------------------------
export interface AccountSummary {
  gl: GlAccount;
  closing: number;
  prior: number;
  openCount: number;
  openGross: number;
  overCount: number;
  overAmount: number;
  priorOverAmount: number;
  byBucket: Record<BucketId, { count: number; amount: number }>;
}

export interface CategoryMovement {
  category: AccountCategory;
  closing: number;
  prior: number;
  over: number;
  priorOver: number;
}

export interface LedgerScan {
  accounts: Map<string, AccountSummary>;
  categories: Map<AccountCategory, CategoryMovement>;
}

const scanCache = new Map<string, LedgerScan>();

export function scanLedger(asOf: IsoDate, prior: IsoDate, businessUnitId: string): LedgerScan {
  const ck = `${asOf}|${prior}|${businessUnitId}`;
  const hit = scanCache.get(ck);
  if (hit) return hit;

  const accounts = new Map<string, AccountSummary>();
  const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b.id, { count: 0, amount: 0 }])) as AccountSummary["byBucket"];
  for (const g of WORLD.glAccounts) {
    if (g.category === "pl") continue;
    accounts.set(g.gl, { gl: g, closing: 0, prior: 0, openCount: 0, openGross: 0, overCount: 0, overAmount: 0, priorOverAmount: 0, byBucket: emptyBuckets() });
  }
  const threshold = AGEING_POLICY.reviewThresholdDays;
  const fyStart = fiscalYearStartDate(asOf, TENANT.fiscalYear.startMonth);
  const priorFyStart = fiscalYearStartDate(prior, TENANT.fiscalYear.startMonth);
  // Profit and loss accounts restart each fiscal year; earlier years' results sit in retained earnings.
  let earlierYearsResult = 0;
  let earlierYearsResultAtPrior = 0;

  for (const l of WORLD.lines) {
    if (l.postingDate > asOf) break; // lines are sorted by posting date
    if (GL_BY_ID.get(l.gl)!.category === "pl") {
      if (inScope(l, businessUnitId)) {
        if (l.postingDate < fyStart) earlierYearsResult += l.amount;
        if (l.postingDate < priorFyStart) earlierYearsResultAtPrior += l.amount;
      }
      continue;
    }
    const s = accounts.get(l.gl);
    if (!s || !inScope(l, businessUnitId)) continue;
    s.closing += l.amount;
    if (l.postingDate <= prior) s.prior += l.amount;
    if (!s.gl.openItemManaged) continue;
    if (isOpenAt(l, asOf)) {
      const age = ageOf(l, asOf);
      const b = s.byBucket[bucketOf(age)];
      b.count += 1;
      b.amount += Math.abs(l.amount);
      s.openCount += 1;
      s.openGross += Math.abs(l.amount);
      if (age > threshold) {
        s.overCount += 1;
        s.overAmount += Math.abs(l.amount);
      }
    }
    if (l.postingDate <= prior && isOpenAt(l, prior) && ageOf(l, prior) > threshold) s.priorOverAmount += Math.abs(l.amount);
  }

  const retained = accounts.get(RETAINED_EARNINGS_GL);
  if (retained) {
    retained.closing += earlierYearsResult;
    retained.prior += earlierYearsResultAtPrior;
  }

  const categories = new Map<AccountCategory, CategoryMovement>();
  for (const s of accounts.values()) {
    const m = categories.get(s.gl.category) ?? { category: s.gl.category, closing: 0, prior: 0, over: 0, priorOver: 0 };
    m.closing += s.closing;
    m.prior += s.prior;
    m.over += s.overAmount;
    m.priorOver += s.priorOverAmount;
    categories.set(s.gl.category, m);
  }
  const scan = { accounts, categories };
  if (scanCache.size > 16) scanCache.delete(scanCache.keys().next().value!);
  scanCache.set(ck, scan);
  return scan;
}

// ---------------------------------------------------------------------------
// Sign-off readiness and account status
// ---------------------------------------------------------------------------
export interface Readiness {
  /** flagged items at or above materiality that must be documented */
  required: LineItem[];
  /** …of which still have neither a decision nor a dated follow-up */
  undocumented: LineItem[];
  undocumentedValue: number;
  needsCommentary: boolean;
  ready: boolean;
}

export function readiness(flagged: LineItem[], documented: (key: string) => boolean, hasCommentary: boolean): Readiness {
  const required = flagged.filter((l) => Math.abs(l.amount) >= MATERIALITY_POLICY.documentedActionAmount);
  const undocumented = required.filter((l) => !documented(l.key));
  return {
    required,
    undocumented,
    undocumentedValue: undocumented.reduce((s, l) => s + Math.abs(l.amount), 0),
    needsCommentary: !hasCommentary,
    ready: undocumented.length === 0 && hasCommentary,
  };
}

export function accountStatus(so: AccountSignOff | undefined, ready: boolean, hasActivity: boolean): AccountReviewStatus {
  if (so?.reviewer) return "reviewer-signed";
  if (so?.preparer) return "preparer-signed";
  if (so?.reopened) return "reopened";
  if (ready) return "ready-for-signoff";
  return hasActivity ? "in-review" : "not-started";
}

/** Balance-sheet accounts with something to review: a balance or open items. */
export function isReviewable(s: AccountSummary): boolean {
  return Math.abs(s.closing) > 0 || s.openCount > 0;
}

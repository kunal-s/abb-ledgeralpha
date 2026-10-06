// Domain contract - DRAFT, mirrors docs/FRD.md §5 (Data model).
// One ledger, many lenses: every module reads the same line items, balances and
// reference data, so a document resolves identically wherever it appears.
// Field comments name the SAP field each one maps to (ACDOCA / BSEG).

/** ISO calendar date, "2026-09-30". */
export type IsoDate = string;

/** Amount in company-code currency, signed the SAP way: debit +, credit −. */
export type Amount = number;

export type Nature = "Asset" | "Liability" | "Equity" | "Income" | "Expense";
export type RiskTier = "High" | "Medium" | "Low";
export type ReviewFrequency = "Monthly" | "Quarterly" | "Half-yearly" | "Annual";
export type Severity = "low" | "medium" | "high" | "critical";
export type MethodKind = "deterministic" | "judgement";

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------
export interface ProfitCentre {
  id: string; // PRCTR
  name: string;
  businessUnitId: string;
}

export type ProjectStage = "Execution" | "Commissioned" | "In DLP" | "DLP ended" | "Closed" | "On hold";

export interface Project {
  wbs: string; // PS_POSID
  name: string;
  customerId: string;
  profitCentreId: string;
  stage: ProjectStage;
  contractValue: Amount;
  startDate: IsoDate;
  dlpEnd?: IsoDate;
}

// ---------------------------------------------------------------------------
// Chart of accounts and review categories
// ---------------------------------------------------------------------------
export type AccountCategory =
  | "grir" // GR/IR clearing
  | "vendor-adv" // advances to vendors
  | "customer-adv" // advances from customers (contract liabilities)
  | "unbilled" // unbilled revenue (contract assets)
  | "retention" // retention money receivable
  | "tds-recv" // withholding tax receivable
  | "gst" // indirect tax input / output
  | "suspense" // suspense and clearing
  | "provisions" // accruals and provisions
  | "deposits" // EMD / security deposits
  | "statutory-dues" // withholding / indirect tax / PF payable
  | "employee-adv"
  | "prepaid"
  | "other-payables" // salaries payable, capital creditors
  | "cwip" // capital work in progress
  | "fixed-assets"
  | "inventory"
  | "bank"
  | "trade-recv" // AR control (sub-ledger)
  | "trade-pay" // AP control (sub-ledger)
  | "intercompany"
  | "equity"
  | "pl"; // profit and loss accounts

export interface GlAccount {
  gl: string; // SAKNR / RACCT
  description: string; // TXT50
  category: AccountCategory;
  statementLine: string; // statutory statement line (Schedule III in the India pack)
  nature: Nature;
  normalBalance: "Dr" | "Cr";
  openItemManaged: boolean; // SKB1-XOPVW
  reconAccount: boolean; // SKB1-MITKZ - AR/AP control, reviewed via sub-ledger
  ownerId: string;
  reviewerId: string;
  riskTier: RiskTier;
  reviewFrequency: ReviewFrequency;
}

// ---------------------------------------------------------------------------
// Ledger: one line item (universal journal row)
// ---------------------------------------------------------------------------
/** Common SAP document types; other codes pass through as-is. */
export type DocType =
  | "SA" // G/L document (manual journal)
  | "KR" // vendor invoice
  | "KZ" // vendor payment
  | "KA" // vendor document / advance
  | "DR" // customer invoice
  | "DZ" // customer payment
  | "WE" // goods receipt
  | "RE" // logistics invoice receipt
  | "AB" // clearing / reversal
  | (string & {});

export type PartnerType = "Vendor" | "Customer" | "Employee" | "Bank" | "Group company";

export interface LineItem {
  /** stable key: `${companyCode}-${fiscalYear}-${docNo}-${lineItem}` */
  key: string;
  companyCode: string; // BUKRS / RBUKRS
  gl: string; // HKONT / RACCT
  fiscalYear: number; // GJAHR
  docNo: string; // BELNR
  lineItem: number; // BUZEI / DOCLN
  docType: DocType; // BLART
  postingKey: string; // BSCHL
  postingDate: IsoDate; // BUDAT
  documentDate: IsoDate; // BLDAT
  dueDate?: IsoDate; // derived from ZFBDT + terms
  entryDate: IsoDate; // CPUDT
  entryTime?: string; // CPUTM, "23:42"
  enteredBy: string; // USNAM
  amount: Amount; // HSL, signed
  docCurrency: string; // WAERS / RWCUR
  amountDoc: number; // WSL, signed, document currency
  assignment?: string; // ZUONR
  reference?: string; // XBLNR
  text?: string; // SGTXT
  profitCentre: string; // PRCTR
  wbs?: string; // PS_POSID
  costCentre?: string; // RCNTR
  partner?: { type: PartnerType; id: string }; // LIFNR / KUNNR / RASSC
  po?: { number: string; item: number }; // EBELN / EBELP
  clearing?: { docNo: string; date: IsoDate }; // AUGBL / AUGDT - absent while open
  sourceSystem: string; // tenant source system
  /** derived: manually entered journal */
  manual: boolean;
}

/** Period-end balance per GL. */
export interface GlBalance {
  gl: string;
  periodEnd: IsoDate;
  opening: Amount;
  debits: Amount;
  credits: Amount;
  closing: Amount;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
export interface Party {
  id: string; // VEND-0142 / CUST-0217
  type: "Vendor" | "Customer" | "Group company";
  name: string;
  /** legal-entity key: accounts with the same tax ID belong to one legal entity */
  taxIdMasked: string; // PAN in the India pack
  indirectTaxIdMasked?: string; // GSTIN in the India pack
  /** withholding-tax deductor ID (TAN in the India pack) - customers only */
  deductorIdMasked?: string;
  status: "Active" | "Blocked" | "Inactive";
  msme?: "Micro" | "Small" | "Medium";
  governmentOrPsu?: boolean;
  /** foreign vendors / group companies */
  currency?: string;
  country: string;
}

export interface PurchaseOrderStatus {
  po: string;
  item: number;
  vendorId: string;
  status: "Open" | "Closed" | "Deletion flagged";
  lastGrDate?: IsoDate;
  lastInvoiceDate?: IsoDate;
  sourceSystem: string;
}

export type BgType = "Advance payment" | "Performance" | "Retention" | "Bid / EMD" | "Warranty";

export interface BankGuarantee {
  bgNo: string;
  direction: "Received" | "Issued";
  type: BgType;
  partyId: string;
  bank: string;
  amount: Amount;
  issueDate: IsoDate;
  validTo: IsoDate;
  claimExpiry?: IsoDate;
  linkedPo?: string;
  linkedWbs?: string;
  status: "Active" | "In claim period" | "Expired - original awaited" | "Released" | "Invoked";
}

/** One withholding-tax credit line from the tax authority statement (Form 26AS / AIS). */
export interface TaxCreditStatementLine {
  id: string;
  deductorTaxIdMasked: string; // TAN
  customerId: string;
  taxYearQuarter: string; // "Q2 FY2026-27"
  transactionDate: IsoDate;
  natureOfPayment: string;
  amountPaid: Amount;
  taxCredited: Amount;
}

/** Month-end closing and period-average rates, INR per unit of currency. */
export interface FxRate {
  currency: string;
  periodEnd: IsoDate;
  closing: number;
  average: number;
}

export interface BankStatementLine {
  id: string;
  bankAccount: string;
  valueDate: IsoDate;
  amount: Amount;
  narration: string;
  reference?: string;
}

// ---------------------------------------------------------------------------
// Rules, recommendations, decisions (shared across modules)
// ---------------------------------------------------------------------------
export type ActionKind =
  | "Clear"
  | "Reclassify"
  | "Write off"
  | "Write back"
  | "Provide"
  | "Adjust books" // a reconciling item that needs an entry in the books
  | "Follow up"
  | "Retain";

/** Journal lines carried by a decision that has no ledger line behind it (reconciling items). */
export interface JournalSpec {
  header: string;
  lines: { gl: string; side: "Dr" | "Cr"; amount: number; text: string; profitCentre?: string }[];
  /** true when a target account still has to be chosen by the preparer */
  needsTarget?: boolean;
}

export interface RuleParam {
  key: string;
  label: string;
  value: number;
  unit: "days" | "amount" | "%" | "count" | "years";
}

export type RuleModule = "balance-sheet-review" | "reconciliations" | "cash-application" | "journals" | "withholding-tax" | "indirect-tax";

export interface RuleDefinition {
  id: string; // "BSR-01"
  module: RuleModule;
  name: string;
  /** the population the rule looks at, in plain words */
  scope: string;
  /** the condition, in plain words */
  logic: string;
  categories: AccountCategory[] | "all";
  severity: Severity;
  candidateAction: ActionKind;
  params: RuleParam[];
  basis?: string;
  /** product defaults; a workspace may change parameters or enablement */
  enabledByDefault: boolean;
}

/** A rule with the workspace's overrides applied. */
export interface EffectiveRule extends RuleDefinition {
  enabled: boolean;
  /** true when parameters or enablement differ from the product default */
  changed: boolean;
}

export type FactValue = string | number | boolean;

export interface RuleHit {
  ruleId: string;
  itemKey: string;
  /** plain-language reason built from the item's own facts */
  reason: string;
  facts: Record<string, FactValue>;
}

export interface ConfidenceFactor {
  label: string;
  weight: number;
  met: boolean;
}

export interface Recommendation {
  itemKey: string;
  action: ActionKind;
  /** the rule whose finding drives the recommendation */
  primaryRuleId: string;
  /** 0..1, always derived from `factors` */
  confidence: number;
  factors: ConfidenceFactor[];
  rationale: string;
  /** what the owner should do next, e.g. "Recover against BG HDFC/BG/2025/00731" */
  nextStep: string;
  requiresTaxReview: boolean;
  approvalBandId: string;
}

export type ItemStatus =
  | "within-policy"
  | "flagged"
  | "in-follow-up"
  | "decision-proposed"
  | "approved"
  | "rejected"
  | "exported"
  | "closed-in-erp";

export type AccountReviewStatus =
  | "not-started"
  | "in-review"
  | "ready-for-signoff"
  | "preparer-signed"
  | "reviewer-signed"
  | "reopened";

export type DecisionStatus = "proposed" | "approved" | "rejected" | "withdrawn" | "exported" | "closed-in-erp";

export interface Decision {
  id: string;
  itemKey: string;
  module: string;
  action: ActionKind;
  amount: Amount;
  proposedBy: string; // person id
  proposedAt: string; // local ISO date-time
  justification: string;
  approvalBandId: string;
  /** roles that must approve, in order */
  chain: RoleId[];
  approvals: { roleId: RoleId; personId: string; at: string; note?: string }[];
  taxReviewRequired: boolean;
  taxReview?: { personId: string; outcome: "cleared" | "objected"; at: string; note?: string };
  rejection?: { personId: string; at: string; reason: string };
  status: DecisionStatus;
  exportBatchId?: string;
  /** set for decisions on reconciling items, which have no ledger line to derive entries from */
  journal?: JournalSpec;
  /** the recommendation and facts at the time of proposal (decision reconstruction) */
  snapshot: { recommendation?: Recommendation; hits: RuleHit[]; rulesVersion: string };
}

export interface FollowUp {
  id: string;
  itemKey: string;
  module: string;
  owner: string; // who is asked: a role, a counterparty or a named person
  dueDate: IsoDate;
  message: string;
  createdBy: string; // person id
  createdAt: string;
  status: "open" | "responded" | "closed";
  response?: { text: string; at: string; by: string };
}

export interface AccountSignOff {
  gl: string;
  periodEnd: IsoDate;
  preparer?: { personId: string; at: string };
  reviewer?: { personId: string; at: string };
  commentary?: string;
  /** true once the owner has edited the drafted commentary */
  commentaryEdited?: boolean;
  reopened?: { personId: string; at: string; reason: string };
}

export interface ActivityEvent {
  id: string;
  at: string; // local ISO date-time
  actorId: string; // person id, agent id or "system"
  actorKind: "Person" | "Agent" | "System";
  module: string; // module id
  object: { type: string; id: string; label?: string };
  /** every line item the event concerns (bulk actions touch many) */
  itemKeys?: string[];
  action: string;
  before?: string;
  after?: string;
  reason?: string;
  details?: Record<string, FactValue>;
}

// ---------------------------------------------------------------------------
// People and roles
// ---------------------------------------------------------------------------
export type RoleId =
  | "cfo"
  | "head-of-finance"
  | "controller"
  | "gl-accountant"
  | "ar-specialist"
  | "treasury-analyst"
  | "tax-specialist"
  | "reporting-analyst"
  | "controls-lead"
  | "external-auditor";

export interface Person {
  id: string;
  name: string;
  roleId: RoleId;
  title: string;
  /** ERP user ID (USNAM) - how this person appears on documents they enter */
  userId: string;
}

// ---------------------------------------------------------------------------
// The loaded world (docs/FRD.md §4.1) - one dataset every module reads
// ---------------------------------------------------------------------------
export interface BusinessUnit {
  id: string;
  name: string;
}

/** One dataset as it arrived from a source system. */
export interface SourceDataset {
  id: string;
  name: string;
  sourceSystem: string;
  /** extract / file type, e.g. "ACDOCA line-item extract" */
  format: string;
  records: number;
  coverageFrom?: IsoDate;
  coverageTo: IsoDate;
  extractedAt: string; // "2026-10-01T06:15"
}

export interface DataQualityCheck {
  id: string;
  name: string;
  checked: number;
  exceptions: number;
  /** examples of failing records, for drill-down */
  samples: string[];
}

// ---------------------------------------------------------------------------
// Reconciliations (docs/FRD.md §6.7)
// ---------------------------------------------------------------------------
export type ReconType = "Bank" | "Sub-ledger" | "Schedule-supported" | "Tax account" | "Intercompany" | "Customer statement" | "Vendor statement";

/** What has to happen to a reconciling item. */
export type ReconTreatment = "timing" | "classification" | "adjust-books" | "adjust-source" | "dispute" | "investigate";

export interface ReconClass {
  id: string;
  label: string;
  treatment: ReconTreatment;
  /** one line shown when choosing the class */
  hint: string;
}

/**
 * A difference between the books and the source. `amount` is the amount as it
 * appears (books side) or would appear (source side) in the books, signed
 * debit +. Its effect on (books - source) is +amount for a books-side item
 * and -amount for a source-side item.
 */
export interface ReconItem {
  id: string;
  side: "books" | "source";
  amount: Amount;
  date: IsoDate;
  reference?: string;
  narration: string;
  /** ledger line behind a books-side item */
  lineKey?: string;
  /** the reconciler agent's classification */
  suggestedClass?: string;
  confidence?: number;
  /** how the item came to be: seeded data, the agent's diagnosis, or a person */
  origin?: "data" | "agent" | "person";
}

export type ConfirmationStatus = "not-sent" | "sent" | "reply-received" | "confirmed" | "counter-statement" | "disputed";

export interface Reconciliation {
  id: string;
  type: ReconType;
  name: string;
  /** GL account the books balance comes from (absent for counterparty reconciliations) */
  gl?: string;
  partyId?: string;
  booksLabel: string;
  sourceLabel: string;
  /** what the source is, e.g. "Bank statement 30-Sep-2026" */
  sourceDetail: string;
  booksBalance: Amount;
  /** null until the counterparty replies (customer and vendor statements) */
  sourceBalance: Amount | null;
  items: ReconItem[];
  frequency: "Monthly" | "Quarterly";
  riskTier: RiskTier;
  dueDate: IsoDate;
  preparerId: string;
  reviewerId: string;
  tolerance: Amount;
  /** prepared by the reconciler agent as at the start of the session */
  seedPrepared: boolean;
  /** statements matched automatically before the differences (bank) */
  matched?: { count: number; value: number };
  /** customer and vendor statements */
  confirmation?: { status: ConfirmationStatus; sentAt?: string; repliedAt?: string; contact: string };
  /** a reply received but not yet applied */
  reply?: { balance: Amount; receivedAt: string; via: string };
}

export interface World {
  asOf: IsoDate;
  extractedAt: string;
  businessUnits: BusinessUnit[];
  profitCentres: ProfitCentre[];
  projects: Project[];
  people: Person[];
  parties: Party[];
  glAccounts: GlAccount[];
  lines: LineItem[];
  purchaseOrders: PurchaseOrderStatus[];
  bankGuarantees: BankGuarantee[];
  taxCredits: TaxCreditStatementLine[];
  fxRates: FxRate[];
  reconciliations: Reconciliation[];
  /**
   * Internal test hook: planted demo scenarios → the line keys that carry them.
   * Never rendered; used by scenario tests and later by rule tests.
   */
  anchors: Record<string, string[]>;
}

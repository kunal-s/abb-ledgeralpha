// Domain contract — DRAFT, mirrors docs/FRD.md §6 (Data model).
// Finalised in Increment I1 once ABB's field list (questionnaire A-S1/A-S2) is in.
// Field comments name the SAP field each one maps to (FBL3N / ACDOCA).

/** ISO calendar date, "2026-09-30". */
export type IsoDate = string;

/** INR in company-code currency, signed the SAP way: debit +, credit −. */
export type INR = number;

export type SourceSystem = "CFIN" | "Legacy SAP";
export type Nature = "Asset" | "Liability";
export type RiskTier = "High" | "Medium" | "Low";
export type ReviewFrequency = "Monthly" | "Quarterly" | "Half-yearly" | "Annual";
export type Severity = "low" | "medium" | "high" | "critical";
export type MethodKind = "deterministic" | "judgement";

// ---------------------------------------------------------------------------
// Reference: GL account groups reviewed in the balance sheet review (FRD §6.2)
// ---------------------------------------------------------------------------
export type GlGroupId =
  | "grir" // GR/IR clearing
  | "vendor-adv" // advances to vendors
  | "customer-adv" // advances from customers (contract liabilities)
  | "unbilled" // unbilled revenue (contract assets, Ind AS 115)
  | "retention" // retention money receivable
  | "tds-recv" // TDS receivable (customer deductions, 26AS)
  | "gst" // GST input / output and GST TDS receivable
  | "suspense" // suspense and clearing (incl. incoming-payment clearing)
  | "provisions" // accruals and provisions
  | "deposits" // EMD / security deposits
  | "statutory-dues" // TDS / GST / PF payable
  | "employee-adv" // employee advances
  | "trade-recv" // trade receivables (AR control, via sub-ledger)
  | "trade-pay" // trade payables (AP control, via sub-ledger)
  | "intercompany"; // ABB group company balances

export interface GlAccount {
  gl: string; // HKONT / RACCT (masked or category code if ABB requires)
  description: string; // TXT50
  group: GlGroupId;
  scheduleIIILine: string; // Ind AS Schedule III (Division II) line
  nature: Nature;
  normalBalance: "Dr" | "Cr";
  openItemManaged: boolean; // XOPVW
  reconAccount: boolean; // MITKZ — AR/AP control, reviewed via sub-ledger
  ownerId: string; // preparer
  reviewerId: string;
  riskTier: RiskTier;
  reviewFrequency: ReviewFrequency;
}

// ---------------------------------------------------------------------------
// Transactional: one open line item (FBL3N / ACDOCA row)
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
  | "RE" // logistics invoice receipt (MIRO)
  | "AB" // clearing / reversal
  | (string & {});

export type PartnerType = "Vendor" | "Customer" | "Employee" | "Bank" | "Group company";

export interface OpenItem {
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
  entryDate: IsoDate; // CPUDT
  entryTime?: string; // CPUTM, "23:42"
  enteredBy: string; // USNAM (masked)
  amount: INR; // DMBTR / HSL, signed
  docCurrency: string; // WAERS
  amountDoc: number; // WRBTR, signed, in document currency
  assignment?: string; // ZUONR
  reference?: string; // XBLNR
  text?: string; // SGTXT
  profitCentre: string; // PRCTR
  wbs?: string; // PS_POSID — project / WBS element
  costCentre?: string; // KOSTL
  partner?: { type: PartnerType; id: string }; // LIFNR / KUNNR (masked codes)
  po?: { number: string; item: number }; // EBELN / EBELP
  sourceSystem: SourceSystem;
  /** derived: manually entered journal (e.g. doc type SA via FB50/FB01) */
  manual: boolean;
}

/** Period-end balance per GL, for movement since last review (FRD §6.4). */
export interface GlBalance {
  gl: string;
  periodEnd: IsoDate;
  balance: INR;
  debits: INR;
  credits: INR;
}

// ---------------------------------------------------------------------------
// Supporting reference data used by the rules (FRD §6.5)
// ---------------------------------------------------------------------------
export interface PurchaseOrderStatus {
  po: string;
  item: number;
  vendorId: string;
  status: "Open" | "Closed" | "Deletion flagged";
  lastGrDate?: IsoDate;
  lastInvoiceDate?: IsoDate;
  sourceSystem: SourceSystem; // PO data sits in legacy MM (questionnaire A12)
}

export interface Party {
  id: string; // masked code, e.g. "VEND-0142"
  type: "Vendor" | "Customer";
  name: string; // masked display name
  panMasked: string; // e.g. "AAACX####K"
  gstinMasked?: string;
  status: "Active" | "Blocked" | "Inactive";
  msme?: "Micro" | "Small" | "Medium"; // vendors only
  govtOrPsu?: boolean; // customers only — drives GST TDS
}

export type BgType = "Advance payment" | "Performance" | "Retention" | "Bid / EMD" | "Warranty";

/** BG received from a vendor (security for an advance) or given to a customer. */
export interface BankGuarantee {
  bgNo: string;
  direction: "Received" | "Given";
  type: BgType;
  partyId: string;
  amount: INR;
  validTo: IsoDate;
  claimExpiry?: IsoDate;
  linkedPo?: string;
  linkedWbs?: string;
}

/** One TDS credit line from Form 26AS / AIS (Indian FY quarters). */
export interface Tds26asCredit {
  deductorTanMasked: string;
  customerId: string;
  fyQuarter: string; // "FY2026-27 Q2"
  section: string; // nature-of-payment code — verify Income-tax Act 2025 mapping
  amountPaid: INR;
  tdsCredited: INR;
}

export interface ProjectStatus {
  wbs: string;
  name: string;
  customerId: string;
  stage: "Execution" | "Commissioned" | "In DLP" | "DLP ended" | "Closed" | "On hold";
  dlpEnd?: IsoDate;
  profitCentre: string;
}

// ---------------------------------------------------------------------------
// Rules, recommendations and decisions (FRD §7–§9)
// ---------------------------------------------------------------------------
export type ActionKind =
  | "Clear"
  | "Reclassify"
  | "Write off"
  | "Write back"
  | "Provide"
  | "Follow up"
  | "Retain";

export interface RuleParam {
  key: string;
  label: string;
  value: number | string | boolean;
  unit?: "days" | "INR" | "%" | "count";
  /** questionnaire reference that confirms this default, e.g. "A5" */
  tbcRef?: string;
}

export interface RuleDefinition {
  id: string; // "R01"
  name: string;
  description: string;
  groups: GlGroupId[] | "all";
  severity: Severity;
  candidateAction?: ActionKind;
  params: RuleParam[];
  /** Indian legal / accounting basis, where one applies */
  basis?: string;
  /** Confirmed by ABB, or a J2W proposal awaiting confirmation (A7/A8) */
  origin: "ABB" | "J2W proposal";
  enabled: boolean;
}

export interface RuleHit {
  ruleId: string;
  itemKey: string;
  /** plain-language reason shown in the queue */
  reason: string;
  /** the facts the rule evaluated, shown in the item drawer */
  facts: Record<string, string | number | boolean>;
}

export interface ConfidenceFactor {
  label: string;
  weight: number; // contribution to the score, 0..1
  met: boolean;
}

export interface Recommendation {
  itemKey: string;
  action: ActionKind;
  /** 0..1, always derived from `factors` — never a bare number */
  confidence: number;
  factors: ConfidenceFactor[];
  rationale: string;
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
  | "closed-in-sap";

export type AccountReviewStatus =
  | "not-started"
  | "in-review"
  | "ready-for-signoff"
  | "preparer-signed"
  | "reviewer-signed"
  | "reopened";

export interface Decision {
  itemKey: string;
  action: ActionKind;
  amount: INR;
  proposedBy: string;
  proposedAt: string;
  justification: string;
  approvalBandId: string;
  approvals: { roleId: RoleId; personId: string; outcome: "approved" | "rejected"; at: string; note?: string }[];
  taxReview?: { personId: string; outcome: "cleared" | "objected"; at: string; note?: string };
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string; // person id or agent id
  actorKind: "Human" | "Agent";
  object: { type: "item" | "account" | "rule" | "dataset" | "export"; id: string };
  action: string; // "Rule threshold changed", "Write-back approved", …
  before?: string;
  after?: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// People and roles (FRD §4) — fictional names only, never real ABB staff
// ---------------------------------------------------------------------------
export type RoleId =
  | "division-finance-head"
  | "gl-owner"
  | "ar-cash-lead"
  | "tax-reviewer"
  | "reporting-analyst"
  | "statutory-auditor";

export interface Person {
  id: string;
  name: string;
  roleId: RoleId;
  title: string;
}

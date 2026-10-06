// Demo configuration — the values ABB's answers will change.
// Every default marked TBC carries the questionnaire reference that confirms it
// (docs/FRD.md §15). Change values here, not in screens or rules.

import type { GlGroupId, Nature, RiskTier, RoleId } from "@/types";

export const DEMO = {
  product: "LedgerAlpha",
  company: "ABB India Limited",
  /** TBC S3 — formal division name; "cross-industry division" per 18 Sep call */
  division: "Division (name TBC)",
  /** TBC A-S1 — placeholder company code */
  companyCode: "IN01",
  /** ABB India reports on the calendar year (Jan–Dec) */
  reportingCalendar: "Calendar year",
  period: {
    label: "Q3 CY2026",
    asOf: "2026-09-30",
    /** last completed review, for "movement since last review" */
    priorReviewAsOf: "2026-06-30",
  },
  /** "synthetic" until ABB shares a masked extract (FRD §6.7) */
  dataMode: "synthetic" as "synthetic" | "masked",
} as const;

/** TBC A5 — ageing basis, buckets and the review trigger. */
export const AGING = {
  basis: "postingDate" as "postingDate" | "documentDate" | "dueDate",
  buckets: [
    { id: "0-90", label: "0–90 days", min: 0, max: 90 },
    { id: "91-180", label: "91–180 days", min: 91, max: 180 },
    { id: "181-365", label: "181–365 days", min: 181, max: 365 },
    { id: "365+", label: "Over 365 days", min: 366, max: null },
  ],
  /** "balances more than a hundred and eighty days" — Siddarth, 18 Sep */
  reviewThresholdDays: 180,
} as const;

/**
 * TBC A6 / A-S6 — placeholder delegation of authority, replaced by ABB's DoA.
 * The GL owner proposes; the chain approves in order. Write-backs (and TDS
 * write-offs) add the Tax Reviewer regardless of band (FRD §9.3).
 */
export const APPROVAL_BANDS = [
  { id: "B1", upTo: 5_00_000, chain: ["Division Finance Head"] },
  { id: "B2", upTo: 50_00_000, chain: ["Division Finance Head", "Escalation 1 (per ABB DoA)"] },
  {
    id: "B3",
    upTo: null,
    chain: ["Division Finance Head", "Escalation 1 (per ABB DoA)", "Escalation 2 (per ABB DoA)"],
  },
] as const satisfies readonly { id: string; upTo: number | null; chain: readonly string[] }[];

/** TBC A6 — items at or above this in the >180-day buckets need a documented action. */
export const MATERIALITY = {
  documentedActionINR: 1_00_000,
} as const;

/** TBC A3 — review groups, their nature and default risk tier. */
export const GL_GROUPS: Record<GlGroupId, { label: string; nature: Nature; defaultRisk: RiskTier }> = {
  grir: { label: "GR/IR clearing", nature: "Liability", defaultRisk: "High" },
  "vendor-adv": { label: "Vendor advances", nature: "Asset", defaultRisk: "High" },
  "customer-adv": { label: "Customer advances", nature: "Liability", defaultRisk: "High" },
  unbilled: { label: "Unbilled revenue", nature: "Asset", defaultRisk: "High" },
  retention: { label: "Retention receivable", nature: "Asset", defaultRisk: "High" },
  "tds-recv": { label: "TDS receivable", nature: "Asset", defaultRisk: "High" },
  gst: { label: "GST input / output", nature: "Asset", defaultRisk: "Medium" },
  suspense: { label: "Suspense and clearing", nature: "Asset", defaultRisk: "High" },
  provisions: { label: "Accruals and provisions", nature: "Liability", defaultRisk: "Medium" },
  deposits: { label: "Deposits (EMD / security)", nature: "Asset", defaultRisk: "Medium" },
  "statutory-dues": { label: "Statutory dues payable", nature: "Liability", defaultRisk: "Medium" },
  "employee-adv": { label: "Employee advances", nature: "Asset", defaultRisk: "Low" },
  "trade-recv": { label: "Trade receivables", nature: "Asset", defaultRisk: "Medium" },
  "trade-pay": { label: "Trade payables", nature: "Liability", defaultRisk: "Medium" },
  intercompany: { label: "Intercompany (ABB group)", nature: "Asset", defaultRisk: "Medium" },
};

export const ROLES: Record<RoleId, { label: string; summary: string }> = {
  "division-finance-head": {
    label: "Division Finance Head",
    summary: "Reviews and approves; signs off accounts",
  },
  "gl-owner": { label: "GL Account Owner", summary: "Prepares the review; proposes actions" },
  "ar-cash-lead": { label: "AR & Cash Lead", summary: "Owns receivable, advance and suspense items" },
  "tax-reviewer": { label: "Tax Reviewer", summary: "Clears write-backs and TDS write-offs" },
  "reporting-analyst": { label: "Reporting Analyst", summary: "Consumes division reports" },
  "statutory-auditor": { label: "Statutory Auditor", summary: "Read-only: schedules and evidence" },
};

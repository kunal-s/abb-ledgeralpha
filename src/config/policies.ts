// Policy defaults — ageing, materiality and delegation of authority.
// Product defaults; a workspace overrides them in Settings (docs/FRD.md §4.4).

import type { RoleId } from "@/types";

/** Review ageing (operational), distinct from Schedule III disclosure ageing. */
export const AGEING_POLICY = {
  basis: "postingDate" as "postingDate" | "documentDate" | "dueDate",
  buckets: [
    { id: "0-90", label: "0–90 days", min: 0, max: 90 },
    { id: "91-180", label: "91–180 days", min: 91, max: 180 },
    { id: "181-365", label: "181–365 days", min: 181, max: 365 },
    { id: "365+", label: "Over 365 days", min: 366, max: null },
  ],
  reviewThresholdDays: 180,
} as const;

/** Items at or above this need a written justification before a decision is proposed. */
export const MATERIALITY_POLICY = {
  documentedActionAmount: 1_00_000,
} as const;

/**
 * Delegation of authority. The preparer proposes; the chain approves in order.
 * Write-backs and tax write-offs add the tax specialist at any band.
 */
export const APPROVAL_BANDS = [
  { id: "B1", upTo: 5_00_000, chain: ["controller"] },
  { id: "B2", upTo: 50_00_000, chain: ["controller", "head-of-finance"] },
  { id: "B3", upTo: null, chain: ["controller", "head-of-finance", "cfo"] },
] as const satisfies readonly { id: string; upTo: number | null; chain: readonly RoleId[] }[];

export type ApprovalBandId = (typeof APPROVAL_BANDS)[number]["id"];

export function bandFor(amount: number): (typeof APPROVAL_BANDS)[number] {
  const abs = Math.abs(amount);
  return APPROVAL_BANDS.find((b) => b.upTo === null || abs <= b.upTo)!;
}

/** Actions that always need tax review, whatever the band. */
export const TAX_REVIEW_POLICY = ["Write back", "Write off of tax receivables"] as const;

/** How approved journals leave the platform. */
export const WRITE_BACK_POLICY = {
  mode: "proposal-file" as "proposal-file" | "governed-posting",
  label: "Proposal file for posting in the ERP",
};

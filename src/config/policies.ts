// Policy defaults — ageing, materiality and delegation of authority.
// Product defaults; a workspace overrides them in Settings (docs/FRD.md §4.4).

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

/** Items at or above this in the over-threshold buckets need a documented action. */
export const MATERIALITY_POLICY = {
  documentedActionAmount: 1_00_000,
} as const;

/**
 * Delegation of authority. The preparer proposes; the chain approves in order.
 * Write-backs and tax write-offs add the tax specialist at any band.
 */
export const APPROVAL_BANDS = [
  { id: "B1", upTo: 5_00_000, chain: ["controller"] },
  { id: "B2", upTo: 50_00_000, chain: ["controller", "escalation-1"] },
  { id: "B3", upTo: null, chain: ["controller", "escalation-1", "escalation-2"] },
] as const satisfies readonly { id: string; upTo: number | null; chain: readonly string[] }[];

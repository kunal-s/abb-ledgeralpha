import type { AccountReviewStatus } from "@/types";

/** The account's work is finished: the reviewer has signed it. */
export const accountStatusIsSigned = (s: AccountReviewStatus) => s === "reviewer-signed";

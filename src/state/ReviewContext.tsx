import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LineItem } from "@/types";
import { GL_BY_ID, LINE_BY_KEY } from "@/data";
import { ageOf, bucketOf } from "@/engine/review";
import { buildReview, useComputeReview, useDecisionsByItem, useFollowUpsByItem, type ItemRow, type Review } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";

const ReviewCtx = createContext<Review | null>(null);

/** One review model for the whole app: the drawer and every page read the same computation. */
export function ReviewProvider({ children }: { children: ReactNode }) {
  const review = useComputeReview();
  return <ReviewCtx.Provider value={review}>{children}</ReviewCtx.Provider>;
}

export function useReview(): Review {
  const r = useContext(ReviewCtx);
  if (!r) throw new Error("useReview must be used inside ReviewProvider");
  return r;
}

/** The review for the whole company, whatever business unit the top bar is scoped to (close, home, my work). */
export function useCompanyReview(): Review {
  const scoped = useReview();
  const decisions = useDecisionsByItem();
  const followUps = useFollowUpsByItem();
  const signOffs = useWorkflow((s) => s.signOffs);
  return useMemo(
    () => (scoped.businessUnitId === "all" ? scoped : buildReview({ run: scoped.run, recs: scoped.recs, decisions, followUps, signOffs, businessUnitId: "all", asOf: scoped.asOf })),
    [scoped, decisions, followUps, signOffs]
  );
}

/** The row for any line: the review's own, or a plain within-policy row. */
export function rowFor(review: Review, item: LineItem): ItemRow {
  const known = review.rowByKey.get(item.key);
  if (known) return known;
  const age = ageOf(item, review.asOf);
  return { key: item.key, item, hits: [], status: "within-policy", age, bucket: bucketOf(age), category: GL_BY_ID.get(item.gl)!.category, flagged: false, isOpen: false };
}

/** Everything the item drawer needs, for any line - flagged or not. */
export function useItemRow(key: string | undefined): ItemRow | undefined {
  const review = useReview();
  return useMemo(() => {
    if (!key) return undefined;
    const item = LINE_BY_KEY.get(key);
    return item ? rowFor(review, item) : undefined;
  }, [review, key]);
}

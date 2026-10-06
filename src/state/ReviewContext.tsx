import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { LineItem } from "@/types";
import { GL_BY_ID, LINE_BY_KEY } from "@/data";
import { ageOf, bucketOf } from "@/engine/review";
import { useComputeReview, type ItemRow, type Review } from "@/state/hooks";

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

/** The row for any line: the review's own, or a plain within-policy row. */
export function rowFor(review: Review, item: LineItem): ItemRow {
  const known = review.rowByKey.get(item.key);
  if (known) return known;
  const age = ageOf(item, review.asOf);
  return { key: item.key, item, hits: [], status: "within-policy", age, bucket: bucketOf(age), category: GL_BY_ID.get(item.gl)!.category, flagged: false, isOpen: false };
}

/** Everything the item drawer needs, for any line — flagged or not. */
export function useItemRow(key: string | undefined): ItemRow | undefined {
  const review = useReview();
  return useMemo(() => {
    if (!key) return undefined;
    const item = LINE_BY_KEY.get(key);
    return item ? rowFor(review, item) : undefined;
  }, [review, key]);
}

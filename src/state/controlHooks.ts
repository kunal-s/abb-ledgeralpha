import { useMemo } from "react";
import { WORLD } from "@/data";
import { useCompanyReview } from "@/state/ReviewContext";
import { useRecRows } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { useActivity } from "@/state/hooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { evaluateControls } from "@/engine/controls";

/** The control tests, from what the platform has recorded so far. */
export function useControls() {
  const review = useCompanyReview();
  const recRows = useRecRows();
  const { rows: journals } = useJournals(true);
  const events = useActivity();
  const decisions = useWorkflow((s) => s.decisions);
  const signOffs = useWorkflow((s) => s.signOffs);
  const journalReviews = useWorkflow((s) => s.journalReviews);
  const today = nowLocal().slice(0, 10);
  return useMemo(
    () => evaluateControls({
      periodEnd: WORLD.asOf, today, signOffs, recRows, accountsAwaiting: review.accounts.filter((a) => a.status !== "reviewer-signed").length,
      decisions: Object.values(decisions), journals, journalReviews, events,
    }),
    [today, signOffs, recRows, review, decisions, journals, journalReviews, events]
  );
}

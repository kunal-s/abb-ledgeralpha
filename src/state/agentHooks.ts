import { useMemo } from "react";
import { useCompanyReview } from "@/state/ReviewContext";
import { useRecRows } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { useCashApp } from "@/state/cashAppHooks";
import { useClose } from "@/state/closeHooks";
import { useActivity } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";
import { buildAgentStats } from "@/engine/agentStats";

/** The agent statistics, from the models the modules read and the decisions people have taken. */
export function useAgents() {
  const review = useCompanyReview();
  const recRows = useRecRows();
  const { rows: journals } = useJournals(true);
  const { rows: receipts } = useCashApp();
  const close = useClose();
  const events = useActivity();
  const decisions = useWorkflow((s) => s.decisions);
  const signOffs = useWorkflow((s) => s.signOffs);
  const followUps = useWorkflow((s) => s.followUps);
  const journalReviews = useWorkflow((s) => s.journalReviews);
  return useMemo(
    () => buildAgentStats({ decisions: Object.values(decisions), review, recRows, receipts, journals, close, signOffs, followUps: Object.values(followUps), journalReviews, events }),
    [decisions, review, recRows, receipts, journals, close, signOffs, followUps, journalReviews, events]
  );
}

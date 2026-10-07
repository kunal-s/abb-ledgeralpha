// The close model for the screens: the plan evaluated against the company-wide
// state of the records (not the business unit the top bar is scoped to).

import { useMemo } from "react";
import { usePeriodStore } from "@/lib/stores";
import { useCompanyReview } from "@/state/ReviewContext";
import { useRecRows } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { useCashApp } from "@/state/cashAppHooks";
import { usePbc } from "@/state/auditHooks";
import { useTds } from "@/state/tdsHooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { buildCloseModel, type CloseModel } from "@/state/closeModel";

/** `wd` reads the plan at another working day than today. */
export function useClose(wd?: number): CloseModel {
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const review = useCompanyReview();
  const recRows = useRecRows();
  const { rows: journals } = useJournals(true);
  const { rows: receipts } = useCashApp();
  const { states } = usePbc();
  const { analysis } = useTds();
  const decisions = useWorkflow((s) => s.decisions);
  const work = useWorkflow((s) => s.closeWork);
  const today = nowLocal().slice(0, 10);
  return useMemo(
    () => buildCloseModel({ periodEnd, today, wd, review, recRows, journals, receipts, decisions, pbc: states.map((s) => ({ id: s.req.id, status: s.status })), work, tds: analysis }),
    [periodEnd, today, wd, review, recRows, journals, receipts, decisions, states, work, analysis]
  );
}

// The acting role's queue, from the company-wide state of the modules.

import { useMemo } from "react";
import { useRoleStore } from "@/lib/stores";
import { useCompanyReview } from "@/state/ReviewContext";
import { useRecRows } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { useCashApp } from "@/state/cashAppHooks";
import { usePbc } from "@/state/auditHooks";
import { useClose } from "@/state/closeHooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { buildWork, urgency, type WorkItem } from "@/state/workModel";
import type { CloseModel } from "@/state/closeModel";

export function useWork(): { items: WorkItem[]; today: string; close: CloseModel } {
  const role = useRoleStore((s) => s.role);
  const review = useCompanyReview();
  const recRows = useRecRows();
  const { rows: journals } = useJournals(true);
  const { rows: receipts } = useCashApp();
  const { states: pbc } = usePbc();
  const close = useClose();
  const decisions = useWorkflow((s) => s.decisions);
  const followUps = useWorkflow((s) => s.followUps);
  const today = nowLocal().slice(0, 10);
  const items = useMemo(
    () => buildWork({ role, today, review, recRows, receipts, journals, decisions, followUps, pbc, close }).sort(urgency),
    [role, today, review, recRows, receipts, journals, decisions, followUps, pbc, close]
  );
  return { items, today, close };
}

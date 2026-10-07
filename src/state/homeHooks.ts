import { useMemo } from "react";
import { useRoleStore } from "@/lib/stores";
import { useCompanyReview } from "@/state/ReviewContext";
import { useRecRows } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { useCashApp } from "@/state/cashAppHooks";
import { usePbc } from "@/state/auditHooks";
import { useClose } from "@/state/closeHooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import { buildHome } from "@/state/homeModel";

export function useHome() {
  const role = useRoleStore((s) => s.role);
  const review = useCompanyReview();
  const recRows = useRecRows();
  const { rows: journals } = useJournals(true);
  const { rows: receipts } = useCashApp();
  const { states: pbc } = usePbc();
  const close = useClose();
  const decisions = useWorkflow((s) => s.decisions);
  const today = nowLocal().slice(0, 10);
  const home = useMemo(() => buildHome({ role, today, review, recRows, journals, receipts, decisions, pbc, close }), [role, today, review, recRows, journals, receipts, decisions, pbc, close]);
  return { ...home, close, today };
}

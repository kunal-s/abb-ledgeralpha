// React hooks over the engine and workflow state. Rule runs are cached per
// (period, rule configuration) so every screen shares one evaluation.

import { useMemo } from "react";
import type { ActivityEvent, Decision, FollowUp, ItemStatus, Recommendation } from "@/types";
import { usePeriodStore } from "@/lib/stores";
import { effectiveRules, runRules, type RuleOverrides, type RuleRun } from "@/engine/run";
import { recommendAll } from "@/engine/recommend";
import { seededHistory } from "@/engine/history";
import { useWorkflow } from "@/state/workflow";

const runCache = new Map<string, RuleRun>();

export function getRun(periodEnd: string, overrides: RuleOverrides): RuleRun {
  const key = `${periodEnd}|${JSON.stringify(overrides)}`;
  let run = runCache.get(key);
  if (!run) {
    run = runRules(periodEnd, effectiveRules(overrides));
    if (runCache.size > 12) runCache.delete(runCache.keys().next().value!);
    runCache.set(key, run);
  }
  return run;
}

export function useRuleRun(): RuleRun {
  const overrides = useWorkflow((s) => s.ruleOverrides);
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  return useMemo(() => getRun(periodEnd, overrides), [periodEnd, overrides]);
}

export function useOpenFollowUps(): ReadonlySet<string> {
  const followUps = useWorkflow((s) => s.followUps);
  return useMemo(() => new Set(Object.values(followUps).filter((f) => f.status === "open").map((f) => f.itemKey)), [followUps]);
}

export function useRecommendations(run: RuleRun): Map<string, Recommendation> {
  const open = useOpenFollowUps();
  return useMemo(() => recommendAll(run, open), [run, open]);
}

/** Seeded workspace history plus this session's events, newest first. */
export function useActivity(): ActivityEvent[] {
  const events = useWorkflow((s) => s.events);
  return useMemo(() => [...seededHistory(), ...events].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)), [events]);
}

/** Workflow status of an item, from its rule hits, decision and follow-up. */
export function itemStatus(flagged: boolean, decision?: Decision, followUp?: FollowUp): ItemStatus {
  if (decision) {
    if (decision.status === "closed-in-erp") return "closed-in-erp";
    if (decision.status === "exported") return "exported";
    if (decision.status === "approved") return "approved";
    if (decision.status === "rejected") return "rejected";
    if (decision.status === "proposed") return "decision-proposed";
  }
  if (followUp && followUp.status !== "closed") return "in-follow-up";
  return flagged ? "flagged" : "within-policy";
}

/** Latest non-withdrawn decision per item. */
export function useDecisionsByItem(): Map<string, Decision> {
  const decisions = useWorkflow((s) => s.decisions);
  return useMemo(() => {
    const m = new Map<string, Decision>();
    for (const d of Object.values(decisions)) {
      if (d.status === "withdrawn") continue;
      const cur = m.get(d.itemKey);
      if (!cur || d.proposedAt >= cur.proposedAt) m.set(d.itemKey, d);
    }
    return m;
  }, [decisions]);
}

// React hooks over the engine and workflow state. Rule runs are cached per
// (period, rule configuration) so every screen shares one evaluation.

import { useMemo } from "react";
import type {
  AccountCategory, AccountReviewStatus, AccountSignOff, ActivityEvent, Decision, FollowUp, IsoDate, ItemStatus, LineItem, Recommendation, RuleHit,
} from "@/types";
import { usePeriodStore, useScopeStore } from "@/lib/stores";
import { effectiveRules, runRules, type RuleOverrides, type RuleRun } from "@/engine/run";
import { recommendAll } from "@/engine/recommend";
import { seededHistory } from "@/engine/history";
import { previousQuarterEnd } from "@/engine/context";
import {
  accountStatus, ageOf, bucketOf, buildHeatmap, inScope, isReviewable, readiness, scanLedger,
  type AccountSummary, type BucketId, type Heatmap, type LedgerScan, type Readiness,
} from "@/engine/review";
import { GL_BY_ID } from "@/data";
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

/** Latest follow-up per item (open ones win). */
export function useFollowUpsByItem(): Map<string, FollowUp> {
  const followUps = useWorkflow((s) => s.followUps);
  return useMemo(() => {
    const m = new Map<string, FollowUp>();
    for (const f of Object.values(followUps)) {
      const cur = m.get(f.itemKey);
      const better = !cur || (cur.status === "closed" && f.status !== "closed") || (cur.status === f.status && f.createdAt >= cur.createdAt);
      if (better) m.set(f.itemKey, f);
    }
    return m;
  }, [followUps]);
}

// ---------------------------------------------------------------------------
// Balance Sheet Review: item rows, accounts, heatmap
// ---------------------------------------------------------------------------
export interface ItemRow {
  key: string;
  item: LineItem;
  hits: RuleHit[];
  rec?: Recommendation;
  decision?: Decision;
  followUp?: FollowUp;
  status: ItemStatus;
  age: number;
  bucket: BucketId;
  category: AccountCategory;
  flagged: boolean;
  /** open on an open-item-managed account at the period end */
  isOpen: boolean;
}

export interface AccountRow {
  summary: AccountSummary;
  flaggedCount: number;
  flaggedValue: number;
  signOff?: AccountSignOff;
  status: AccountReviewStatus;
  readiness: Readiness;
  hasCommentary: boolean;
}

export interface Review {
  asOf: IsoDate;
  priorDate: IsoDate;
  businessUnitId: string;
  run: RuleRun;
  recs: Map<string, Recommendation>;
  rows: ItemRow[];
  rowByKey: Map<string, ItemRow>;
  scan: LedgerScan;
  heatmap: Heatmap;
  accounts: AccountRow[];
  accountByGl: Map<string, AccountRow>;
}

const isDocumented = (r: ItemRow) =>
  (r.decision && ["proposed", "approved", "exported", "closed-in-erp"].includes(r.decision.status)) || (r.followUp && !!r.followUp.dueDate);

/** Computes the review model. Mounted once, in ReviewProvider - read it with `useReview()`. */
export function useComputeReview(): Review {
  const run = useRuleRun();
  const recs = useRecommendations(run);
  const decisions = useDecisionsByItem();
  const followUps = useFollowUpsByItem();
  const signOffs = useWorkflow((s) => s.signOffs);
  const businessUnitId = useScopeStore((s) => s.businessUnitId);
  const asOf = usePeriodStore((s) => s.periodEnd);

  return useMemo(() => {
    const priorDate = previousQuarterEnd(asOf);
    const rows: ItemRow[] = [];
    const rowByKey = new Map<string, ItemRow>();
    const openKeys = new Set<string>();
    const mk = (item: LineItem, isOpen: boolean): ItemRow => {
      const hits = run.byItem.get(item.key) ?? [];
      const decision = decisions.get(item.key);
      const followUp = followUps.get(item.key);
      const age = ageOf(item, asOf);
      return {
        key: item.key, item, hits, rec: recs.get(item.key), decision, followUp,
        status: itemStatus(hits.length > 0, decision, followUp),
        age, bucket: bucketOf(age), category: GL_BY_ID.get(item.gl)!.category, flagged: hits.length > 0, isOpen,
      };
    };
    for (const l of run.ctx.open) {
      if (!inScope(l, businessUnitId)) continue;
      openKeys.add(l.key);
      const r = mk(l, true);
      rows.push(r);
      rowByKey.set(r.key, r);
    }
    for (const l of run.items.values()) {
      if (openKeys.has(l.key) || !inScope(l, businessUnitId)) continue;
      const r = mk(l, false);
      rows.push(r);
      rowByKey.set(r.key, r);
    }

    const scan = scanLedger(asOf, priorDate, businessUnitId);
    const flaggedKeys = new Set(rows.filter((r) => r.flagged && r.isOpen).map((r) => r.key));
    const heatmap = buildHeatmap(rows.filter((r) => r.isOpen).map((r) => r.item), flaggedKeys, asOf);

    const byGl = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const list = byGl.get(r.item.gl);
      if (list) list.push(r);
      else byGl.set(r.item.gl, [r]);
    }
    const accounts: AccountRow[] = [];
    for (const s of scan.accounts.values()) {
      if (!isReviewable(s)) continue;
      const glRows = byGl.get(s.gl.gl) ?? [];
      const flagged = glRows.filter((r) => r.flagged);
      const signOff = signOffs[`${s.gl.gl}|${asOf}`];
      const hasCommentary = !!signOff?.commentary?.trim();
      const rd = readiness(flagged.map((r) => r.item), (k) => !!isDocumented(rowByKey.get(k)!), hasCommentary);
      const hasActivity = hasCommentary || glRows.some((r) => r.decision || r.followUp);
      accounts.push({
        summary: s,
        flaggedCount: flagged.length,
        flaggedValue: flagged.reduce((t, r) => t + Math.abs(r.item.amount), 0),
        signOff,
        status: accountStatus(signOff, rd.ready, hasActivity),
        readiness: rd,
        hasCommentary,
      });
    }
    accounts.sort((a, b) => a.summary.gl.gl.localeCompare(b.summary.gl.gl));
    return { asOf, priorDate, businessUnitId, run, recs, rows, rowByKey, scan, heatmap, accounts, accountByGl: new Map(accounts.map((a) => [a.summary.gl.gl, a])) };
  }, [run, recs, decisions, followUps, signOffs, businessUnitId, asOf]);
}

/** Events that concern an item: its own and those of bulk actions covering it. */
export function useItemHistory(key: string | undefined): ActivityEvent[] {
  const activity = useActivity();
  return useMemo(() => (key ? activity.filter((e) => e.object.id === key || e.itemKeys?.includes(key)) : []), [activity, key]);
}

// Builds the models the pages read, from the workflow store as it stands, for
// the tests. The date is fixed so the plan is read at the same working day on
// every machine.

import type { RoleId } from "@/types";
import { WORLD } from "@/data";
import { PBC_REQUESTS } from "@/data/workspace/pbc";
import { pbcState } from "@/engine/audit";
import { recommendAll } from "@/engine/recommend";
import { analyseTds } from "@/engine/tdsAnalysis";
import { auditInputsOf } from "@/state/auditHooks";
import { buildCashApp } from "@/state/cashAppHooks";
import { buildCloseModel } from "@/state/closeModel";
import { buildHome } from "@/state/homeModel";
import { buildReview, getRun, latestDecisions, latestFollowUps } from "@/state/hooks";
import { buildJournals } from "@/state/journalHooks";
import { buildRecRows } from "@/state/recHooks";
import { useWorkflow } from "@/state/workflow";
import { buildWork } from "@/state/workModel";

export const TODAY = "2026-10-07";

export function modelsAt(opts: { wd?: number; today?: string } = {}) {
  const s = useWorkflow.getState();
  const today = opts.today ?? TODAY;
  const run = getRun(WORLD.asOf, s.ruleOverrides);
  const decisionByItem = latestDecisions(s.decisions);
  const followUpByItem = latestFollowUps(s.followUps);
  const open = new Set(Object.values(s.followUps).filter((f) => f.status === "open").map((f) => f.itemKey));
  const review = buildReview({ run, recs: recommendAll(run, open), decisions: decisionByItem, followUps: followUpByItem, signOffs: s.signOffs, businessUnitId: "all", asOf: WORLD.asOf });
  const recRows = buildRecRows({ recs: s.recs, signOffs: s.signOffs, decisions: s.decisions, followUps: s.followUps });
  const journals = buildJournals(WORLD.asOf, "all", s.journalReviews, followUpByItem).rows;
  const receipts = buildCashApp({ decisions: s.decisions, work: s.cashApp, decisionByItem, followUpByItem }).rows;
  const inputs = auditInputsOf(review, recRows, journals.filter((j) => j.flags.length > 0));
  const pbc = [...PBC_REQUESTS, ...s.pbcRaised].map((r) => pbcState(r, s.pbc[r.id], inputs, today));
  const tds = analyseTds(WORLD.asOf, { statementLagDays: 75, toleranceAmount: 10 });
  const close = buildCloseModel({
    periodEnd: WORLD.asOf, today, wd: opts.wd, review, recRows, journals, receipts, decisions: s.decisions,
    pbc: pbc.map((p) => ({ id: p.req.id, status: p.status })), work: s.closeWork, tds,
  });
  return {
    review, recRows, journals, receipts, pbc, close, today,
    work: (role: RoleId) => buildWork({ role, today, review, recRows, receipts, journals, decisions: s.decisions, followUps: s.followUps, pbc, close }),
    home: (role: RoleId) => buildHome({ role, today, review, recRows, journals, receipts, decisions: s.decisions, pbc, close }),
  };
}

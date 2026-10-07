// The close model: the plan evaluated against the state of the records, and the
// status of the work by business unit and close area. A pure function of the
// models the pages already read, so the cockpit, Home and My Work agree and the
// tests can build the same thing.

import type { ClosePhaseDef, CloseTaskDef, CloseTaskWork, Decision, IsoDate, PbcStatus } from "@/types";
import { LINE_BY_KEY, WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { CLOSE_PHASES, CLOSE_TARGET_WD, CLOSE_TASKS, CLOSE_WD_RANGE } from "@/data/workspace/close";
import { CORPORATE, buOfJournal, buOfParty, buOfProfitCentre, buOfRec } from "@/engine/attribution";
import {
  CLOSE_AREAS, areaWindow, cellState, evaluateClose, isQuarterEnd, summarisePhases,
  type AreaCell, type CellState, type CloseArea, type CloseEvaluation, type CloseInputs, type PhaseSummary,
} from "@/engine/close";
import type { TdsAnalysis } from "@/engine/tdsAnalysis";
import { buildProposal } from "@/engine/journals";
import { addDays, monthEnd } from "@/lib/dates";
import { wdOf } from "@/lib/workdays";
import type { Review } from "@/state/hooks";
import type { JournalRow } from "@/state/journalHooks";
import type { ReceiptRow } from "@/state/cashAppHooks";
import type { RecRow } from "@/state/recHooks";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface BuUnit {
  id: string;
  name: string;
}

/** The units rows are drawn for: the workspace's, then corporate. */
export const BU_ROWS: BuUnit[] = [...TENANT.businessUnits, { id: CORPORATE, name: "Corporate" }];

export interface MatrixCell {
  cell: AreaCell;
  state: CellState;
}

export interface CloseMatrix {
  areas: { area: CloseArea; window: { startWd: number; dueWd: number } }[];
  units: BuUnit[];
  cells: Record<string, Record<string, MatrixCell>>;
}

export interface CloseModel {
  periodEnd: IsoDate;
  today: IsoDate;
  quarter: boolean;
  /** the working day the cockpit reads the plan at */
  currentWd: number;
  /** the working day it really is, within the calendar */
  realWd: number;
  targetWd: number;
  phases: ClosePhaseDef[];
  tasks: CloseTaskDef[];
  inputs: CloseInputs;
  evaluation: CloseEvaluation;
  summaries: PhaseSummary[];
  matrix: CloseMatrix;
}

export interface CloseModelInput {
  periodEnd: IsoDate;
  today: IsoDate;
  /** read the plan at this working day instead of today */
  wd?: number;
  review: Review;
  recRows: RecRow[];
  journals: JournalRow[];
  receipts: ReceiptRow[];
  decisions: Record<string, Decision>;
  pbc: { id: string; status: PbcStatus }[];
  work: Record<string, CloseTaskWork>;
  tds: TdsAnalysis;
}

const monthDocTypes = new Map<string, { types: Set<string>; accruals: boolean }>();

/** Which document types were posted in the period's month, and whether its accrual was. */
function monthPostings(periodEnd: IsoDate): { types: Set<string>; accruals: boolean } {
  const hit = monthDocTypes.get(periodEnd);
  if (hit) return hit;
  const start = addDays(monthEnd(addDays(periodEnd, -32)), 1);
  const accrualRef = `ACR-${periodEnd.slice(0, 7)}`;
  const types = new Set<string>();
  let accruals = false;
  for (const l of WORLD.lines) {
    if (l.postingDate > periodEnd) break;
    if (l.postingDate < start) continue;
    types.add(l.docType);
    if (l.assignment === accrualRef) accruals = true;
  }
  const out = { types, accruals };
  monthDocTypes.set(periodEnd, out);
  return out;
}

const LIVE = ["proposed", "approved", "exported", "closed-in-erp"];

export function buildCloseModel(i: CloseModelInput): CloseModel {
  const quarter = isQuarterEnd(i.periodEnd);
  const phases = CLOSE_PHASES.filter((p) => quarter || !p.quarterOnly);
  const phaseIds = new Set(phases.map((p) => p.id));
  const tasks = CLOSE_TASKS.filter((t) => phaseIds.has(t.phase));
  const targetWd = quarter ? CLOSE_TARGET_WD.quarter : CLOSE_TARGET_WD.month;
  const realWd = clamp(wdOf(i.periodEnd, i.today), CLOSE_WD_RANGE.min, CLOSE_WD_RANGE.max);
  const currentWd = i.wd === undefined ? realWd : clamp(i.wd, CLOSE_WD_RANGE.min, CLOSE_WD_RANGE.max);

  // what the derived tasks read
  const proposals = Object.values(i.decisions).filter((d) => LIVE.includes(d.status) && buildProposal(d));
  const required = i.review.accounts.flatMap((a) => a.readiness.required.map((l) => ({ line: l, documented: !a.readiness.undocumented.includes(l) })));
  const postings = monthPostings(i.periodEnd);
  const flaggedJournals = i.journals.filter((j) => j.flags.length > 0);
  const inputs: CloseInputs = {
    accounts: i.review.accounts.map((a) => ({ category: a.summary.gl.category, status: a.status })),
    recs: i.recRows.map((r) => ({ type: r.rec.type, status: r.status })),
    flagged: { total: required.length, documented: required.filter((r) => r.documented).length },
    journals: { total: flaggedJournals.length, done: flaggedJournals.filter((j) => j.status === "accepted").length },
    proposals: { total: proposals.length, done: proposals.filter((d) => d.status === "exported" || d.status === "closed-in-erp").length },
    receipts: { total: i.receipts.length, done: i.receipts.filter((r) => ["decision-proposed", "approved", "exported", "closed-in-erp", "parked"].includes(r.status)).length },
    postings: postings.types,
    accruals: postings.accruals,
    pbc: i.pbc,
  };

  const evaluation = evaluateClose({ tasks, work: i.work, inputs, currentWd, targetWd });
  const summaries = summarisePhases(phases, evaluation.states);

  // status by business unit and close area
  const cells: Record<string, Record<string, AreaCell>> = Object.fromEntries(CLOSE_AREAS.map((a) => [a.id, {}]));
  const add = (area: CloseArea["id"], bu: string, done: boolean, value: number) => {
    const c = (cells[area][bu] ??= { done: 0, total: 0, openValue: 0 });
    c.total += 1;
    if (done) c.done += 1;
    else c.openValue += value;
  };
  for (const r of required) add("bsr", buOfProfitCentre(r.line.profitCentre), r.documented, Math.abs(r.line.amount));
  for (const r of i.recRows) add("recs", buOfRec(r.rec), r.status === "reviewer-signed", Math.abs(r.view.unexplained ?? r.view.difference ?? 0));
  for (const j of flaggedJournals) add("journals", buOfJournal(j.doc), j.status === "accepted", j.doc.amount);
  for (const r of i.receipts) add("cash", buOfParty(r.customerId), ["decision-proposed", "approved", "exported", "closed-in-erp", "parked"].includes(r.status), r.receipt.amount);
  for (const [lineKey, alloc] of i.tds.byLine) {
    if (alloc.status === "pending") continue; // the statement is not out yet: nothing to act on
    const line = LINE_BY_KEY.get(lineKey);
    if (line) add("tax", buOfParty(line.partner?.id), alloc.status === "matched", Math.abs(line.amount));
  }
  const areas = CLOSE_AREAS.map((area) => ({ area, window: areaWindow(area, tasks) }));
  const matrix: CloseMatrix = {
    areas, units: BU_ROWS,
    cells: Object.fromEntries(
      areas.map(({ area, window }) => [
        area.id,
        Object.fromEntries(BU_ROWS.map((u) => [u.id, { cell: cells[area.id][u.id] ?? { done: 0, total: 0, openValue: 0 }, state: cellState(cells[area.id][u.id], window, currentWd) }])),
      ])
    ),
  };

  return { periodEnd: i.periodEnd, today: i.today, quarter, currentWd, realWd, targetWd, phases, tasks, inputs, evaluation, summaries, matrix };
}

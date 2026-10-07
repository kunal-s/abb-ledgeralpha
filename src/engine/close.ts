// The close orchestrator (docs/FRD.md §6.3): evaluates the close plan against
// the work done in the platform, finds what is late and what stands in the way,
// and projects when the close will be signed off. Pure and deterministic: the
// caller supplies the plan, what has been done, and the working day it is.

import { TENANT } from "@/config/tenant";
import type { AccountCategory, AccountReviewStatus, CloseLink, ClosePhaseDef, CloseTaskDef, CloseTaskWork, PbcStatus, ReconType } from "@/types";

export type CloseTaskStatus = "not-started" | "in-progress" | "complete" | "blocked";

/** Whether the period end closes a fiscal quarter, which adds the quarter-end phase. */
export function isQuarterEnd(periodEnd: string): boolean {
  const month = Number(periodEnd.slice(5, 7));
  return (((month - TENANT.fiscalYear.startMonth + 12) % 12) + 1) % 3 === 0;
}

/** What the derived tasks read: the state of the records they depend on. */
export interface CloseInputs {
  accounts: { category: AccountCategory; status: AccountReviewStatus }[];
  recs: { type: ReconType; status: AccountReviewStatus }[];
  flagged: { total: number; documented: number };
  journals: { total: number; done: number };
  proposals: { total: number; done: number };
  receipts: { total: number; done: number };
  /** document types posted in the closing month */
  postings: ReadonlySet<string>;
  accruals: boolean;
  pbc: { id: string; status: PbcStatus }[];
}

export interface TaskProgress {
  done: number;
  total: number;
  label: string;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** How far the record behind a task has got; undefined for a task the owner completes by hand. */
export function deriveProgress(link: CloseLink, input: CloseInputs): TaskProgress | undefined {
  switch (link.kind) {
    case "manual":
      return undefined;
    case "accounts": {
      const xs = input.accounts.filter((a) => link.categories.includes(a.category));
      const done = xs.filter((a) => a.status === "reviewer-signed").length;
      return { done, total: xs.length, label: `${done} of ${xs.length} ${plural(xs.length, "account", "accounts")} signed off` };
    }
    case "recs": {
      const xs = input.recs.filter((r) => link.types.includes(r.type));
      const done = xs.filter((r) => r.status === "reviewer-signed").length;
      return { done, total: xs.length, label: `${done} of ${xs.length} ${plural(xs.length, "reconciliation", "reconciliations")} signed off` };
    }
    case "flagged-documented":
      return { done: input.flagged.documented, total: input.flagged.total, label: `${input.flagged.documented} of ${input.flagged.total} flagged ${plural(input.flagged.total, "item", "items")} documented` };
    case "journals-reviewed":
      return { done: input.journals.done, total: input.journals.total, label: `${input.journals.done} of ${input.journals.total} flagged ${plural(input.journals.total, "journal", "journals")} accepted` };
    case "proposals-exported":
      return { done: input.proposals.done, total: input.proposals.total, label: `${input.proposals.done} of ${input.proposals.total} ${plural(input.proposals.total, "entry", "entries")} exported` };
    case "receipts-handled":
      return { done: input.receipts.done, total: input.receipts.total, label: `${input.receipts.done} of ${input.receipts.total} ${plural(input.receipts.total, "receipt", "receipts")} applied or parked` };
    case "postings": {
      const done = input.postings.has(link.docType) ? 1 : 0;
      return { done, total: 1, label: done ? "Posted in the ledger" : "Nothing posted yet" };
    }
    case "accruals-posted":
      return { done: input.accruals ? 1 : 0, total: 1, label: input.accruals ? "Posted in the ledger" : "Nothing posted yet" };
    case "pbc": {
      const xs = input.pbc.filter((p) => !link.ids || link.ids.includes(p.id));
      const done = xs.filter((p) => p.status === "provided" || p.status === "closed").length;
      return link.ids
        ? { done, total: xs.length, label: `${done} of ${xs.length} ${plural(xs.length, "request", "requests")} provided` }
        : { done, total: xs.length, label: `${done} of ${xs.length} auditor requests provided` };
    }
  }
}

export interface TaskState {
  task: CloseTaskDef;
  ownerId: string;
  status: CloseTaskStatus;
  /** derived from a record, as against completed by hand */
  derived: boolean;
  done: number;
  total: number;
  /** 0..1 */
  fraction: number;
  label: string;
  /** past its due working day and not complete */
  late: boolean;
  lateBy: number;
  /** predecessors not yet complete */
  waitingOn: string[];
  blocker?: CloseTaskWork["blocker"];
  completed?: CloseTaskWork["completed"];
  /** working day the task is projected to finish */
  projectedFinish: number;
  /** the projected finish is after the due day */
  slipping: boolean;
  critical: boolean;
}

export interface CloseEvaluation {
  states: TaskState[];
  byId: Map<string, TaskState>;
  currentWd: number;
  targetWd: number;
  projectedClose: number;
  onTrack: boolean;
  /** the chain of unfinished tasks that decides the projected close, first to last */
  criticalPath: string[];
  /** 0..1, every task counting the same */
  progress: number;
}

/** Tasks in an order where every task follows the ones it depends on. */
function inDependencyOrder(tasks: CloseTaskDef[]): CloseTaskDef[] {
  const ids = new Set(tasks.map((t) => t.id));
  const placed = new Set<string>();
  const out: CloseTaskDef[] = [];
  let left = [...tasks];
  while (left.length) {
    const ready = left.filter((t) => t.after.every((a) => !ids.has(a) || placed.has(a)));
    if (!ready.length) throw new Error(`Close plan has a cycle among ${left.map((t) => t.id).join(", ")}`);
    for (const t of ready) {
      out.push(t);
      placed.add(t.id);
    }
    left = left.filter((t) => !placed.has(t.id));
  }
  return out;
}

export interface EvaluateInput {
  tasks: CloseTaskDef[];
  work: Record<string, CloseTaskWork>;
  inputs: CloseInputs;
  currentWd: number;
  targetWd: number;
}

export function evaluateClose({ tasks, work, inputs, currentWd, targetWd }: EvaluateInput): CloseEvaluation {
  const ordered = inDependencyOrder(tasks);
  const byId = new Map<string, TaskState>();

  for (const task of ordered) {
    const w = work[task.id];
    const preds = task.after.map((a) => byId.get(a)).filter((p): p is TaskState => !!p);
    const waitingOn = preds.filter((p) => p.status !== "complete").map((p) => p.task.id);
    const derivedProgress = deriveProgress(task.link, inputs);
    let done = 0;
    let total = 1;
    let label = "Not started";
    let complete = false;

    if (!derivedProgress) {
      complete = !!w?.completed;
      done = complete ? 1 : 0;
      label = complete ? `Completed ${w!.completed!.evidence ? `(${w!.completed!.evidence})` : ""}`.trim() : "Not started";
    } else if (derivedProgress.total === 0) {
      // nothing to do: complete once what it follows is complete, so it does not finish ahead of its predecessors
      complete = waitingOn.length === 0;
      done = complete ? 1 : 0;
      label = complete ? "Nothing to do" : "Nothing to do yet";
    } else {
      ({ done, total } = derivedProgress);
      label = derivedProgress.label;
      complete = done >= total;
    }

    const blocker = !complete ? w?.blocker : undefined;
    const status: CloseTaskStatus = complete ? "complete" : blocker ? "blocked" : done > 0 ? "in-progress" : "not-started";
    const fraction = complete ? 1 : total > 0 ? done / total : 0;
    const late = !complete && task.dueWd < currentWd;

    // projection: the work left, from today or the planned start; and never earlier than each predecessor's
    // projected finish plus the time the plan allows after that predecessor's due day
    let projectedFinish: number;
    if (complete) projectedFinish = Math.min(task.dueWd, currentWd);
    else {
      const duration = Math.max(1, task.dueWd - task.startWd + 1);
      const remaining = Math.max(1, Math.ceil(duration * (1 - fraction)));
      const ownFinish = Math.max(task.startWd, currentWd) + remaining - 1;
      const gate = preds.reduce((m, p) => Math.max(m, p.projectedFinish + Math.max(0, task.dueWd - p.task.dueWd)), -Infinity);
      projectedFinish = Math.max(ownFinish, gate);
    }

    byId.set(task.id, {
      task, ownerId: w?.ownerId ?? task.ownerId, status, derived: !!derivedProgress, done, total, fraction, label,
      late, lateBy: late ? currentWd - task.dueWd : 0, waitingOn, blocker, completed: w?.completed,
      projectedFinish, slipping: !complete && projectedFinish > task.dueWd, critical: false,
    });
  }

  const states = ordered.map((t) => byId.get(t.id)!);
  const open = states.filter((s) => s.status !== "complete");
  const projectedClose = open.length ? Math.max(...open.map((s) => s.projectedFinish)) : Math.min(targetWd, currentWd);

  // the critical path: from the unfinished task that finishes last, back through the predecessor that holds it up
  const criticalPath: string[] = [];
  if (open.length) {
    let cur: TaskState | undefined = open.reduce((a, b) => (b.projectedFinish > a.projectedFinish || (b.projectedFinish === a.projectedFinish && b.task.dueWd > a.task.dueWd) ? b : a));
    while (cur) {
      criticalPath.unshift(cur.task.id);
      cur.critical = true;
      const holdingUp: TaskState[] = cur.task.after.map((a) => byId.get(a)!).filter((p) => p && p.status !== "complete");
      cur = holdingUp.length ? holdingUp.reduce((a, b) => (b.projectedFinish > a.projectedFinish ? b : a)) : undefined;
    }
  }

  return {
    states, byId, currentWd, targetWd, projectedClose, onTrack: projectedClose <= targetWd, criticalPath,
    progress: states.length ? states.reduce((s, x) => s + x.fraction, 0) / states.length : 0,
  };
}

export interface PhaseSummary {
  phase: ClosePhaseDef;
  tasks: TaskState[];
  complete: number;
  /** 0..1 */
  progress: number;
  startWd: number;
  dueWd: number;
  status: CloseTaskStatus;
  late: number;
  blocked: number;
  critical: boolean;
}

export function summarisePhases(phases: ClosePhaseDef[], states: TaskState[]): PhaseSummary[] {
  return phases
    .map((phase): PhaseSummary | undefined => {
      const tasks = states.filter((s) => s.task.phase === phase.id);
      if (!tasks.length) return undefined;
      const complete = tasks.filter((s) => s.status === "complete").length;
      const blocked = tasks.filter((s) => s.status === "blocked").length;
      const status: CloseTaskStatus = complete === tasks.length ? "complete" : blocked ? "blocked" : tasks.some((s) => s.status === "in-progress" || s.status === "complete") ? "in-progress" : "not-started";
      return {
        phase, tasks, complete, blocked, status,
        progress: tasks.reduce((s, x) => s + x.fraction, 0) / tasks.length,
        startWd: Math.min(...tasks.map((s) => s.task.startWd)),
        dueWd: Math.max(...tasks.map((s) => s.task.dueWd)),
        late: tasks.filter((s) => s.late).length,
        critical: tasks.some((s) => s.critical),
      };
    })
    .filter((p): p is PhaseSummary => !!p);
}

// ---------------------------------------------------------------------------
// Status by business unit and close area
// ---------------------------------------------------------------------------
export interface CloseArea {
  id: "bsr" | "recs" | "journals" | "cash" | "tax";
  label: string;
  /** the plan tasks that set the window in which the work is expected to be done */
  taskIds: string[];
}

export const CLOSE_AREAS: CloseArea[] = [
  { id: "bsr", label: "Balance sheet review", taskIds: ["D1", "D2", "D3", "D4", "D5", "D6", "D7"] },
  { id: "recs", label: "Reconciliations", taskIds: ["C2", "C3", "C4", "C5", "C6"] },
  { id: "journals", label: "Journals", taskIds: ["E1"] },
  { id: "cash", label: "Cash application", taskIds: ["C1"] },
  { id: "tax", label: "Withholding tax", taskIds: ["F1"] },
];

export interface AreaCell {
  done: number;
  total: number;
  /** value at stake in what is not done, for sorting and tooltips */
  openValue: number;
}

export type CellState = "none" | "complete" | "on-track" | "behind";

/** The share of the work a plan window expects to be done by a working day: none before it opens, all once it closes. */
export function expectedFraction(window: { startWd: number; dueWd: number }, wd: number): number {
  if (wd < window.startWd) return 0;
  if (wd >= window.dueWd) return 1;
  return (wd - window.startWd + 1) / (window.dueWd - window.startWd + 1);
}

/** Complete, on track against the plan, or behind it: the same test for every cell, so cells compare. */
export function cellState(cell: AreaCell | undefined, window: { startWd: number; dueWd: number }, wd: number, slack = 0.2): CellState {
  if (!cell || cell.total === 0) return "none";
  if (cell.done >= cell.total) return "complete";
  if (wd > window.dueWd) return "behind"; // the window has closed and the work is not done
  return cell.done / cell.total >= expectedFraction(window, wd) - slack ? "on-track" : "behind";
}

export function areaWindow(area: CloseArea, tasks: CloseTaskDef[]): { startWd: number; dueWd: number } {
  const xs = tasks.filter((t) => area.taskIds.includes(t.id));
  return xs.length ? { startWd: Math.min(...xs.map((t) => t.startWd)), dueWd: Math.max(...xs.map((t) => t.dueWd)) } : { startWd: 0, dueWd: 0 };
}

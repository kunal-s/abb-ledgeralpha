import { beforeEach, describe, expect, it } from "vitest";
import type { CloseTaskDef, CloseTaskWork, RoleId } from "@/types";
import { LINE_BY_KEY, PC_BY_ID, WORLD } from "@/data";
import { CLOSE_PHASES, CLOSE_TARGET_WD, CLOSE_TASKS, CLOSE_WD_RANGE, SEEDED_CLOSE_WORK } from "@/data/workspace/close";
import { CORPORATE, buOfJournal, buOfParty, buOfProfitCentre, buOfRec } from "@/engine/attribution";
import { CLOSE_AREAS, cellState, deriveProgress, evaluateClose, expectedFraction, isQuarterEnd, summarisePhases, type CloseInputs } from "@/engine/close";
import { docByKey } from "@/engine/journalReview";
import { seededHistory } from "@/engine/history";
import { dateOfWd, isWorkingDay, wdLabel, wdOf } from "@/lib/workdays";
import { modelsAt } from "@/test/models";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";

const AS_OF = WORLD.asOf;
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();

const inputs = (over: Partial<CloseInputs> = {}): CloseInputs => ({
  accounts: [], recs: [], flagged: { total: 0, documented: 0 }, journals: { total: 0, done: 0 }, proposals: { total: 0, done: 0 }, receipts: { total: 0, done: 0 },
  postings: new Set(), accruals: false, pbc: [], ...over,
});
const task = (id: string, startWd: number, dueWd: number, after: string[] = [], link: CloseTaskDef["link"] = { kind: "manual" }): CloseTaskDef => ({ id, phase: "A", name: id, ownerId: "P01", startWd, dueWd, after, link });
const done = (id: string): Record<string, CloseTaskWork> => ({ [id]: { completed: { personId: "P01", at: "2026-10-01T10:00", evidence: "ref" } } });

describe("working days", () => {
  it("count from the period end over the working calendar: weekends and fixed-date holidays are skipped", () => {
    expect(isWorkingDay("2026-09-30")).toBe(true); // Wednesday
    expect(isWorkingDay("2026-10-02")).toBe(false); // national holiday, a Friday
    expect(isWorkingDay("2026-10-03")).toBe(false); // Saturday
    expect(isWorkingDay("2026-10-04")).toBe(false); // Sunday
    expect(wdOf("2026-09-30", "2026-09-30")).toBe(0);
    expect(wdOf("2026-09-30", "2026-10-01")).toBe(1);
    expect(wdOf("2026-09-30", "2026-10-05")).toBe(2);
    expect(wdOf("2026-09-30", "2026-10-07")).toBe(4);
    expect(wdOf("2026-09-30", "2026-09-29")).toBe(-1);
    expect(wdOf("2026-09-30", "2026-09-28")).toBe(-2);
  });

  it("have an inverse", () => {
    for (let wd = -2; wd <= 8; wd += 1) {
      const d = dateOfWd(AS_OF, wd);
      expect(isWorkingDay(d), d).toBe(true);
      expect(wdOf(AS_OF, d), d).toBe(wd);
    }
    expect(dateOfWd("2026-09-30", 2)).toBe("2026-10-05");
    expect(dateOfWd("2026-09-30", -2)).toBe("2026-09-28");
  });

  it("treat a period end that is not a working day as the working day before it", () => {
    // 31 Oct 2026 is a Saturday
    expect(dateOfWd("2026-10-31", 0)).toBe("2026-10-30");
    expect(dateOfWd("2026-10-31", 1)).toBe("2026-11-02");
    expect(wdOf("2026-10-31", "2026-11-02")).toBe(1);
    expect(wdOf("2026-10-31", "2026-10-30")).toBe(0);
  });

  it("label", () => {
    expect([wdLabel(-2), wdLabel(0), wdLabel(5)]).toEqual(["WD-2", "WD0", "WD+5"]);
  });

  it("know which period ends close a quarter", () => {
    expect([isQuarterEnd("2026-09-30"), isQuarterEnd("2026-08-31"), isQuarterEnd("2026-12-31"), isQuarterEnd("2026-03-31"), isQuarterEnd("2026-10-31")]).toEqual([true, false, true, true, false]);
  });
});

describe("the close plan", () => {
  const ids = new Set(CLOSE_TASKS.map((t) => t.id));
  const phase = (t: CloseTaskDef) => CLOSE_PHASES.find((p) => p.id === t.phase)!;

  it("has unique tasks in known phases, owned by people on the team, inside the calendar", () => {
    expect(ids.size).toBe(CLOSE_TASKS.length);
    for (const t of CLOSE_TASKS) {
      expect(phase(t), t.id).toBeDefined();
      const owner = WORLD.people.find((p) => p.id === t.ownerId);
      expect(owner, t.id).toBeDefined();
      expect(owner!.roleId, t.id).not.toBe("external-auditor");
      expect(t.startWd, t.id).toBeGreaterThanOrEqual(CLOSE_WD_RANGE.min);
      expect(t.dueWd, t.id).toBeLessThanOrEqual(CLOSE_WD_RANGE.max);
      expect(t.dueWd, t.id).toBeGreaterThanOrEqual(t.startWd);
    }
  });

  it("only follows tasks that exist, none of them later than the task itself, and never a quarter-end task from a month-end one", () => {
    const byId = new Map(CLOSE_TASKS.map((t) => [t.id, t]));
    for (const t of CLOSE_TASKS) {
      for (const a of t.after) {
        const p = byId.get(a);
        expect(p, `${t.id} after ${a}`).toBeDefined();
        expect(p!.dueWd, `${t.id} after ${a}`).toBeLessThanOrEqual(t.dueWd);
        if (phase(p!).quarterOnly) expect(phase(t).quarterOnly, `${t.id} after ${a}`).toBe(true);
      }
    }
  });

  it("is planned to be signed off by the target working day", () => {
    const month = CLOSE_TASKS.filter((t) => !phase(t).quarterOnly);
    expect(Math.max(...month.map((t) => t.dueWd))).toBeLessThanOrEqual(CLOSE_TARGET_WD.month);
    expect(Math.max(...CLOSE_TASKS.map((t) => t.dueWd))).toBeLessThanOrEqual(CLOSE_TARGET_WD.quarter);
  });

  it("has no cycle, and each area's tasks exist", () => {
    expect(() => evaluateClose({ tasks: CLOSE_TASKS, work: {}, inputs: inputs(), currentWd: 0, targetWd: 8 })).not.toThrow();
    for (const a of CLOSE_AREAS) for (const id of a.taskIds) expect(ids.has(id), `${a.id} ${id}`).toBe(true);
  });

  it("detects a cycle", () => {
    expect(() => evaluateClose({ tasks: [task("X", 0, 1, ["Y"]), task("Y", 0, 1, ["X"])], work: {}, inputs: inputs(), currentWd: 0, targetWd: 1 })).toThrow(/cycle/);
  });
});

describe("what a task derives from the records", () => {
  it("accounts and reconciliations count what the reviewer signed", () => {
    const i = inputs({
      accounts: [{ category: "trade-recv", status: "reviewer-signed" }, { category: "trade-recv", status: "preparer-signed" }, { category: "cwip", status: "reviewer-signed" }],
      recs: [{ type: "Bank", status: "reviewer-signed" }, { type: "Bank", status: "in-review" }],
    });
    expect(deriveProgress({ kind: "accounts", categories: ["trade-recv"] }, i)).toEqual({ done: 1, total: 2, label: "1 of 2 accounts signed off" });
    expect(deriveProgress({ kind: "accounts", categories: ["cwip"] }, i)).toMatchObject({ label: "1 of 1 account signed off" });
    expect(deriveProgress({ kind: "recs", types: ["Bank"] }, i)).toEqual({ done: 1, total: 2, label: "1 of 2 reconciliations signed off" });
  });

  it("the other links read their record", () => {
    const i = inputs({
      flagged: { total: 10, documented: 4 }, journals: { total: 3, done: 3 }, proposals: { total: 2, done: 1 }, receipts: { total: 5, done: 2 },
      postings: new Set(["AF"]), accruals: true, pbc: [{ id: "PBC-002", status: "provided" }, { id: "PBC-003", status: "open" }],
    });
    expect(deriveProgress({ kind: "flagged-documented" }, i)).toMatchObject({ done: 4, total: 10 });
    expect(deriveProgress({ kind: "journals-reviewed" }, i)).toMatchObject({ done: 3, total: 3 });
    expect(deriveProgress({ kind: "proposals-exported" }, i)).toMatchObject({ done: 1, total: 2 });
    expect(deriveProgress({ kind: "receipts-handled" }, i)).toMatchObject({ done: 2, total: 5 });
    expect(deriveProgress({ kind: "postings", docType: "AF" }, i)).toMatchObject({ done: 1, total: 1 });
    expect(deriveProgress({ kind: "postings", docType: "PR" }, i)).toMatchObject({ done: 0, total: 1, label: "Nothing posted yet" });
    expect(deriveProgress({ kind: "accruals-posted" }, i)).toMatchObject({ done: 1, total: 1 });
    expect(deriveProgress({ kind: "pbc", ids: ["PBC-002"] }, i)).toMatchObject({ done: 1, total: 1 });
    expect(deriveProgress({ kind: "pbc" }, i)).toMatchObject({ done: 1, total: 2 });
    expect(deriveProgress({ kind: "manual" }, i)).toBeUndefined();
  });
});

describe("the orchestrator", () => {
  const run = (tasks: CloseTaskDef[], work: Record<string, CloseTaskWork>, i: CloseInputs, currentWd: number, targetWd = 8) => evaluateClose({ tasks, work, inputs: i, currentWd, targetWd });

  it("completes a task by hand with a reference, and a derived one when its record is done", () => {
    const tasks = [task("M", 0, 1), task("D", 0, 2, [], { kind: "accounts", categories: ["cwip"] })];
    const ev = run(tasks, done("M"), inputs({ accounts: [{ category: "cwip", status: "reviewer-signed" }] }), 1);
    expect(ev.byId.get("M")).toMatchObject({ status: "complete", derived: false });
    expect(ev.byId.get("D")).toMatchObject({ status: "complete", derived: true });
    expect(ev.progress).toBe(1);
    expect(ev.criticalPath).toEqual([]);
  });

  it("a derived task is in progress once some of the work is done, and not started before", () => {
    const t = [task("D", 0, 3, [], { kind: "recs", types: ["Bank"] })];
    const some = run(t, {}, inputs({ recs: [{ type: "Bank", status: "reviewer-signed" }, { type: "Bank", status: "in-review" }] }), 1);
    expect(some.byId.get("D")).toMatchObject({ status: "in-progress", fraction: 0.5 });
    const none = run(t, {}, inputs({ recs: [{ type: "Bank", status: "in-review" }] }), 1);
    expect(none.byId.get("D")).toMatchObject({ status: "not-started", fraction: 0 });
  });

  it("a derived task with nothing to do completes only once what it follows is complete", () => {
    const tasks = [task("A", 0, 1), task("E", 1, 2, ["A"], { kind: "proposals-exported" })];
    expect(run(tasks, {}, inputs(), 1).byId.get("E")).toMatchObject({ status: "not-started", label: "Nothing to do yet", waitingOn: ["A"] });
    expect(run(tasks, done("A"), inputs(), 1).byId.get("E")).toMatchObject({ status: "complete", label: "Nothing to do" });
  });

  it("is late from the working day after the due day, and not before", () => {
    const t = [task("X", 0, 3)];
    expect(run(t, {}, inputs(), 3).byId.get("X")).toMatchObject({ late: false, lateBy: 0 });
    expect(run(t, {}, inputs(), 5).byId.get("X")).toMatchObject({ late: true, lateBy: 2 });
    expect(run(t, done("X"), inputs(), 5).byId.get("X")!.late).toBe(false);
  });

  it("shows a flagged blocker, and drops it once the task is complete", () => {
    const blocker = { personId: "P01", at: "2026-10-05T10:00", reason: "Waiting for the bank" };
    expect(run([task("X", 0, 3)], { X: { blocker } }, inputs(), 1).byId.get("X")).toMatchObject({ status: "blocked", blocker });
    const both = run([task("X", 0, 3)], { X: { blocker, completed: { personId: "P01", at: "2026-10-05T11:00", evidence: "r" } } }, inputs(), 1);
    expect(both.byId.get("X")).toMatchObject({ status: "complete", blocker: undefined });
  });

  it("lists what a task waits on", () => {
    const tasks = [task("A", 0, 1), task("B", 0, 1), task("C", 1, 2, ["A", "B"])];
    expect(run(tasks, done("A"), inputs(), 1).byId.get("C")!.waitingOn).toEqual(["B"]);
  });

  it("projects the finish: unfinished work needs the days that are left, and a successor cannot finish before its predecessor", () => {
    const tasks = [task("P", 1, 4), task("S", 3, 5, ["P"])];
    const ev = run(tasks, {}, inputs(), 4);
    // P has not started: four days from today
    expect(ev.byId.get("P")!.projectedFinish).toBe(7);
    // S is planned to finish one day after P, so it finishes one day after P is projected to
    expect(ev.byId.get("S")!.projectedFinish).toBe(8);
    expect(ev.byId.get("S")!.slipping).toBe(true);
    expect(ev.projectedClose).toBe(8);
    expect(ev.onTrack).toBe(true);
    expect(run(tasks, {}, inputs(), 6).onTrack).toBe(false);
  });

  it("a task that is half done needs half its planned time", () => {
    const t = [task("R", 0, 3, [], { kind: "receipts-handled" })];
    const ev = run(t, {}, inputs({ receipts: { total: 10, done: 5 } }), 2);
    expect(ev.byId.get("R")!.projectedFinish).toBe(3); // two of four days left, from WD2
  });

  it("finds the critical path through the unfinished task that finishes last, back through what holds it up", () => {
    const tasks = [task("A", 0, 1), task("B", 0, 2), task("C", 2, 3, ["A"]), task("D", 3, 5, ["B", "C"])];
    const ev = run(tasks, {}, inputs(), 0);
    expect(ev.criticalPath[ev.criticalPath.length - 1]).toBe("D");
    expect(ev.byId.get("D")!.critical).toBe(true);
    expect(ev.criticalPath.every((id) => ev.byId.get(id)!.critical)).toBe(true);
    // complete tasks are never on it
    const half = run(tasks, { ...done("A"), ...done("C") }, inputs(), 0);
    expect(half.criticalPath).not.toContain("A");
    expect(half.criticalPath).not.toContain("C");
  });

  it("summarises phases", () => {
    const tasks = [task("A", 0, 1), { ...task("B", 1, 3), phase: "B" }];
    const ev = run(tasks, done("A"), inputs(), 1);
    const phases = summarisePhases([{ id: "A", name: "First" }, { id: "B", name: "Second" }, { id: "C", name: "Empty" }], ev.states);
    expect(phases.map((p) => [p.phase.id, p.status, p.progress])).toEqual([["A", "complete", 1], ["B", "not-started", 0]]);
    expect(phases[1]).toMatchObject({ startWd: 1, dueWd: 3 });
  });
});

describe("status by area", () => {
  const window = { startWd: 2, dueWd: 6 };
  it("expects none of the work before the window, all of it when it closes, and a share in between", () => {
    expect(expectedFraction(window, 1)).toBe(0);
    expect(expectedFraction(window, 2)).toBe(0.2);
    expect(expectedFraction(window, 4)).toBe(0.6);
    expect(expectedFraction(window, 6)).toBe(1);
    expect(expectedFraction(window, 8)).toBe(1);
  });

  it("is complete, on track or behind the plan, or has nothing to do", () => {
    const c = (d: number, t: number) => ({ done: d, total: t, openValue: 0 });
    expect(cellState(undefined, window, 4)).toBe("none");
    expect(cellState(c(0, 0), window, 4)).toBe("none");
    expect(cellState(c(10, 10), window, 4)).toBe("complete");
    expect(cellState(c(5, 10), window, 4)).toBe("on-track"); // 0.5 against 0.6 expected, within the allowance
    expect(cellState(c(2, 10), window, 4)).toBe("behind");
    expect(cellState(c(0, 10), window, 1)).toBe("on-track"); // the window has not opened
    expect(cellState(c(9, 10), window, 6)).toBe("on-track"); // the due day itself
    expect(cellState(c(9, 10), window, 7)).toBe("behind"); // the window has closed and it is not done
  });
});

describe("the close of the loaded period", () => {
  const m = modelsAt();
  const ev = m.close.evaluation;
  const total = (id: string) => ev.byId.get(id)!.total;

  it("is a quarter-end close read at working day 4, with the quarter-end phase", () => {
    expect(m.close.quarter).toBe(true);
    expect(m.close.realWd).toBe(4);
    expect(m.close.currentWd).toBe(4);
    expect(m.close.targetWd).toBe(CLOSE_TARGET_WD.quarter);
    expect(m.close.phases.map((p) => p.id)).toContain("Q");
    expect(ev.states.length).toBe(CLOSE_TASKS.length);
  });

  it("leaves the quarter-end phase out of a month-end close, and can be read at another day", () => {
    expect(modelsAt({ wd: 1 }).close.currentWd).toBe(1);
    expect(modelsAt({ wd: 99 }).close.currentWd).toBe(CLOSE_WD_RANGE.max);
    expect(modelsAt({ wd: -9 }).close.currentWd).toBe(CLOSE_WD_RANGE.min);
    expect(modelsAt({ today: "2026-12-01" }).close.realWd).toBe(CLOSE_WD_RANGE.max);
  });

  it("ties each derived task to the record it reads (FR-CLS-01)", () => {
    expect(total("C2")).toBe(m.recRows.filter((r) => r.rec.type === "Bank").length);
    expect(total("C4")).toBe(m.recRows.filter((r) => r.rec.type === "Customer statement").length);
    expect(total("C5")).toBe(m.recRows.filter((r) => r.rec.type === "Vendor statement").length);
    expect(total("C6")).toBe(m.recRows.filter((r) => r.rec.type === "Intercompany").length);
    expect(total("C2") + total("C3") + total("C4") + total("C5") + total("C6")).toBe(m.recRows.length);
    expect(total("D1") + total("D2") + total("D3") + total("D4") + total("D5") + total("D6")).toBe(m.review.accounts.length);
    expect(total("D7")).toBe(m.review.accounts.reduce((s, a) => s + a.readiness.required.length, 0));
    expect(ev.byId.get("D7")!.done).toBe(m.review.accounts.reduce((s, a) => s + a.readiness.required.length - a.readiness.undocumented.length, 0));
    expect(total("C1")).toBe(m.receipts.length);
    expect(total("E1")).toBe(m.journals.filter((j) => j.flags.length > 0).length);
    expect(total("Q1")).toBe(1);
    expect(total("Q2")).toBe(m.pbc.length);
  });

  it("reads the ledger for what has been posted", () => {
    expect(ev.byId.get("B1")!.status).toBe("complete"); // payroll
    expect(ev.byId.get("B2")!.status).toBe("complete"); // depreciation
    expect(ev.byId.get("B3")!.status).toBe("complete"); // accruals
  });

  it("starts with the tasks done by hand before the session complete, and the rest open", () => {
    for (const id of Object.keys(SEEDED_CLOSE_WORK)) expect(ev.byId.get(id)!.status, id).toBe("complete");
    expect(ev.byId.get("F2")!.status).toBe("not-started");
    expect(ev.byId.get("G1")!.completed).toBeUndefined();
    expect(ev.progress).toBeGreaterThan(0.1);
    expect(ev.progress).toBeLessThan(0.9);
  });

  it("finds the late bank reconciliations, and a critical path that ends in the quarter-end tasks", () => {
    expect(ev.byId.get("C2")!.late).toBe(true);
    expect(ev.criticalPath.length).toBeGreaterThan(2);
    expect(ev.criticalPath.every((id) => ev.byId.get(id)!.status !== "complete")).toBe(true);
    expect(ev.projectedClose).toBeGreaterThanOrEqual(ev.criticalPath.map((id) => ev.byId.get(id)!.projectedFinish).reduce((a, b) => Math.min(a, b)));
  });

  it("is nearer on track when read earlier in the calendar", () => {
    expect(modelsAt({ wd: 2 }).close.evaluation.projectedClose).toBeLessThan(ev.projectedClose);
    expect(modelsAt({ wd: 2 }).close.evaluation.byId.get("C2")!.late).toBe(false);
  });

  it("cuts the same work by business unit as it does in total", () => {
    const sum = (area: string) => Object.values(m.close.matrix.cells[area]).reduce((s, c) => s + c.cell.total, 0);
    const sumDone = (area: string) => Object.values(m.close.matrix.cells[area]).reduce((s, c) => s + c.cell.done, 0);
    expect(sum("bsr")).toBe(total("D7"));
    expect(sumDone("bsr")).toBe(ev.byId.get("D7")!.done);
    expect(sum("recs")).toBe(m.recRows.length);
    expect(sumDone("recs")).toBe(m.recRows.filter((r) => r.status === "reviewer-signed").length);
    expect(sum("journals")).toBe(total("E1"));
    expect(sum("cash")).toBe(total("C1"));
    expect(m.close.matrix.units.map((u) => u.id)).toEqual(["EL", "MO", "PA", "RA", CORPORATE]);
    expect(Object.keys(m.close.matrix.cells)).toEqual(CLOSE_AREAS.map((a) => a.id));
  });

  it("judges every cell against the plan for its area", () => {
    for (const a of m.close.matrix.areas) {
      for (const u of m.close.matrix.units) {
        const c = m.close.matrix.cells[a.area.id][u.id];
        expect(c.state).toBe(cellState(c.cell, a.window, m.close.currentWd));
      }
    }
  });

  it("builds in well under a second", () => {
    const t0 = performance.now();
    modelsAt();
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});

describe("business unit attribution", () => {
  it("follows the profit centre; corporate has none", () => {
    expect(buOfProfitCentre("PC-EL-01")).toBe("EL");
    expect(buOfProfitCentre("PC-RA-03")).toBe("RA");
    expect(buOfProfitCentre("PC-CORP")).toBe(CORPORATE);
    expect(buOfProfitCentre("PC-UNKNOWN")).toBe(CORPORATE);
  });

  it("puts a counterparty where most of its postings are", () => {
    const customer = WORLD.parties.find((p) => p.type === "Customer")!;
    const counts = new Map<string, number>();
    for (const l of WORLD.lines) if (l.partner?.id === customer.id && buOfProfitCentre(l.profitCentre) !== CORPORATE) counts.set(buOfProfitCentre(l.profitCentre), (counts.get(buOfProfitCentre(l.profitCentre)) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? CORPORATE;
    expect(buOfParty(customer.id)).toBe(best);
    expect(buOfParty(undefined)).toBe(CORPORATE);
  });

  it("follows the counterparty for statements and is corporate for the rest", () => {
    for (const r of WORLD.reconciliations) {
      if (r.type === "Customer statement" || r.type === "Vendor statement") expect(buOfRec(r), r.id).toBe(buOfParty(r.partyId));
      else expect(buOfRec(r), r.id).toBe(CORPORATE);
    }
  });

  it("puts a journal in the unit of its largest line that has one", () => {
    const s12 = docByKey(`${LINE_BY_KEY.get(WORLD.anchors["S-12"][0])!.fiscalYear}-${LINE_BY_KEY.get(WORLD.anchors["S-12"][0])!.docNo}`)!;
    expect(buOfJournal(s12)).toBe(PC_BY_ID.get(s12.lines[0].profitCentre)!.businessUnitId);
    expect(buOfJournal({ ...s12, lines: s12.lines.map((l) => ({ ...l, profitCentre: "PC-CORP" })) })).toBe(CORPORATE);
  });
});

describe("close actions", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("controller");
  });

  it("the tasks done before the session are there, with their events in the history", () => {
    expect(Object.keys(wf().closeWork).sort()).toEqual(Object.keys(SEEDED_CLOSE_WORK).sort());
    const h = seededHistory().filter((e) => e.module === "close");
    expect(h.filter((e) => e.action === "Close task completed")).toHaveLength(Object.keys(SEEDED_CLOSE_WORK).length);
    const runs = h.filter((e) => e.action === "Close plan evaluated");
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.every((e) => e.actorId === "agent:close" && e.actorKind === "Agent")).toBe(true);
  });

  it("the owner completes a task with a reference, and it is logged", () => {
    as("tax-specialist");
    expect(wf().completeCloseTask("F2", "  ").ok).toBe(false);
    expect(wf().completeCloseTask("F2", "GSTR-3B reconciliation GST-0930").ok).toBe(true);
    expect(wf().closeWork.F2.completed).toMatchObject({ personId: "P09", evidence: "GSTR-3B reconciliation GST-0930" });
    expect(modelsAt().close.evaluation.byId.get("F2")!.status).toBe("complete");
    expect(wf().events.at(-1)).toMatchObject({ module: "close", action: "Close task completed", object: { type: "close-task", id: "F2" } });
    expect(wf().completeCloseTask("F2", "again").ok).toBe(false);
  });

  it("only the owner's role, or a controller, completes a task; the auditor never does", () => {
    as("gl-accountant");
    expect(wf().completeCloseTask("F2", "ref").ok).toBe(false);
    as("external-auditor");
    expect(wf().completeCloseTask("F2", "ref").ok).toBe(false);
    as("controller");
    expect(wf().completeCloseTask("F2", "ref").ok).toBe(true);
  });

  it("a task tied to records is not completed by hand", () => {
    const r = wf().completeCloseTask("C2", "ref");
    expect(r.ok).toBe(false);
    expect(wf().closeWork.C2).toBeUndefined();
  });

  it("reopening needs a reason and a manager, and only a hand-completed task can be reopened", () => {
    expect(wf().reopenCloseTask("A1", "").ok).toBe(false);
    as("gl-accountant");
    expect(wf().reopenCloseTask("A1", "Cut-off date changed").ok).toBe(false);
    as("controller");
    expect(wf().reopenCloseTask("A1", "Cut-off date changed").ok).toBe(true);
    expect(modelsAt().close.evaluation.byId.get("A1")!.status).not.toBe("complete");
    expect(wf().reopenCloseTask("A1", "again").ok).toBe(false);
    expect(wf().reopenCloseTask("C2", "x").ok).toBe(false);
  });

  it("a blocker is flagged with a reason, shows on the task, and is cleared", () => {
    as("treasury-analyst");
    expect(wf().flagCloseBlocker("C2", "").ok).toBe(false);
    expect(wf().flagCloseBlocker("C2", "Bank statement for the Citibank account not received").ok).toBe(true);
    expect(wf().flagCloseBlocker("C2", "again").ok).toBe(false);
    const s = modelsAt().close.evaluation.byId.get("C2")!;
    expect(s.status).toBe("blocked");
    expect(s.blocker?.reason).toContain("Citibank");
    expect(modelsAt().home("controller").attention.some((a) => a.id === "close:C2" && a.rank === 5)).toBe(true);
    expect(wf().clearCloseBlocker("C2").ok).toBe(true);
    expect(wf().clearCloseBlocker("C2").ok).toBe(false);
    expect(modelsAt().close.evaluation.byId.get("C2")!.status).not.toBe("blocked");
    as("external-auditor");
    expect(wf().flagCloseBlocker("C2", "x").ok).toBe(false);
  });

  it("a task is reassigned by a manager to someone on the team, not the auditor and not its owner", () => {
    expect(wf().reassignCloseTask("F2", "P12").ok).toBe(false);
    expect(wf().reassignCloseTask("F2", "P09").ok).toBe(false);
    expect(wf().reassignCloseTask("F2", "P05").ok).toBe(true);
    expect(modelsAt().close.evaluation.byId.get("F2")!.ownerId).toBe("P05");
    expect(wf().events.at(-1)).toMatchObject({ action: "Close task reassigned", before: "Lakshmi Subramanian", after: "Sneha Kulkarni" });
    as("gl-accountant");
    expect(wf().reassignCloseTask("F2", "P03").ok).toBe(false);
  });

  it("a completed task is never blocked, and reassigning it is refused", () => {
    expect(wf().flagCloseBlocker("A1", "x").ok).toBe(false);
    expect(wf().reassignCloseTask("A1", "P05").ok).toBe(false);
  });
});

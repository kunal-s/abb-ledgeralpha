import { beforeEach, describe, expect, it } from "vitest";
import type { RoleId } from "@/types";
import { WORLD } from "@/data";
import { ROLES, can } from "@/config/roles";
import { useRoleStore } from "@/lib/stores";
import { useWorkflow } from "@/state/workflow";

const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();
const last = () => wf().events.at(-1)!;
const KEY = "company|2026-09|prior-month";
const LABEL = "The company, Sep 2026 against Aug 2026";
const TEXT = "The result fell because copper was bought above standard.";
const COPPER_LINE = WORLD.anchors["S-22"][0];

describe("commentary on a variance", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("reporting-analyst");
  });

  it("is written by the analyst, the controller and the finance leaders, and by no one who prepares journals or only reads", () => {
    const allowed = (Object.keys(ROLES) as RoleId[]).filter((r) => can(r, "report-commentary"));
    expect(allowed.sort()).toEqual(["cfo", "controller", "head-of-finance", "reporting-analyst"]);
    for (const role of Object.keys(ROLES) as RoleId[]) {
      as(role);
      const r = wf().saveVarianceNote(KEY, LABEL, TEXT, false);
      expect(r.ok, role).toBe(allowed.includes(role));
    }
  });

  it("a refused save changes nothing and logs nothing", () => {
    as("gl-accountant");
    const before = wf().events.length;
    const r = wf().saveVarianceNote(KEY, LABEL, TEXT, false);
    expect(r.ok).toBe(false);
    expect(wf().varianceNotes[KEY]).toBeUndefined();
    expect(wf().events).toHaveLength(before);
  });

  it("saves the drafted text, then an edit of it, and logs who did what", () => {
    expect(wf().saveVarianceNote(KEY, LABEL, `  ${TEXT}  `, false).ok).toBe(true);
    expect(wf().varianceNotes[KEY]).toMatchObject({ text: TEXT, edited: false });
    expect(last()).toMatchObject({ module: "variance-analysis", action: "Variance commentary drafted and saved", object: { type: "variance-note", id: KEY, label: LABEL } });

    as("controller");
    expect(wf().saveVarianceNote(KEY, LABEL, `${TEXT} The buyer has been asked to explain.`, true).ok).toBe(true);
    expect(wf().varianceNotes[KEY].edited).toBe(true);
    expect(last().action).toBe("Variance commentary updated");
    // an edited commentary stays marked as edited when it is saved again unchanged
    expect(wf().saveVarianceNote(KEY, LABEL, `${TEXT} The buyer has been asked to explain.`, false).ok).toBe(true);
    expect(wf().varianceNotes[KEY].edited).toBe(true);
  });

  it("a first save of text the person edited is logged as edited", () => {
    expect(wf().saveVarianceNote(KEY, LABEL, TEXT, true).ok).toBe(true);
    expect(last().action).toBe("Variance commentary edited and saved");
  });

  it("refuses empty commentary", () => {
    const r = wf().saveVarianceNote(KEY, LABEL, "   ", false);
    expect(r).toEqual({ ok: false, error: "Commentary cannot be empty" });
    expect(wf().varianceNotes[KEY]).toBeUndefined();
  });

  it("is discarded with a reason, which the activity log keeps", () => {
    expect(wf().discardVarianceNote(KEY, LABEL, "Not needed")).toEqual({ ok: false, error: "There is no saved commentary" });
    wf().saveVarianceNote(KEY, LABEL, TEXT, false);
    expect(wf().discardVarianceNote(KEY, LABEL, "  ")).toEqual({ ok: false, error: "A reason is required to discard the commentary" });
    expect(wf().varianceNotes[KEY]).toBeDefined();
    expect(wf().discardVarianceNote(KEY, LABEL, "Rewriting after the review").ok).toBe(true);
    expect(wf().varianceNotes[KEY]).toBeUndefined();
    expect(last()).toMatchObject({ action: "Variance commentary discarded", reason: "Rewriting after the review", object: { id: KEY } });
  });

  it("keeps a commentary for each scope, month and comparator", () => {
    wf().saveVarianceNote("company|2026-09|prior-month", LABEL, TEXT, false);
    wf().saveVarianceNote("company|2026-09|budget", LABEL, TEXT, false);
    wf().saveVarianceNote("bu:MO|2026-09|prior-month", LABEL, TEXT, false);
    expect(Object.keys(wf().varianceNotes)).toHaveLength(3);
    wf().discardVarianceNote("company|2026-09|budget", LABEL, "Superseded");
    expect(Object.keys(wf().varianceNotes).sort()).toEqual(["bu:MO|2026-09|prior-month", "company|2026-09|prior-month"]);
  });
});

describe("asking for an explanation of a variance driver", () => {
  beforeEach(() => {
    wf().resetDemo();
  });

  const ask = () => wf().requestFollowUp({ itemKey: COPPER_LINE, module: "variance-analysis", owner: "Buyer, procurement", dueDate: "2026-10-15", message: "Please explain the copper price." });

  it("is open to the reporting analyst, who reads the variance and asks the buyer", () => {
    as("reporting-analyst");
    const r = ask();
    expect(r.ok).toBe(true);
    expect(Object.values(wf().followUps)).toHaveLength(1);
    expect(last()).toMatchObject({ module: "variance-analysis", action: "Follow-up requested", itemKeys: [COPPER_LINE] });
  });

  it("is not open to the chief financial officer or the auditor, who read", () => {
    for (const role of ["cfo", "external-auditor"] as RoleId[]) {
      as(role);
      expect(ask().ok, role).toBe(false);
    }
    expect(Object.values(wf().followUps)).toHaveLength(0);
  });
});

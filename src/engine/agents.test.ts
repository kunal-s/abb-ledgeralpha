import { beforeEach, describe, expect, it } from "vitest";
import { GL_BY_ID, WORLD } from "@/data";
import { AGENTS } from "@/engine/agents";
import { overrides } from "@/engine/agentStats";
import { RECON_CLASSES } from "@/engine/recClasses";
import { modelsAt } from "@/test/models";
import { useRoleStore } from "@/lib/stores";
import { useWorkflow } from "@/state/workflow";
import type { RoleId } from "@/types";

const wf = () => useWorkflow.getState();
const as = (role: RoleId) => useRoleStore.setState({ role });
const stat = (id: string) => modelsAt().agents().find((a) => a.agent.id === id)!;

/** Proposes a decision on a flagged line as the person who owns its account, carrying the recommendation the way the drawer does. */
function decide(key: string, action: "Clear" | "Reclassify" | "Write off" | "Write back" | "Provide" | "Escalate" | "Retain", amount: number) {
  const row = modelsAt().review.rows.find((r) => r.key === key)!;
  const line = row.item;
  const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(line.gl)!.ownerId)!;
  as(owner.roleId);
  const r = wf().proposeDecision({ itemKey: key, module: "balance-sheet-review", action, amount, justification: "Reviewed with the owner", hits: row.hits, recommendation: row.rec, rulesVersion: "t" });
  if (!r.ok) throw new Error(r.error);
}

beforeEach(() => {
  wf().resetDemo();
  as("controller");
});

describe("agent statistics", () => {
  it("covers every agent in the roster, in order, with what it has looked at", () => {
    const s = modelsAt().agents();
    expect(s.map((a) => a.agent.id)).toEqual(AGENTS.map((a) => a.id));
    for (const a of s) expect(a.touched).toBeGreaterThanOrEqual(0);
    expect(stat("agent:scrutiny").touched).toBeGreaterThan(100);
    expect(stat("agent:reconciler").touched).toBeGreaterThan(20);
  });

  it("shows no rate before anybody has answered, instead of 0%", () => {
    const s = stat("agent:scrutiny");
    expect(s.accepted + s.overridden).toBe(0);
    expect(s.rate).toBeNull();
  });

  it("counts a decision the way the agent recommended as accepted, and a different one as overridden", () => {
    const rows = modelsAt().review.rows.filter((r) => r.isOpen && r.rec && r.rec.action === "Clear" && !r.decision);
    const [a, b] = rows;
    decide(a.key, "Clear", a.item.amount);
    let s = stat("agent:scrutiny");
    expect([s.accepted, s.overridden, s.rate]).toEqual([1, 0, 1]);
    decide(b.key, "Retain", b.item.amount);
    s = stat("agent:scrutiny");
    expect([s.accepted, s.overridden]).toEqual([1, 1]);
    expect(s.rate).toBeCloseTo(0.5, 9);
    expect(overrides(Object.values(wf().decisions)).map((d) => d.itemKey)).toEqual([b.key]);
  });

  it("takes withdrawn decisions out of the count", () => {
    const r = modelsAt().review.rows.find((x) => x.isOpen && x.rec && x.rec.action === "Clear" && !x.decision)!;
    decide(r.key, "Clear", r.item.amount);
    const id = Object.values(wf().decisions)[0].id;
    expect(wf().withdrawDecision(id).ok).toBe(true);
    expect(stat("agent:scrutiny").accepted).toBe(0);
  });

  it("counts the reconciler's suggestions by whether a person changed them", () => {
    const before = stat("agent:reconciler");
    expect(before.accepted).toBeGreaterThan(0);
    expect(before.overridden).toBe(0);
    // the suggestions nobody has signed off are open, not accepted
    expect(before.open).toBeGreaterThan(0);
    const rec = modelsAt().recRows.find((r) => !r.signOff?.preparer && r.view.items.some((i) => i.suggestedClass && i.classId === i.suggestedClass))!;
    const item = rec.view.items.find((i) => i.suggestedClass && i.classId === i.suggestedClass)!;
    const other = RECON_CLASSES[rec.rec.type].find((c) => c.id !== item.suggestedClass)!;
    as("gl-accountant");
    expect(wf().classifyRecItem(rec.rec.id, item.id, other.id).ok).toBe(true);
    const after = stat("agent:reconciler");
    expect(after.overridden).toBe(1);
    expect(after.open).toBe(before.open - 1);
    expect(after.accepted).toBe(before.accepted);
  });

  it("counts the narrator's drafts by whether the owner edited them", () => {
    const before = stat("agent:narrator");
    const gl = Object.values(wf().signOffs).find((s) => s.commentary?.trim())?.gl ?? "";
    if (gl) {
      as("gl-accountant");
      wf().setCommentary(gl, WORLD.asOf, "Edited by the owner for the auditor", true);
      const after = stat("agent:narrator");
      expect(after.accepted + after.overridden).toBe(before.accepted + before.overridden);
      expect(after.overridden).toBeGreaterThanOrEqual(before.overridden);
    }
    expect(before.touched).toBe(before.accepted + before.overridden);
  });

  it("splits the journals the checks flagged between flags upheld, cleared and waiting", () => {
    const s = stat("agent:journal-reviewer");
    const flagged = modelsAt().journals.filter((j) => j.flags.length > 0).length;
    expect(s.accepted + s.overridden + s.open).toBe(flagged);
  });

  it("never rates an agent whose work is not accepted or overridden", () => {
    for (const id of ["agent:tax-matcher", "agent:close", "agent:follow-up"]) {
      const s = stat(id);
      expect(s.rated).toBe(false);
      expect(s.rate).toBeNull();
    }
  });

  it("reads the last run and the number of runs from the activity record", () => {
    const s = stat("agent:scrutiny");
    expect(s.runs).toBeGreaterThan(0);
    expect(s.lastRun?.actorId).toBe("agent:scrutiny");
  });
});

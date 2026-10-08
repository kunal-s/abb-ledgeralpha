import { beforeEach, describe, expect, it } from "vitest";
import { GL_BY_ID, WORLD } from "@/data";
import { CONTROL_REGISTER } from "@/data/workspace/controls";
import { CONTROL_POLICY } from "@/config/policies";
import { evaluateControls, type ControlInput } from "@/engine/controls";
import { addDays } from "@/lib/dates";
import { modelsAt, TODAY } from "@/test/models";
import { useRoleStore } from "@/lib/stores";
import { personForRole, useWorkflow } from "@/state/workflow";
import type { RoleId } from "@/types";

const wf = () => useWorkflow.getState();
const as = (role: RoleId) => useRoleStore.setState({ role });
const ctl = (id: string) => modelsAt().controls().controls.find((c) => c.def.id === id)!;

function inputFor(today = TODAY): ControlInput {
  const m = modelsAt({ today });
  const s = wf();
  return {
    periodEnd: WORLD.asOf, today, signOffs: s.signOffs, recRows: m.recRows, accountsAwaiting: m.review.accounts.filter((a) => a.status !== "reviewer-signed").length,
    decisions: Object.values(s.decisions), journals: m.journals, journalReviews: s.journalReviews, events: s.events,
  };
}

/** An item whose owner is the person who acts for their role, so the proposer and the approver of that role are one person. */
function proposeOne(action: "Write off" | "Write back" | "Retain" = "Retain") {
  const actsFor = (id: string) => personForRole(WORLD.people.find((p) => p.id === id)!.roleId).id === id;
  const row = modelsAt().review.rows.find((r) => r.isOpen && r.flagged && !r.decision && Math.abs(r.item.amount) < 5_00_000 && actsFor(GL_BY_ID.get(r.item.gl)!.ownerId))!;
  const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(row.item.gl)!.ownerId)!;
  as(owner.roleId);
  const r = wf().proposeDecision({ itemKey: row.key, module: "balance-sheet-review", action, amount: row.item.amount, justification: "Reviewed", hits: row.hits, recommendation: row.rec, rulesVersion: "t" });
  if (!r.ok) throw new Error(r.error);
  return { id: r.id, owner };
}

beforeEach(() => {
  wf().resetDemo();
  as("controller");
});

describe("control register", () => {
  it("tests every control in the register once, in order", () => {
    const { controls } = modelsAt().controls();
    expect(controls.map((c) => c.def.id)).toEqual(CONTROL_REGISTER.map((c) => c.id));
    for (const c of controls) {
      expect(c.exceptions).toBeLessThanOrEqual(c.tested);
      expect(["effective", "deficient", "in-progress", "untested"]).toContain(c.status);
    }
  });

  it("finds the seeded sign-offs effective: reviewers differ from preparers and signed inside the window", () => {
    expect(ctl("ICFR-01").tested).toBeGreaterThan(5);
    expect(ctl("ICFR-01").exceptions).toBe(0);
    expect(ctl("ICFR-01").status).toBe("effective");
    expect(ctl("ICFR-02").exceptions).toBe(0);
  });

  it("is deficient the moment a preparer is also the reviewer, and says who", () => {
    const i = inputFor();
    const key = Object.keys(i.signOffs).find((k) => i.signOffs[k].reviewer && i.signOffs[k].preparer)!;
    const tampered = { ...i.signOffs, [key]: { ...i.signOffs[key], reviewer: { ...i.signOffs[key].reviewer!, personId: i.signOffs[key].preparer!.personId } } };
    const r = evaluateControls({ ...i, signOffs: tampered });
    expect(r.controls.find((c) => c.def.id === "ICFR-01")!.status).toBe("deficient");
    expect(r.controls.find((c) => c.def.id === "ICFR-01")!.exceptions).toBe(1);
    expect(r.sod.some((s) => s.kind === "Conflict" && s.text.includes("prepared and reviewed"))).toBe(true);
  });

  it("holds the account review in progress inside its window, and fails the accounts still unsigned after it", () => {
    const i = inputFor();
    const inside = evaluateControls(i).controls.find((c) => c.def.id === "ICFR-02")!;
    expect(inside.pending).toBe(i.accountsAwaiting);
    expect(inside.status === "in-progress" || inside.status === "effective").toBe(true);
    const after = evaluateControls({ ...i, today: addDays(WORLD.asOf, CONTROL_POLICY.accountReviewDays + 1) }).controls.find((c) => c.def.id === "ICFR-02")!;
    expect(after.exceptions).toBe(i.accountsAwaiting);
    if (i.accountsAwaiting) expect(after.status).toBe("deficient");
  });

  it("flags a bank reconciliation not certified by its due date", () => {
    const c = ctl("ICFR-03");
    const m = modelsAt();
    const overdue = m.recRows.filter((r) => r.rec.type === "Bank" && !r.signOff?.preparer && !r.signOff?.reviewer && r.rec.dueDate < TODAY).length;
    expect(c.exceptions).toBeGreaterThanOrEqual(overdue);
    if (overdue) expect(c.status).toBe("deficient");
  });

  it("logs a blocked self-approval and counts it as evidence, not as an exception", () => {
    const { id, owner } = proposeOne();
    const before = ctl("ICFR-05");
    expect(before.exceptions).toBe(0);
    // the proposer holds the approving role in this test, so the refusal is the self-approval one
    useWorkflow.setState((s) => ({ decisions: { ...s.decisions, [id]: { ...s.decisions[id], chain: [owner.roleId] } } }));
    as(owner.roleId);
    const r = wf().approveDecision(id);
    expect(r.ok).toBe(false);
    const events = wf().events.filter((e) => e.action === "Self-approval blocked");
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(owner.id);
    const after = modelsAt().controls();
    expect(after.controls.find((c) => c.def.id === "ICFR-05")!.exceptions).toBe(0);
    expect(after.sod.filter((s) => s.kind === "Blocked")).toHaveLength(1);
  });

  it("does not log a refusal that is not a self-approval", () => {
    const { id } = proposeOne();
    as("external-auditor");
    wf().approveDecision(id);
    expect(wf().events.filter((e) => e.action === "Self-approval blocked")).toHaveLength(0);
  });

  it("finds a delegation failure when a decision was approved out of order", () => {
    const { id, owner } = proposeOne();
    const i = inputFor();
    const d = Object.values(wf().decisions).find((x) => x.id === id)!;
    const bad = { ...d, status: "approved" as const, approvals: [{ roleId: "cfo" as RoleId, personId: "P99", at: "2026-10-07T10:00" }] };
    const r = evaluateControls({ ...i, decisions: [bad] }).controls.find((c) => c.def.id === "ICFR-05")!;
    expect(r.exceptions).toBe(1);
    void owner;
  });

  it("requires tax review to be cleared on an approved write-back", () => {
    const { id } = proposeOne("Write back");
    const i = inputFor();
    const d = Object.values(wf().decisions).find((x) => x.id === id)!;
    const approved = { ...d, status: "approved" as const, taxReviewRequired: true, approvals: d.chain.map((role) => ({ roleId: role, personId: "P01", at: "2026-10-07T10:00" })) };
    expect(evaluateControls({ ...i, decisions: [approved] }).controls.find((c) => c.def.id === "ICFR-06")!.exceptions).toBe(1);
    const cleared = { ...approved, taxReview: { personId: "P09", outcome: "cleared" as const, at: "2026-10-07T11:00" } };
    expect(evaluateControls({ ...i, decisions: [cleared] }).controls.find((c) => c.def.id === "ICFR-06")!.exceptions).toBe(0);
  });

  it("fails a rule change that has no reason", () => {
    const before = ctl("ICFR-09");
    expect(before.exceptions).toBe(0);
    expect(wf().setRuleOverride("BSR-01", { params: { ageDays: 200 } }).ok).toBe(true);
    const after = ctl("ICFR-09");
    expect(after.tested).toBe(before.tested + 1);
    expect(after.exceptions).toBe(1);
    expect(wf().setRuleOverride("BSR-01", { params: { ageDays: 190 } }, "Aligned with the audit committee's request").ok).toBe(true);
    expect(ctl("ICFR-09").exceptions).toBe(1);
  });

  it("collects evidence newest first, with links to the records", () => {
    for (const c of modelsAt().controls().controls) {
      const at = c.evidence.map((e) => e.at);
      expect(at).toEqual([...at].sort().reverse());
      expect(c.evidence.length).toBeLessThanOrEqual(6);
    }
  });
});

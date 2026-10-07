import { beforeEach, describe, expect, it } from "vitest";
import type { RoleId } from "@/types";
import { LINE_BY_KEY, WORLD } from "@/data";
import { ROLES } from "@/config/roles";
import { homeViewOf, ATTENTION_LABEL } from "@/state/homeModel";
import { WORK_KINDS, dueBucket, urgency, type WorkKind } from "@/state/workModel";
import { modelsAt } from "@/test/models";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { GL_BY_ID } from "@/data";

const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();
const kinds = (role: RoleId) => modelsAt().work(role).map((i) => i.kind);
const ofKind = (role: RoleId, kind: WorkKind) => modelsAt().work(role).filter((i) => i.kind === kind);

/** Proposes a decision on a flagged line as the person who owns its account. */
function propose(key: string, action: "Write off" | "Write back" | "Retain", amount: number) {
  const line = LINE_BY_KEY.get(key)!;
  const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(line.gl)!.ownerId)!;
  as(owner.roleId);
  const r = wf().proposeDecision({ itemKey: key, module: "balance-sheet-review", action, amount, justification: "The obligation has lapsed", hits: [], rulesVersion: "t" });
  if (!r.ok) throw new Error(r.error);
  return { id: r.id, role: owner.roleId };
}

describe("My Work", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("controller");
  });

  it("holds the queue of a role from every module it works in, each item with a unique id", () => {
    for (const role of Object.keys(ROLES) as RoleId[]) {
      const items = modelsAt().work(role);
      expect(new Set(items.map((i) => i.id)).size, role).toBe(items.length);
      for (const i of items) {
        expect(WORK_KINDS.some((k) => k.kind === i.kind), `${role} ${i.id}`).toBe(true);
        expect(i.itemKey || i.link, `${role} ${i.id} opens something`).toBeTruthy();
      }
    }
  });

  it("gives the controller sign-offs to give, journals to review and close tasks, and none of its own sign-offs", () => {
    const k = new Set(kinds("controller"));
    for (const kind of ["sign-off", "journal", "close-task"] as WorkKind[]) expect(k.has(kind), kind).toBe(true);
    const m = modelsAt();
    const signOffs = m.work("controller").filter((i) => i.kind === "sign-off");
    for (const s of signOffs) {
      const so = m.review.accountByGl.get(s.signOff!.ref)?.signOff ?? m.recRows.find((r) => r.rec.id === s.signOff!.ref)?.signOff;
      expect(so?.preparer?.personId, s.id).not.toBe("P01");
      expect(s.signOff!.as).toBe("reviewer");
    }
    expect(signOffs.length).toBe(m.review.accounts.filter((a) => a.status === "preparer-signed" && a.signOff!.preparer!.personId !== "P01").length + m.recRows.filter((r) => r.status === "preparer-signed").length);
  });

  it("an approval waits for the role the band names, leaves the queue once approved, and not for the proposer's own role", () => {
    const p = propose(WORLD.anchors["S-01"][0], "Write off", 3_00_000);
    expect(ofKind("controller", "approval").map((i) => i.decisionId)).toEqual([p.id]);
    expect(ofKind("head-of-finance", "approval")).toHaveLength(0);
    as("controller");
    expect(wf().approveDecision(p.id).ok).toBe(true);
    expect(ofKind("controller", "approval")).toHaveLength(0);
  });

  it("a larger band reaches the next approver only after the first", () => {
    const p = propose(WORLD.anchors["S-01"][0], "Write off", 20_00_000);
    expect(ofKind("head-of-finance", "approval")).toHaveLength(0);
    as("controller");
    wf().approveDecision(p.id);
    expect(ofKind("controller", "approval")).toHaveLength(0);
    expect(ofKind("head-of-finance", "approval").map((i) => i.decisionId)).toEqual([p.id]);
  });

  it("a write-back also waits for tax review, which the tax specialist clears", () => {
    const p = propose(WORLD.anchors["S-01"][0], "Write back", 3_00_000);
    expect(ofKind("tax-specialist", "tax-review").map((i) => i.decisionId)).toEqual([p.id]);
    as("tax-specialist");
    expect(wf().taxReview(p.id, "cleared").ok).toBe(true);
    expect(ofKind("tax-specialist", "tax-review")).toHaveLength(0);
  });

  it("a rejected decision returns to the proposer's role to rework", () => {
    const p = propose(WORLD.anchors["S-01"][0], "Write off", 3_00_000);
    as("controller");
    expect(wf().rejectDecision(p.id, "Support is missing").ok).toBe(true);
    const rework = ofKind(p.role, "rework");
    expect(rework).toHaveLength(1);
    expect(rework[0].detail).toContain("Support is missing");
    expect(ofKind("controller", "approval")).toHaveLength(0);
  });

  it("confirming matches takes them out of the queue of the receivables role", () => {
    const before = ofKind("ar-specialist", "match");
    expect(before.length).toBeGreaterThan(10);
    const strong = before.filter((i) => i.receiptKey).slice(0, 3);
    as("ar-specialist");
    const r = wf().confirmMatches(strong.map((i) => i.receiptKey!));
    expect(r.ok).toBe(true);
    const after = ofKind("ar-specialist", "match").map((i) => i.id);
    expect(after.length).toBe(before.length - (r.ok ? r.created : 0));
    expect(after.length).toBeLessThan(before.length);
  });

  it("a follow-up is in the raiser's queue until it is closed, and says when it is answered", () => {
    as("gl-accountant");
    const key = WORLD.anchors["S-01"][0];
    const r = wf().requestFollowUp({ itemKey: key, module: "balance-sheet-review", owner: "Project manager", dueDate: "2026-10-20", message: "Please confirm the status of the obligation" });
    expect(r.ok).toBe(true);
    const mine = ofKind("gl-accountant", "follow-up");
    expect(mine).toHaveLength(1);
    expect(mine[0].detail).toContain("Asked of Project manager");
    expect(mine[0].overdue).toBe(false);
    wf().respondFollowUp(r.ok ? r.id : "", "Obligation lapsed in July");
    expect(ofKind("gl-accountant", "follow-up")[0].detail).toContain("Answered");
    wf().closeFollowUp(r.ok ? r.id : "");
    expect(ofKind("gl-accountant", "follow-up")).toHaveLength(0);
  });

  it("auditor requests are in the owner's queue with their date, and close tasks with theirs", () => {
    const req = ofKind("ar-specialist", "request");
    expect(req.length).toBeGreaterThan(0);
    for (const i of req) expect(i.due).toBeTruthy();
    const bank = ofKind("treasury-analyst", "close-task").find((i) => i.closeTaskId === "C2")!;
    expect(bank.overdue).toBe(true);
    expect(bank.link).toContain("/close?tab=checklist&task=C2");
  });

  it("completing a close task takes it out of the queue", () => {
    as("tax-specialist");
    const before = ofKind("tax-specialist", "close-task").map((i) => i.closeTaskId);
    expect(before).toContain("F1");
    wf().completeCloseTask("F1", "Credit statement check TDS-0930");
    expect(ofKind("tax-specialist", "close-task").map((i) => i.closeTaskId)).not.toContain("F1");
  });

  it("the external auditor has nothing in a queue", () => {
    expect(modelsAt().work("external-auditor")).toEqual([]);
  });

  it("orders overdue first, then the soonest due, then the largest", () => {
    const base = { id: "x", kind: "rec" as const, module: "m", title: "t", detail: "d", overdue: false };
    const items = [
      { ...base, id: "late", overdue: true, due: "2026-10-05" }, { ...base, id: "soon", due: "2026-10-08" }, { ...base, id: "later", due: "2026-10-20" },
      { ...base, id: "big", value: 100 }, { ...base, id: "small", value: 5 },
    ];
    expect([...items].sort(urgency).map((i) => i.id)).toEqual(["late", "soon", "later", "big", "small"]);
    expect(dueBucket(items[0], "2026-10-07")).toBe("overdue");
    expect(dueBucket(items[1], "2026-10-07")).toBe("week");
    expect(dueBucket(items[2], "2026-10-07")).toBe("later");
    expect(dueBucket(items[3], "2026-10-07")).toBe("none");
  });
});

describe("Home", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("controller");
  });

  it("gives leaders the close, operators their queue and the auditor the audit", () => {
    expect(["cfo", "head-of-finance", "controller", "controls-lead"].map((r) => homeViewOf(r as RoleId))).toEqual(["leader", "leader", "leader", "leader"]);
    expect(["gl-accountant", "ar-specialist", "treasury-analyst", "tax-specialist", "reporting-analyst"].map((r) => homeViewOf(r as RoleId))).toEqual(Array(5).fill("operator"));
    expect(homeViewOf("external-auditor")).toBe("auditor");
  });

  it("ties its headline numbers to the records", () => {
    const m = modelsAt();
    const { kpis } = m.home("controller");
    expect(kpis.accountsSigned).toBe(m.review.accounts.filter((a) => a.status === "reviewer-signed").length);
    expect(kpis.accountsTotal).toBe(m.review.accounts.length);
    expect(kpis.recsSigned).toBe(m.recRows.filter((r) => r.status === "reviewer-signed").length);
    expect(kpis.exceptions).toBe(m.close.evaluation.byId.get("D7")!.total - m.close.evaluation.byId.get("D7")!.done);
    expect(kpis.closeProgress).toBe(m.close.evaluation.progress);
    expect(kpis.approvals).toBe(0);
  });

  it("counts the approvals waiting, and those for the role", () => {
    const p = propose(WORLD.anchors["S-01"][0], "Write off", 20_00_000);
    const kpis = modelsAt().home("controller").kpis;
    expect(kpis.approvals).toBe(1);
    expect(kpis.approvalsForRole).toBe(1);
    expect(modelsAt().home("head-of-finance").kpis.approvalsForRole).toBe(0);
    expect(p.id).toBeTruthy();
  });

  it("puts the biggest and most pressing things first, at most three of a kind, at most eight", () => {
    const { attention } = modelsAt().home("controller");
    expect(attention.length).toBeGreaterThan(3);
    expect(attention.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < attention.length; i += 1) expect(attention[i - 1].rank, attention[i].id).toBeGreaterThanOrEqual(attention[i].rank);
    const perKind: Record<string, number> = {};
    for (const a of attention) {
      perKind[a.kind] = (perKind[a.kind] ?? 0) + 1;
      expect(ATTENTION_LABEL[a.kind]).toBeTruthy();
      expect(a.link || a.itemKey, a.id).toBeTruthy();
    }
    expect(Math.max(...Object.values(perKind))).toBeLessThanOrEqual(3);
  });

  it("includes the journal entered at 11:42 PM and the late bank reconciliations", () => {
    const { attention } = modelsAt().home("controller");
    expect(attention.some((a) => a.kind === "journal" && a.value === 25_00_000)).toBe(true);
    expect(attention.some((a) => a.id === "close:C2")).toBe(true);
  });

  it("drops what has been dealt with", () => {
    const first = modelsAt().home("controller").attention.find((a) => a.kind === "journal")!;
    const key = first.link!.split("/").pop()!;
    expect(wf().reviewJournal(key, "accepted", "Agrees to the contract schedule").ok).toBe(true);
    expect(modelsAt().home("controller").attention.some((a) => a.id === first.id)).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { Decision, RoleId } from "@/types";
import { LINE_BY_KEY, WORLD } from "@/data";
import { PBC_AUDITOR_ID, PBC_REQUESTS } from "@/data/workspace/pbc";
import { seededSignOffs } from "@/data/workspace/activity";
import { pbcProgress, pbcState, type AuditInputs } from "@/engine/audit";
import { readinessOf, scheduleRows, scheduleWorkbook, summaryRows } from "@/engine/schedule";
import { recommendAll } from "@/engine/recommend";
import { buildXlsx } from "@/lib/xlsx";
import { CATEGORY_LABELS } from "@/lib/labels";
import { buildReview, getRun, latestDecisions, latestFollowUps } from "@/state/hooks";
import { buildRecRows } from "@/state/recHooks";
import { buildSchedule } from "@/state/auditHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";

const AS_OF = WORLD.asOf;
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();

function model() {
  const s = wf();
  const run = getRun(AS_OF, s.ruleOverrides);
  const open = new Set(Object.values(s.followUps).filter((f) => f.status === "open").map((f) => f.itemKey));
  const review = buildReview({ run, recs: recommendAll(run, open), decisions: latestDecisions(s.decisions), followUps: latestFollowUps(s.followUps), signOffs: s.signOffs, businessUnitId: "all", asOf: AS_OF });
  const recRows = buildRecRows({ recs: s.recs, signOffs: s.signOffs, decisions: s.decisions, followUps: s.followUps });
  const schedules = review.accounts.map((a) => buildSchedule(a, review, recRows, Object.values(s.decisions)));
  return { review, recRows, schedules };
}

const inputs = (over: Partial<AuditInputs> = {}): AuditInputs => ({
  accounts: [
    { category: "trade-recv", status: "reviewer-signed" },
    { category: "trade-recv", status: "preparer-signed" },
    { category: "trade-pay", status: "reviewer-signed" },
  ],
  recs: [
    { type: "Bank", status: "reviewer-signed" },
    { type: "Bank", status: "reviewer-signed" },
    { type: "Vendor statement", status: "in-review" },
  ],
  journals: [{ reviewed: true }, { reviewed: false }, { reviewed: false }],
  ...over,
});

describe("auditor requests", () => {
  it("are a numbered list with an owner from the team and a due date after the request", () => {
    expect(PBC_REQUESTS).toHaveLength(27);
    expect(new Set(PBC_REQUESTS.map((r) => r.id)).size).toBe(27);
    for (const r of PBC_REQUESTS) {
      const owner = WORLD.people.find((p) => p.id === r.ownerId);
      expect(owner, r.id).toBeDefined();
      expect(owner!.roleId, r.id).not.toBe("external-auditor");
      expect(r.due > r.requestedOn, r.id).toBe(true);
    }
    expect(WORLD.people.find((p) => p.id === PBC_AUDITOR_ID)!.roleId).toBe("external-auditor");
  });

  it("link only to account categories the chart holds", () => {
    const held = new Set(WORLD.glAccounts.map((g) => g.category));
    for (const r of PBC_REQUESTS) {
      if (r.link?.kind !== "accounts") continue;
      for (const c of r.link.categories) {
        expect(CATEGORY_LABELS[c], `${r.id} ${c}`).toBeDefined();
        expect(held.has(c), `${r.id} ${c}`).toBe(true);
      }
    }
  });

  it("take their progress from sign-offs, counting only what the reviewer signed", () => {
    expect(pbcProgress({ kind: "accounts", categories: ["trade-recv"] }, inputs())).toMatchObject({ done: 1, total: 2, label: "1 of 2 accounts signed off" });
    expect(pbcProgress({ kind: "accounts", categories: ["trade-pay"] }, inputs())).toMatchObject({ done: 1, total: 1, label: "1 of 1 account signed off" });
    expect(pbcProgress({ kind: "recs", types: ["Bank"] }, inputs())).toMatchObject({ done: 2, total: 2 });
    expect(pbcProgress({ kind: "recs", types: ["Bank", "Vendor statement"] }, inputs())).toMatchObject({ done: 2, total: 3, label: "2 of 3 reconciliations signed off" });
    expect(pbcProgress({ kind: "journals" }, inputs())).toMatchObject({ done: 1, total: 3, label: "1 of 3 flagged journals reviewed" });
    expect(pbcProgress(undefined, inputs())).toBeUndefined();
  });

  const req = (id: string) => PBC_REQUESTS.find((r) => r.id === id)!;

  it("are overdue when open or in preparation past the due date, and never once provided", () => {
    const r = { ...req("PBC-003"), due: "2026-10-09" };
    expect(pbcState({ ...r, seedStatus: "open" }, undefined, inputs(), "2026-10-09").overdue).toBe(false);
    expect(pbcState({ ...r, seedStatus: "open" }, undefined, inputs(), "2026-10-10").overdue).toBe(true);
    expect(pbcState({ ...r, seedStatus: "in-preparation" }, undefined, inputs(), "2026-10-10").overdue).toBe(true);
    expect(pbcState({ ...r, seedStatus: "provided" }, undefined, inputs(), "2026-10-10").overdue).toBe(false);
    expect(pbcState({ ...r, seedStatus: "open" }, { status: "closed" }, inputs(), "2026-10-10").overdue).toBe(false);
  });

  it("are blocked while the work they depend on is incomplete, and only then", () => {
    const linked = req("PBC-008"); // customer statements
    const blocked = pbcState(linked, undefined, inputs({ recs: [{ type: "Customer statement", status: "in-review" }] }), "2026-10-07");
    expect(blocked.blocker).toBe("0 of 1 reconciliation signed off");
    const clear = pbcState(linked, undefined, inputs({ recs: [{ type: "Customer statement", status: "reviewer-signed" }] }), "2026-10-07");
    expect(clear.blocker).toBeUndefined();
    expect(pbcState(req("PBC-003"), undefined, inputs(), "2026-10-07").blocker).toBeUndefined();
    expect(pbcState(linked, { status: "provided" }, inputs({ recs: [{ type: "Customer statement", status: "in-review" }] }), "2026-10-07").blocker).toBeUndefined();
    expect(pbcState(linked, undefined, inputs({ recs: [] }), "2026-10-07").blocker).toBeUndefined();
  });

  it("show the session's changes over the seeded status, owner and evidence", () => {
    const s = pbcState(req("PBC-003"), { status: "provided", ownerId: "P05", evidence: "Filed" }, inputs(), "2026-10-07");
    expect(s).toMatchObject({ status: "provided", ownerId: "P05", evidence: "Filed" });
    expect(pbcState(req("PBC-001"), undefined, inputs(), "2026-10-07")).toMatchObject({ status: "provided", evidence: expect.stringContaining("Data load") });
  });
});

describe("auditor schedules", () => {
  const { review, recRows, schedules } = model();

  it("cover every account the review lists", () => {
    expect(schedules.length).toBe(review.accounts.length);
    expect(schedules.length).toBeGreaterThan(30);
    expect(new Set(schedules.map((s) => s.gl)).size).toBe(schedules.length);
  });

  it("roll forward to the trial balance, for every account (FR-AUD-01)", () => {
    for (const s of schedules) {
      expect(s.rollForward.ties, s.gl).toBe(true);
      expect(s.rollForward.closing, s.gl).toBeCloseTo(s.rollForward.trialBalance, 2);
      expect(s.rollForward.opening + s.rollForward.debits + s.rollForward.credits, s.gl).toBeCloseTo(s.rollForward.closing, 2);
    }
  });

  it("show the same balance as the Balance Sheet Review", () => {
    for (const a of review.accounts) expect(schedules.find((s) => s.gl === a.summary.gl.gl)!.rollForward.closing).toBe(a.summary.closing);
  });

  it("age the open items exactly as the review does", () => {
    for (const s of schedules) {
      const a = review.accountByGl.get(s.gl)!;
      expect(s.ageing.reduce((t, b) => t + b.count, 0), s.gl).toBe(a.summary.openCount);
      expect(s.ageing.reduce((t, b) => t + b.amount, 0), s.gl).toBeCloseTo(a.summary.openGross, 2);
    }
  });

  it("add the statutory bands for trade receivables and payables, from the same open items", () => {
    const trade = schedules.filter((s) => s.category === CATEGORY_LABELS["trade-recv"] || s.category === CATEGORY_LABELS["trade-pay"]);
    expect(trade.length).toBeGreaterThan(0);
    for (const s of trade.filter((t) => t.ageing.some((b) => b.count > 0))) {
      expect(s.statutory, s.gl).toBeDefined();
      expect(s.statutory!.reduce((t, b) => t + b.amount, 0), s.gl).toBeCloseTo(s.ageing.reduce((t, b) => t + b.amount, 0), 2);
    }
    expect(schedules.filter((s) => s.statutory).every((s) => trade.some((t) => t.gl === s.gl) || s.category === CATEGORY_LABELS.cwip)).toBe(true);
  });

  it("list the flagged items with the status of the work on them", () => {
    const flagged = schedules.flatMap((s) => s.items);
    expect(flagged.length).toBeGreaterThan(20);
    for (const s of schedules) {
      expect(s.items.every((i) => LINE_BY_KEY.get(i.key)!.gl === s.gl)).toBe(true);
      const amounts = s.items.map((i) => Math.abs(i.amount));
      expect([...amounts].sort((x, y) => y - x)).toEqual(amounts);
    }
    expect(flagged.every((i) => i.status.length > 0)).toBe(true);
  });

  it("attach the reconciliations of the account, with the same figures", () => {
    const withRecs = schedules.filter((s) => s.recs.length);
    expect(withRecs.length).toBeGreaterThan(5);
    for (const s of withRecs) {
      for (const r of s.recs) {
        const row = recRows.find((x) => x.rec.id === r.id)!;
        expect(r.books).toBe(row.rec.booksBalance);
        expect(r.unexplained).toBe(row.view.unexplained);
        expect(r.status).toBe(row.status);
      }
    }
    const receivables = schedules.filter((s) => s.category === CATEGORY_LABELS["trade-recv"]);
    expect(receivables.some((s) => s.recs.some((r) => r.type === "Customer statement"))).toBe(true);
  });

  it("attach each customer and vendor statement to the one account it is booked on, and intercompany ones to at least one", () => {
    const count = (id: string) => schedules.filter((s) => s.recs.some((r) => r.id === id)).length;
    const statements = recRows.filter((x) => x.rec.type === "Customer statement" || x.rec.type === "Vendor statement");
    expect(statements.length).toBeGreaterThan(10);
    for (const r of statements) expect(count(r.rec.id), r.rec.id).toBe(1);
    for (const r of recRows.filter((x) => x.rec.type === "Intercompany")) expect(count(r.rec.id), r.rec.id).toBeGreaterThanOrEqual(1);
  });

  it("start with no account signed ahead of its own reconciliation", () => {
    const seeded = seededSignOffs();
    for (const r of WORLD.reconciliations) {
      if (!r.gl) continue;
      if (seeded[`${r.gl}|${AS_OF}`]) expect(seeded[`${r.id}|${AS_OF}`]?.reviewer, `${r.gl} signed before ${r.id}`).toBeDefined();
    }
  });

  it("explain what stands between an account and its sign-off", () => {
    for (const s of schedules) {
      const a = review.accountByGl.get(s.gl)!;
      expect(s.readiness).toBe(readinessOf(a.status));
      if (a.status === "reviewer-signed" && s.recs.every((r) => r.status === "reviewer-signed")) expect(s.blockers, s.gl).toEqual([]);
      if (a.status !== "reviewer-signed") expect(s.blockers.length, s.gl).toBeGreaterThan(0);
    }
    expect(schedules.some((s) => s.readiness === "ready")).toBe(true);
    expect(schedules.some((s) => s.readiness !== "ready")).toBe(true);
  });

  it("show the decisions taken in the session and the item they were taken on", () => {
    wf().resetDemo();
    const key = WORLD.anchors["S-01"][0];
    const line = LINE_BY_KEY.get(key)!;
    const d: Decision = {
      id: "DEC-T0001", itemKey: key, module: "balance-sheet-review", action: "Write back", amount: line.amount, proposedBy: "P02", proposedAt: "2026-10-06T10:00",
      justification: "Obligation lapsed", approvalBandId: "B2", chain: ["controller", "head-of-finance"],
      approvals: [{ roleId: "controller", personId: "P01", at: "2026-10-06T11:00" }], taxReviewRequired: true, status: "proposed", snapshot: { hits: [], rulesVersion: "t" },
    };
    useWorkflow.setState({ decisions: { [d.id]: d } });
    const after = model().schedules.find((s) => s.gl === line.gl)!;
    expect(after.decisions.map((x) => x.id)).toContain(d.id);
    const row = after.decisions.find((x) => x.id === d.id)!;
    expect(row).toMatchObject({ action: "Write back", band: "B2", status: "Proposed", proposedBy: "Rohan Deshpande" });
    expect(row.approvals).toContain("Financial Controller");
    expect(after.items.find((i) => i.key === key)?.status).toBe("Write back, proposed");
    wf().resetDemo();
  });

  it("assemble for every account in a few seconds", () => {
    const t0 = performance.now();
    model();
    expect(performance.now() - t0).toBeLessThan(6000);
  });
});

describe("the schedule workbook", () => {
  const { schedules } = model();
  const list = schedules.slice(0, 6);
  const sheets = scheduleWorkbook(list, "Note");

  it("has a summary sheet and one sheet per account", () => {
    expect(sheets).toHaveLength(7);
    expect(sheets[0].name).toBe("Summary");
    expect(sheets.slice(1).map((s) => s.name)).toEqual(list.map((s) => `${s.gl} ${s.description}`));
  });

  it("lists one summary row per account with the figures of its schedule", () => {
    const rows = summaryRows(list, "Note");
    expect(rows).toHaveLength(1 + list.length + 2);
    const first = rows[1] as unknown[];
    expect(first[0]).toBe(list[0].gl);
    expect((first[6] as { v: number }).v).toBe(list[0].rollForward.closing);
  });

  it("lays each schedule out in the parts of the auditor schedule, in order", () => {
    const text = scheduleRows(list[0]).map((r) => (r[0] && typeof r[0] === "object" ? String((r[0] as { v: unknown }).v) : String(r[0] ?? "")));
    const at = (prefix: string) => text.findIndex((t) => t.startsWith(prefix));
    const order = ["Roll-forward", "Ageing (review bands)", "Items above", "Decisions in the period", "Commentary and sign-off"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is written as a workbook package", () => {
    const bytes = buildXlsx(sheets);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(bytes.length).toBeGreaterThan(2000);
  });
});

describe("request actions", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("controller");
  });

  it("start, provide and close a request, each by someone who may and each leaving an event", () => {
    as("gl-accountant");
    expect(wf().startRequest("PBC-003").ok).toBe(true);
    expect(wf().pbc["PBC-003"].status).toBe("in-preparation");
    expect(wf().startRequest("PBC-003").ok).toBe(false);
    expect(wf().provideRequest("PBC-003", "", "").ok).toBe(false);
    expect(wf().provideRequest("PBC-003", "Draft letter filed under TR-2026-Q3", "Signed copy follows").ok).toBe(true);
    expect(wf().pbc["PBC-003"]).toMatchObject({ status: "provided", evidence: "Draft letter filed under TR-2026-Q3", note: "Signed copy follows" });
    expect(wf().provideRequest("PBC-003", "Again", "").ok).toBe(false);
    as("gl-accountant");
    expect(wf().closeRequest("PBC-003").ok).toBe(false);
    as("controller");
    expect(wf().closeRequest("PBC-003").ok).toBe(true);
    expect(wf().events.filter((e) => e.module === "audit-readiness").map((e) => e.action)).toEqual(["Request started", "Request provided", "Request closed"]);
  });

  it("the external auditor asks and reads; it cannot prepare, provide or close", () => {
    as("external-auditor");
    expect(wf().startRequest("PBC-003").ok).toBe(false);
    expect(wf().provideRequest("PBC-003", "Filed", "").ok).toBe(false);
    expect(wf().closeRequest("PBC-001").ok).toBe(false);
    expect(wf().assignRequest("PBC-003", "P05").ok).toBe(false);
    expect(wf().pbc).toEqual({});
  });

  it("a request that waits for review work cannot be provided until it is done", () => {
    as("gl-accountant");
    const early = wf().provideRequest("PBC-002", "Workbook exported", "", { done: 12, total: 40 });
    expect(early.ok).toBe(false);
    expect(early.ok === false && early.error).toContain("12 of 40");
    expect(wf().provideRequest("PBC-002", "Workbook exported", "", { done: 40, total: 40 }).ok).toBe(true);
  });

  it("a request already provided at the start cannot be provided again", () => {
    expect(wf().provideRequest("PBC-001", "Again", "").ok).toBe(false);
  });

  it("reopening needs a reason and a manager, and clears what was provided", () => {
    as("gl-accountant");
    wf().provideRequest("PBC-003", "Filed", "");
    expect(wf().reopenRequest("PBC-003", "Auditor wants the signed copy").ok).toBe(false);
    as("controller");
    expect(wf().reopenRequest("PBC-003", " ").ok).toBe(false);
    expect(wf().reopenRequest("PBC-003", "Auditor wants the signed copy").ok).toBe(true);
    expect(wf().pbc["PBC-003"]).toMatchObject({ status: "in-preparation", evidence: undefined });
    expect(wf().reopenRequest("PBC-003", "Again").ok).toBe(false);
    expect(wf().reopenRequest("PBC-001", "Seeded as provided").ok).toBe(true);
  });

  it("assign to someone on the team, not the auditor and not the current owner", () => {
    expect(wf().assignRequest("PBC-003", PBC_AUDITOR_ID).ok).toBe(false);
    expect(wf().assignRequest("PBC-003", "P14").ok).toBe(false); // already the owner
    expect(wf().assignRequest("PBC-003", "P05").ok).toBe(true);
    expect(wf().pbc["PBC-003"].ownerId).toBe("P05");
    const ev = wf().events.at(-1)!;
    expect(ev).toMatchObject({ action: "Request reassigned", before: "Radhika Joshi", after: "Sneha Kulkarni" });
    expect(wf().assignRequest("PBC-999", "P05").ok).toBe(false);
  });

  it("the auditor raises a request, which joins the list and is worked like any other", () => {
    const due = "2099-01-01";
    as("external-auditor");
    expect(wf().raiseRequest({ title: "Related party disclosures", area: "Provisions and group", due, ownerId: "P04" })).toEqual({ ok: true, id: "PBC-028" });
    expect(wf().pbcRaised).toHaveLength(1);
    expect(wf().pbcRaised[0]).toMatchObject({ id: "PBC-028", requestedOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ownerId: "P04", seedStatus: "open" });
    expect(wf().events.at(-1)).toMatchObject({ action: "Request raised", actorId: PBC_AUDITOR_ID });
    expect(wf().raiseRequest({ title: "Another", area: "Tax", due, ownerId: "P09" })).toEqual({ ok: true, id: "PBC-029" });
    as("gl-accountant");
    expect(wf().startRequest("PBC-028").ok).toBe(true);
    expect(wf().provideRequest("PBC-028", "Schedule filed", "").ok).toBe(true);
    expect(wf().pbc["PBC-028"].status).toBe("provided");
  });

  it("raising needs a description, a past-proof date and an owner from the team; preparers cannot raise", () => {
    const base = { title: "Fixed asset physical verification report", area: "Fixed assets and inventory", due: "2099-01-01", ownerId: "P03" };
    as("external-auditor");
    expect(wf().raiseRequest({ ...base, title: "  " }).ok).toBe(false);
    expect(wf().raiseRequest({ ...base, due: "2020-01-01" }).ok).toBe(false);
    expect(wf().raiseRequest({ ...base, ownerId: PBC_AUDITOR_ID }).ok).toBe(false);
    expect(wf().raiseRequest({ ...base, ownerId: "P99" }).ok).toBe(false);
    as("gl-accountant");
    expect(wf().raiseRequest(base).ok).toBe(false);
    expect(wf().pbcRaised).toEqual([]);
    as("controller");
    expect(wf().raiseRequest(base).ok).toBe(true);
  });

  it("an export is recorded against the module", () => {
    wf().recordExport("Auditor schedules", { accounts: 12 });
    const ev = wf().events.at(-1)!;
    expect(ev).toMatchObject({ module: "audit-readiness", action: "Auditor schedules exported", details: { accounts: 12 } });
  });
});

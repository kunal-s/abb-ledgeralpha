import { beforeEach, describe, expect, it } from "vitest";
import { BALANCES, GL_BY_ID, LINE_BY_KEY, WORLD, balanceAt, isOpenAt } from "@/data";
import { effectiveRules, runRules } from "@/engine/run";
import { recommend, recommendAll } from "@/engine/recommend";
import { BUCKETS, buildHeatmap, readiness, scanLedger, accountStatus, ageOf } from "@/engine/review";
import { previousQuarterEnd } from "@/engine/context";
import { draftCommentary } from "@/engine/commentary";
import { buildProposal, exportRows } from "@/engine/journals";
import { draftFollowUp } from "@/engine/followup";
import { seededSignOffs, SEEDED_RULE_OVERRIDES } from "@/data/workspace/activity";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import type { RoleId } from "@/types";

const AS_OF = WORLD.asOf;
const PRIOR = previousQuarterEnd(AS_OF);
const run = runRules(AS_OF, effectiveRules(SEEDED_RULE_OVERRIDES));
const recs = recommendAll(run, new Set());
const anchor = (id: string, i = 0) => WORLD.anchors[id][i];
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();

describe("ledger scan and heatmap", () => {
  const scan = scanLedger(AS_OF, PRIOR, "all");

  it("closing balances per account equal the trial balance", () => {
    for (const s of scan.accounts.values()) {
      expect(s.closing, s.gl.gl).toBe(balanceAt(BALANCES, s.gl.gl, AS_OF)!.closing);
    }
  });

  it("prior-period balances equal the trial balance at the prior review date", () => {
    for (const s of scan.accounts.values()) {
      expect(s.prior, s.gl.gl).toBe(balanceAt(BALANCES, s.gl.gl, PRIOR)!.closing);
    }
  });

  it("the review period starts the day after the previous quarter end", () => {
    expect(PRIOR).toBe("2026-06-30");
  });

  it("heatmap counts and amounts reconcile to the open items", () => {
    const heat = buildHeatmap(run.ctx.open, new Set(run.items.keys()), AS_OF);
    expect(heat.total.count).toBe(run.ctx.open.length);
    expect(heat.total.amount).toBe(run.ctx.open.reduce((s, l) => s + Math.abs(l.amount), 0));
    let cells = 0;
    for (const c of heat.categories) for (const b of BUCKETS) cells += heat.cell(c, b.id).count;
    expect(cells).toBe(run.ctx.open.length);
    const openByAccounts = [...scan.accounts.values()].reduce((s, a) => s + a.openCount, 0);
    expect(openByAccounts).toBe(run.ctx.open.length);
  });

  it("over-threshold amounts agree between the scan and the heatmap", () => {
    const heat = buildHeatmap(run.ctx.open, new Set(), AS_OF);
    const fromHeat = heat.colTotal("181-365").amount + heat.colTotal("365+").amount;
    const fromScan = [...scan.accounts.values()].reduce((s, a) => s + a.overAmount, 0);
    expect(fromScan).toBe(fromHeat);
  });

  it("a business-unit scope can only reduce balances", () => {
    const scoped = scanLedger(AS_OF, PRIOR, "MO");
    const openAll = [...scan.accounts.values()].reduce((s, a) => s + a.openCount, 0);
    const openMo = [...scoped.accounts.values()].reduce((s, a) => s + a.openCount, 0);
    expect(openMo).toBeGreaterThan(0);
    expect(openMo).toBeLessThan(openAll);
  });

  it("ageing buckets follow the policy boundaries", () => {
    expect(BUCKETS.map((b) => b.id)).toEqual(["0-90", "91-180", "181-365", "365+"]);
    const l = LINE_BY_KEY.get(anchor("S-01"))!;
    expect(ageOf(l, AS_OF)).toBe(412);
  });
});

describe("sign-off readiness", () => {
  const big = [...run.items.values()].filter((l) => Math.abs(l.amount) >= 1_00_000).slice(0, 3);
  const small = [...run.items.values()].filter((l) => Math.abs(l.amount) < 1_00_000).slice(0, 2);

  it("requires only items at or above materiality", () => {
    const r = readiness([...big, ...small], () => false, true);
    expect(r.required).toHaveLength(big.length);
    expect(r.undocumented).toHaveLength(big.length);
    expect(r.ready).toBe(false);
  });

  it("is ready when every required item is documented and commentary exists", () => {
    expect(readiness([...big, ...small], () => true, true).ready).toBe(true);
    expect(readiness([...big], () => true, false).ready).toBe(false);
    expect(readiness([], () => false, true).ready).toBe(true);
  });

  it("derives account status from sign-off, readiness and activity", () => {
    const so = { gl: "x", periodEnd: AS_OF };
    expect(accountStatus(undefined, false, false)).toBe("not-started");
    expect(accountStatus(undefined, false, true)).toBe("in-review");
    expect(accountStatus(undefined, true, true)).toBe("ready-for-signoff");
    expect(accountStatus({ ...so, preparer: { personId: "P02", at: "t" } }, true, true)).toBe("preparer-signed");
    expect(accountStatus({ ...so, preparer: { personId: "P02", at: "t" }, reviewer: { personId: "P01", at: "t" } }, true, true)).toBe("reviewer-signed");
    expect(accountStatus({ ...so, reopened: { personId: "P01", at: "t", reason: "r" } }, false, true)).toBe("reopened");
  });
});

describe("seeded sign-offs", () => {
  const seeded = Object.values(seededSignOffs());
  it("cover only balance-only accounts, with the owner preparing and the controller reviewing", () => {
    expect(seeded.length).toBeGreaterThan(15);
    for (const s of seeded) {
      const g = GL_BY_ID.get(s.gl)!;
      expect(g.openItemManaged).toBe(false);
      expect(s.preparer!.personId).toBe(g.ownerId);
      if (s.reviewer) {
        expect(s.reviewer.personId).toBe(g.reviewerId);
        expect(s.reviewer.personId).not.toBe(s.preparer!.personId);
      }
    }
    expect(seeded.some((s) => s.reviewer)).toBe(true);
    expect(seeded.some((s) => !s.reviewer)).toBe(true);
  });
});

describe("commentary and follow-up drafts", () => {
  it("states only facts it was given", () => {
    const g = GL_BY_ID.get("211300")!;
    const text = draftCommentary({
      gl: g, asOf: AS_OF, closing: -46_50_00_000, prior: -44_00_00_000, priorDate: PRIOR, openItemManaged: true,
      overCount: 85, overAmount: 6_40_00_000, flaggedCount: 120,
      byAction: { "Write back": { count: 12, value: 1_30_00_000 }, Clear: { count: 32, value: 1_13_00_000 } },
      decisions: { proposed: 2, approved: 1, exported: 0 }, openFollowUps: 4,
      largest: { docNo: "5000412873", amount: -18_64_320, reason: "Goods received 412 days ago" },
    });
    expect(text).toContain("₹46.50 cr Cr");
    expect(text).toContain("85 items");
    expect(text).toContain("12 items");
    expect(text).toContain("5000412873");
    expect(text).toContain("4 follow-ups open");
  });

  it("drafts a vendor follow-up that cites the guarantee", () => {
    const key = anchor("S-04");
    const item = LINE_BY_KEY.get(key)!;
    const hits = run.byItem.get(key)!;
    const d = draftFollowUp(item, recs.get(key), hits);
    expect(d.owner).toContain("Vendor");
    expect(d.message).toContain("HDFC/BG/2025/00731");
    expect(d.message).toContain("31-Dec-2026");
  });
});

describe("journal proposals", () => {
  beforeEach(() => wf().resetDemo());

  function decide(scenario: string, action: "Write back" | "Provide" | "Write off" | "Reclassify" | "Clear") {
    const key = anchor(scenario);
    const item = LINE_BY_KEY.get(key)!;
    as("gl-accountant");
    const p = wf().proposeDecision({ itemKey: key, module: "balance-sheet-review", action, amount: item.amount, justification: "Test", recommendation: recs.get(key), hits: run.byItem.get(key) ?? [], rulesVersion: run.version });
    expect(p.ok).toBe(true);
    return wf().decisions[(p as { id: string }).id];
  }

  it("write-back reverses the liability and credits income, balanced", () => {
    const p = buildProposal(decide("S-01", "Write back"))!;
    expect(p.kind).toBe("JV");
    expect(p.lines.map((l) => [l.gl, l.side, l.amount])).toEqual([["211300", "Dr", 18_64_320], ["461500", "Cr", 18_64_320]]);
  });

  it("provision debits expense and credits the allowance; write-off of a tax credit hits tax expense", () => {
    const prov = buildProposal(decide("S-05", "Provide"))!;
    expect(prov.lines.map((l) => [l.gl, l.side])).toEqual([["531400", "Dr"], ["149100", "Cr"]]);
    const wo = buildProposal(decide("S-07", "Write off"))!;
    expect(wo.lines.map((l) => [l.gl, l.side])).toEqual([["550100", "Dr"], ["161100", "Cr"]]);
  });

  it("reclassification of a supplier invoice posted to advances goes to payables", () => {
    const p = buildProposal(decide("S-13", "Reclassify"))!;
    expect(p.needsTarget).toBe(false);
    // the item is a credit on an asset account: debit it to reverse, credit payables
    expect(p.lines.map((l) => [l.gl, l.side])).toEqual([["151100", "Dr"], ["210100", "Cr"]]);
  });

  it("every journal proposal balances; clearing proposals carry no amounts", () => {
    const ds = [decide("S-01", "Write back"), decide("S-05", "Provide"), decide("S-07", "Write off"), decide("S-02", "Clear")];
    for (const d of ds) {
      const p = buildProposal(d)!;
      if (p.kind === "JV") {
        const dr = p.lines.filter((l) => l.side === "Dr").reduce((s, l) => s + l.amount, 0);
        const cr = p.lines.filter((l) => l.side === "Cr").reduce((s, l) => s + l.amount, 0);
        expect(dr).toBe(cr);
      } else expect(p.lines).toHaveLength(0);
    }
    const rows = exportRows(ds, "JVP-TEST", AS_OF);
    expect(rows.some((r) => r.docType === "Clearing")).toBe(true);
    expect(rows.filter((r) => r.docType === "SA")).toHaveLength(6);
  });
});

describe("bulk workflow actions", () => {
  beforeEach(() => wf().resetDemo());
  const keys = () => run.items.size && [...run.byItem.keys()].filter((k) => recs.get(k)?.action === "Clear").slice(0, 6);

  it("proposes recommended actions in bulk with one activity event, skipping duplicates", () => {
    as("gl-accountant");
    const ks = keys() as string[];
    const inputs = ks.map((k) => ({ itemKey: k, module: "balance-sheet-review", action: recs.get(k)!.action, amount: LINE_BY_KEY.get(k)!.amount, justification: "Accepted the recommendation", recommendation: recs.get(k), hits: run.byItem.get(k)!, rulesVersion: run.version }));
    const r = wf().proposeDecisions(inputs);
    expect(r).toMatchObject({ ok: true, created: ks.length });
    const events = wf().events.filter((e) => e.action.startsWith("Decisions proposed"));
    expect(events).toHaveLength(1);
    expect(events[0].itemKeys).toEqual(ks);
    const again = wf().proposeDecisions(inputs);
    expect(again.ok).toBe(false);
  });

  it("approves in bulk only what the acting role is next to approve", () => {
    as("gl-accountant");
    const ks = (keys() as string[]).slice(0, 4);
    wf().proposeDecisions(ks.map((k) => ({ itemKey: k, module: "balance-sheet-review", action: "Clear" as const, amount: LINE_BY_KEY.get(k)!.amount, justification: "ok", hits: [], rulesVersion: run.version })));
    const ids = Object.keys(wf().decisions);
    as("head-of-finance");
    expect(wf().approveDecisions(ids).ok).toBe(false); // the controller is first in the chain
    as("controller");
    const r = wf().approveDecisions(ids) as { ok: true; approved: number };
    expect(r.approved).toBe(4);
    expect(wf().events.filter((e) => e.action.startsWith("Decisions approved"))).toHaveLength(1);
  });

  it("requests follow-ups in bulk with one event that covers every item", () => {
    as("gl-accountant");
    const ks = (keys() as string[]).slice(0, 5);
    const r = wf().requestFollowUps(ks.map((k) => ({ itemKey: k, module: "balance-sheet-review", owner: "Vendor", dueDate: "2026-10-20", message: "Please confirm" })));
    expect(r).toEqual({ ok: true, created: 5 });
    expect(Object.keys(wf().followUps)).toHaveLength(5);
    const ev = wf().events.filter((e) => e.action.startsWith("Follow-ups requested"));
    expect(ev).toHaveLength(1);
    expect(ev[0].itemKeys).toEqual(ks);
  });

  it("the account owner acts when their role is selected", () => {
    as("gl-accountant");
    const key = anchor("S-05"); // on 151100, owned by Kavya Menon
    const owner = GL_BY_ID.get("151100")!.ownerId;
    const r = wf().proposeDecision({ itemKey: key, module: "balance-sheet-review", action: "Provide", amount: 36_80_000, justification: "No guarantee", hits: [], rulesVersion: run.version }) as { id: string };
    expect(wf().decisions[r.id].proposedBy).toBe(owner);
  });

  it("recommendations still agree with the rule engine after workflow actions", () => {
    const k = anchor("S-01");
    expect(recommend(run, k, new Set())!.action).toBe("Write back");
    expect(isOpenAt(LINE_BY_KEY.get(k)!, AS_OF)).toBe(true);
  });
});

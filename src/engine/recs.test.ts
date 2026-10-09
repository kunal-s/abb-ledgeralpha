import { beforeEach, describe, expect, it } from "vitest";
import { BALANCES, LINE_BY_KEY, PERSON_BY_ID, REC_BY_ID, WORLD, balanceAt, statementItems } from "@/data";
import { seededSignOffs } from "@/data/workspace/activity";
import { seededHistory } from "@/engine/history";
import { adjustmentJournal, bridgeOf, documentedItems, effectiveRec, itemAgeing, needsAction, recItemKey, signOffBlockers } from "@/engine/recs";
import { diagnoseCustomer } from "@/engine/diagnose";
import { exportRows } from "@/engine/journals";
import { RECON_CLASSES, RECON_TYPES } from "@/engine/recClasses";
import { grirByPo, rollforward, subLedgerByPartner } from "@/engine/recDrill";
import { previousQuarterEnd } from "@/engine/context";
import { preparerWorkload, reconcilerSummary, typeDifferences } from "@/engine/recOverview";
import { RECON_POLICY } from "@/config/policies";
import { can } from "@/config/roles";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import type { RoleId } from "@/types";

const AS_OF = WORLD.asOf;
const recs = WORLD.reconciliations;
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();
const view = (id: string) => effectiveRec(REC_BY_ID.get(id)!, wf().recs[id], AS_OF);
const blockers = (id: string) => {
  const s = wf();
  return signOffBlockers(view(id), !!s.signOffs[`${id}|${AS_OF}`]?.commentary?.trim(), documentedItems(id, Object.values(s.decisions), Object.values(s.followUps), view(id).items));
};
const anchor = (id: string, i = 0) => WORLD.anchors[id][i];
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe("reconciliations in the world", () => {
  it("cover every type, with unique ids", () => {
    const by = (t: string) => recs.filter((r) => r.type === t).length;
    expect(by("Bank")).toBe(4);
    expect(by("Sub-ledger")).toBe(6);
    expect(by("Schedule-supported")).toBeGreaterThanOrEqual(8);
    expect(by("Tax account")).toBeGreaterThanOrEqual(2);
    expect(by("Intercompany")).toBe(6);
    expect(by("Customer statement")).toBe(15);
    expect(by("Vendor statement")).toBe(6);
    expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);
    expect(RECON_TYPES).toHaveLength(8);
  });

  it("account-based reconciliations start from the trial balance", () => {
    for (const r of recs.filter((x) => x.gl)) {
      expect(r.booksBalance, r.id).toBe(balanceAt(BALANCES, r.gl!, AS_OF)!.closing);
    }
  });

  it("counterparty reconciliations start from the counterparty's open items", () => {
    for (const r of recs.filter((x) => ["Customer statement", "Vendor statement", "Intercompany"].includes(x.type))) {
      expect(r.booksBalance, r.id).toBe(sum(statementItems(r).map((l) => l.amount)));
    }
  });

  it("every confirmed or applied difference is explained by the items, to the rupee", () => {
    for (const r of recs) {
      const v = effectiveRec(r, undefined, AS_OF);
      if (v.sourceBalance === null || v.unclassified > 0) continue; // unclassified items are the demo's open work
      expect(v.unexplained, r.id).toBe(0);
    }
  });

  it("items reference the preparers and reviewers of the roster, with roles that can sign", () => {
    for (const r of recs) {
      expect(can(PERSON_BY_ID.get(r.preparerId)!.roleId, "sign-preparer"), `${r.id} preparer`).toBe(true);
      expect(can(PERSON_BY_ID.get(r.reviewerId)!.roleId, "sign-reviewer"), `${r.id} reviewer`).toBe(true);
      expect(r.tolerance).toBe(RECON_POLICY.tolerance[r.type]);
    }
  });

  it("every suggested class belongs to the reconciliation's type", () => {
    for (const r of recs) {
      for (const i of r.items) {
        if (i.suggestedClass) expect(RECON_CLASSES[r.type].some((c) => c.id === i.suggestedClass), `${r.id} ${i.id}`).toBe(true);
      }
    }
  });
});

describe("planted scenarios", () => {
  it("S-19 bank reconciling items link to their ledger lines", () => {
    const hdfc = REC_BY_ID.get("REC-BNK-181100")!;
    const deposits = hdfc.items.filter((i) => i.suggestedClass === "deposit-in-transit");
    expect(deposits.map((i) => i.amount).sort((a, b) => a - b)).toEqual([6_85_300, 14_20_500, 22_40_000]);
    expect(deposits.every((i) => i.lineKey && WORLD.anchors["S-19"].includes(i.lineKey))).toBe(true);
    const icici = REC_BY_ID.get("REC-BNK-181200")!;
    const payments = icici.items.filter((i) => i.suggestedClass === "unpresented-payment");
    expect(payments.map((i) => -i.amount).sort((a, b) => a - b)).toEqual([3_18_250, 5_60_000, 9_45_000, 17_92_600]);
    expect(view(icici.id).unexplained).toBe(0);
  });

  it("S-19 leaves one bank receipt unidentified, so HDFC cannot be signed off as it stands", () => {
    const v = view("REC-BNK-181100");
    expect(v.unclassified).toBe(1);
    expect(v.unexplained).toBe(-3_75_000);
    expect(blockers("REC-BNK-181100").some((b) => b.includes("not classified"))).toBe(true);
  });

  it("S-25 direct postings show as items on the control-account reconciliations", () => {
    const ar = REC_BY_ID.get("REC-SUB-140100")!;
    expect(ar.items).toHaveLength(1);
    expect(ar.items[0].amount).toBe(4_87_300);
    expect(WORLD.anchors["S-25"]).toContain(ar.items[0].lineKey);
    expect(LINE_BY_KEY.get(ar.items[0].lineKey!)!.partner).toBeUndefined();
    const ap = REC_BY_ID.get("REC-SUB-210100")!;
    expect(ap.items).toHaveLength(1);
    expect(ap.items[0].amount).toBe(-2_15_900);
    expect(view(ap.id).unclassified).toBe(1);
  });

  const s18Customer = LINE_BY_KEY.get(anchor("S-18"))!.partner!.id;
  const s18 = `REC-CUS-${s18Customer}`;

  it("S-18 starts with the customer's reply received but not applied", () => {
    const r = REC_BY_ID.get(s18)!;
    expect(r.booksBalance).toBe(2_40_00_000);
    expect(r.reply?.balance).toBe(1_96_50_000);
    expect(r.sourceBalance).toBeNull();
    expect(r.confirmation?.status).toBe("reply-received");
  });

  it("S-18 diagnosis finds the four items that explain the ₹43,50,000 difference exactly", () => {
    const lines = WORLD.lines.filter((l) => l.partner?.id === s18Customer && ["140100", "142100"].includes(l.gl));
    const d = diagnoseCustomer({ lines, booksBalance: 2_40_00_000, replyBalance: 1_96_50_000, asOf: AS_OF });
    expect(d.exact).toBe(true);
    expect(d.difference).toBe(43_50_000);
    const by = Object.fromEntries(d.items.map((i) => [i.suggestedClass, i.amount]));
    expect(by).toEqual({ "invoice-not-booked": 23_60_000, "retention-separate": 11_80_000, "tds-not-recognised": 2_00_000, "disputed-deduction": 6_10_000 });
    expect(d.items.find((i) => i.suggestedClass === "tds-not-recognised")!.narration).toContain("2%");
  });

  it("the diagnosis reports when nothing explains the difference", () => {
    const lines = WORLD.lines.filter((l) => l.partner?.id === s18Customer && ["140100", "142100"].includes(l.gl));
    const d = diagnoseCustomer({ lines, booksBalance: 2_40_00_000, replyBalance: 2_00_00_000 + 1, asOf: AS_OF });
    expect(d.exact).toBe(false);
    expect(d.items).toEqual([]);
  });
});

describe("reconciliation workflow", () => {
  beforeEach(() => wf().resetDemo());

  it("applying the S-18 reply sets the source balance and adds the agent's items", () => {
    const s18 = `REC-CUS-${LINE_BY_KEY.get(anchor("S-18"))!.partner!.id}`;
    as("controller");
    expect(wf().applyReply(s18).ok).toBe(false); // the controller does not prepare
    as("ar-specialist");
    const r = wf().applyReply(s18);
    expect(r).toEqual({ ok: true, found: 4, exact: true });
    const v = view(s18);
    expect(v.sourceBalance).toBe(1_96_50_000);
    expect(v.difference).toBe(43_50_000);
    expect(v.unexplained).toBe(0);
    expect(v.items.every((i) => i.origin === "agent" && i.cls)).toBe(true);
    expect(v.confirmation?.status).toBe("counter-statement");
    expect(v.items.filter(needsAction)).toHaveLength(2); // the tax to recognise and the disputed deduction
    expect(blockers(s18)).toEqual(["2 items without a decision or follow-up", "Commentary not saved"]);
    expect(wf().applyReply(s18).ok).toBe(false); // only once
    expect(wf().events.some((e) => e.action === "Difference diagnosed" && e.actorKind === "Agent")).toBe(true);
  });

  it("the tolerance rule blocks sign-off while the unexplained difference is outside it", () => {
    const id = "REC-BNK-181100";
    as("treasury-analyst");
    expect(wf().classifyRecItem(id, "B04", "unidentified-receipt").ok).toBe(true);
    expect(view(id).unexplained).toBe(0);
    // a stray item that nothing in the statement supports pushes it outside the ₹100 tolerance
    expect(wf().addRecItem(id, { side: "books", amount: 10_000, date: AS_OF, narration: "Cheque 004512", classId: "deposit-in-transit" }).ok).toBe(true);
    expect(view(id).unexplained).toBe(-10_000);
    const r = wf().signOff(id, AS_OF, "preparer");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/^Unexplained difference/);
    expect(wf().signOffs[`${id}|${AS_OF}`]?.preparer).toBeUndefined();
  });

  it("an entry for an unidentified receipt flows from proposal to a balanced journal proposal and sign-off", () => {
    const id = "REC-BNK-181100";
    const key = recItemKey(id, "B04");
    as("treasury-analyst");
    expect(wf().classifyRecItem(id, "B04", "unidentified-receipt").ok).toBe(true);
    expect(blockers(id)).toEqual(["1 item without a decision or follow-up", "Commentary not saved"]);

    const item = view(id).items.find((i) => i.id === "B04")!;
    const journal = adjustmentJournal(REC_BY_ID.get(id)!, item, "unidentified-receipt")!;
    expect(journal.lines.map((l) => l.side)).toEqual(["Dr", "Cr"]);
    const proposed = wf().proposeDecision({ itemKey: key, module: "reconciliations", action: "Adjust books", amount: item.amount, justification: "Receipt parked until the remitter is identified", hits: [], rulesVersion: "reconciliations-1", journal });
    expect(proposed.ok).toBe(true);
    expect(blockers(id)).toEqual(["Commentary not saved"]);

    expect(wf().setCommentary(id, AS_OF, "One unidentified NEFT credit parked in incoming payments clearing pending remitter details.", true).ok).toBe(true);
    expect(blockers(id)).toEqual([]);
    expect(wf().signOff(id, AS_OF, "preparer").ok).toBe(true);
    expect(wf().signOff(id, AS_OF, "reviewer").ok).toBe(false); // the preparer's role cannot review
    as("controller");
    expect(wf().signOff(id, AS_OF, "reviewer").ok).toBe(true);
    const so = wf().signOffs[`${id}|${AS_OF}`];
    expect(so.preparer!.personId).toBe("P08");
    expect(so.reviewer!.personId).toBe("P01");

    // the decision goes through the normal approval band and exports as a balanced proposal
    const d = Object.values(wf().decisions)[0];
    expect(d.approvalBandId).toBe("B1");
    expect(wf().approveDecision(d.id).ok).toBe(true);
    as("gl-accountant");
    const exp = wf().exportDecisions([d.id]);
    expect(exp.ok).toBe(true);
    const rows = exportRows([wf().decisions[d.id]], "JVP-TEST", AS_OF);
    expect(rows).toHaveLength(2);
    const dr = sum(rows.filter((r) => r.side === "Dr").map((r) => Number(r.amount)));
    const cr = sum(rows.filter((r) => r.side === "Cr").map((r) => Number(r.amount)));
    expect(dr).toBe(3_75_000);
    expect(cr).toBe(3_75_000);
    expect(rows[0].source).toContain(key);
    expect(rows.every((r) => r.profitCentre)).toBe(true);
  });

  it("reopening a signed reconciliation unlocks it for the preparer", () => {
    const signed = Object.values(seededSignOffs()).find((s) => REC_BY_ID.has(s.gl) && s.reviewer)!;
    as("controller");
    expect(wf().reopen(signed.gl, AS_OF, "").ok).toBe(false);
    expect(wf().reopen(signed.gl, AS_OF, "Statement reissued").ok).toBe(true);
    expect(wf().signOffs[`${signed.gl}|${AS_OF}`]).toMatchObject({ reopened: { reason: "Statement reissued" } });
    expect(wf().events.some((e) => e.action === "Reconciliation reopened")).toBe(true);
  });

  it("accepting suggestions classifies every suggested item with one event", () => {
    const id = "REC-SCH-231100"; // not prepared by the agent at the start
    expect(REC_BY_ID.get(id)!.seedPrepared).toBe(false);
    expect(view(id).unclassified).toBeGreaterThan(0);
    as("gl-accountant");
    const n = view(id).items.filter((i) => !i.cls && i.suggestedClass).length;
    const r = wf().acceptSuggestions(id);
    expect(r).toEqual({ ok: true, count: n });
    expect(view(id).unclassified).toBe(0);
    expect(wf().events.filter((e) => e.action.startsWith("Suggested classes accepted") || e.action === "Reconciling item classified")).toHaveLength(1);
    expect(wf().acceptSuggestions(id).ok).toBe(false);
  });

  it("preparing a reconciliation applies the agent's classes and is logged by the agent", () => {
    const id = "REC-SCH-231100";
    as("gl-accountant");
    const r = wf().prepareRec(id);
    expect(r.ok).toBe(true);
    expect(view(id).prepared).toBe(true);
    expect(view(id).unclassified).toBe(0);
    expect(wf().events.some((e) => e.action === "Reconciliation prepared" && e.actorId === "agent:reconciler")).toBe(true);
    expect(wf().prepareRec(id).ok).toBe(false);
  });

  it("marking a confirmation sent records it once", () => {
    const notSent = recs.find((r) => r.confirmation?.status === "not-sent")!;
    as("ar-specialist");
    expect(wf().markConfirmationSent(notSent.id).ok).toBe(true);
    expect(view(notSent.id).confirmation?.status).toBe("sent");
    expect(wf().markConfirmationSent(notSent.id).ok).toBe(false);
  });
});

describe("seeded history", () => {
  it("signs off only reconciliations that agree with their source and need no action", () => {
    const signed = Object.values(seededSignOffs()).filter((s) => REC_BY_ID.has(s.gl));
    expect(signed.length).toBeGreaterThan(5);
    for (const s of signed) {
      const rec = REC_BY_ID.get(s.gl)!;
      const v = effectiveRec(rec, undefined, AS_OF);
      expect(v.unexplained, rec.id).toBe(0);
      expect(v.items.some(needsAction), rec.id).toBe(false);
      expect(s.preparer!.personId).toBe(rec.preparerId);
      if (s.reviewer) {
        expect(s.reviewer.personId).toBe(rec.reviewerId);
        expect(s.reviewer.at > s.preparer!.at, rec.id).toBe(true);
        if (rec.confirmation?.repliedAt) expect(s.preparer!.at > rec.confirmation.repliedAt, rec.id).toBe(true);
      }
    }
  });

  it("records the reconciler's preparation, confirmations and replies", () => {
    const ev = seededHistory().filter((e) => e.module === "reconciliations");
    expect(ev.some((e) => e.action === "Reconciliation prepared" && e.actorKind === "Agent")).toBe(true);
    expect(ev.some((e) => e.action === "Confirmation requested")).toBe(true);
    expect(ev.some((e) => e.action === "Reply received")).toBe(true);
  });
});

describe("the bridge and ageing of reconciling items", () => {
  const views = () => WORLD.reconciliations.map((r) => effectiveRec(r, undefined, WORLD.asOf));

  it("walks the difference down to exactly the unexplained amount, for every reconciliation", () => {
    let checked = 0;
    for (const v of views()) {
      const b = bridgeOf(v);
      if (v.difference === null) {
        expect(b).toBeUndefined();
        continue;
      }
      checked += 1;
      expect(b!.start).toBe(v.difference);
      expect(b!.residual).toBeCloseTo(v.unexplained!, 2);
      expect(b!.steps.reduce((s, x) => s + x.effect, 0)).toBeCloseTo(v.explained, 2);
      for (const [i, step] of b!.steps.entries()) {
        expect(step.to).toBeCloseTo(step.from - step.effect, 2);
        if (i > 0) expect(step.from).toBeCloseTo(b!.steps[i - 1].to, 2);
      }
      expect(b!.min).toBeLessThanOrEqual(0);
      expect(b!.max).toBeGreaterThanOrEqual(0);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("places every reconciling item in exactly one age bucket", () => {
    const vs = views();
    const slices = itemAgeing(vs);
    expect(slices.reduce((s, x) => s + x.count, 0)).toBe(vs.reduce((s, v) => s + v.items.length, 0));
    expect(slices.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(vs.reduce((s, v) => s + v.items.reduce((t, i) => t + Math.abs(i.amount), 0), 0), 2);
  });
});

describe("overview figures", () => {
  const rows = () => WORLD.reconciliations.map((r) => ({ rec: r, view: effectiveRec(r, undefined, WORLD.asOf), status: "in-review" as const }));

  it("counts every reconciliation once by type and never explains more than the difference", () => {
    const t = typeDifferences(rows(), RECON_TYPES);
    expect(t.reduce((s, x) => s + x.total, 0)).toBe(WORLD.reconciliations.length);
    for (const x of t) {
      expect(x.explained + x.unexplained).toBeCloseTo(x.difference, 2);
      expect(x.unexplained).toBeGreaterThanOrEqual(0);
    }
  });

  it("splits the items between the reconciler and a person without losing any", () => {
    const s = reconcilerSummary(rows());
    expect(s.classified + s.needPerson).toBe(s.items);
    expect(s.byReconciler).toBeLessThanOrEqual(s.classified);
    expect(s.confidence).toBeGreaterThanOrEqual(0);
    expect(s.confidence).toBeLessThanOrEqual(1);
  });

  it("lists every preparer once, with the largest open value first", () => {
    const p = preparerWorkload(rows());
    expect(p.reduce((s, x) => s + x.total, 0)).toBe(WORLD.reconciliations.length);
    expect(new Set(p.map((x) => x.preparerId)).size).toBe(p.length);
    const v = p.map((x) => x.unexplained);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
});

describe("what stands behind the balances", () => {
  it("ties the sub-ledger by partner to the balance per sub-ledger of every sub-ledger reconciliation", () => {
    const subs = WORLD.reconciliations.filter((r) => r.type === "Sub-ledger");
    expect(subs.length).toBeGreaterThan(0);
    for (const r of subs) {
      const v = subLedgerByPartner(r.gl!);
      expect(v.total).toBeCloseTo(r.sourceBalance!, 2);
      expect(v.total + v.direct.total).toBeCloseTo(r.booksBalance, 2);
    }
  });

  it("rolls every supporting schedule account forward from the opening balance to the books", () => {
    const schedules = WORLD.reconciliations.filter((r) => r.type === "Schedule-supported");
    expect(schedules.length).toBeGreaterThan(0);
    for (const r of schedules) {
      const f = rollforward(r.gl!, previousQuarterEnd(WORLD.asOf));
      expect(f.closing).toBeCloseTo(r.booksBalance, 2);
      expect(f.opening + f.added + f.reduced).toBeCloseTo(f.closing, 2);
    }
  });

  it("rolls every balance sheet account forward: additions move the balance away from nil, reductions towards it", () => {
    const prior = previousQuarterEnd(WORLD.asOf);
    for (const g of WORLD.glAccounts.filter((x) => x.nature === "Asset" || x.nature === "Liability")) {
      const f = rollforward(g.gl, prior);
      const quarter = BALANCES.byGl.get(g.gl) ?? [];
      expect(f.opening).toBeCloseTo(quarter.find((b) => b.periodEnd === prior)?.closing ?? 0, 2);
      expect(f.closing).toBeCloseTo(quarter.find((b) => b.periodEnd === WORLD.asOf)?.closing ?? 0, 2);
      expect(f.opening + f.added + f.reduced).toBeCloseTo(f.closing, 2);
      const grow = f.side === "Cr" ? -1 : 1;
      for (const a of f.additions) expect(a.amount * grow).toBeGreaterThanOrEqual(0);
      for (const r of f.reductions) expect(r.amount * grow).toBeLessThan(0);
    }
  });

  it("names depreciation and capitalisation apart, though both arrive as asset documents", () => {
    const prior = previousQuarterEnd(WORLD.asOf);
    expect(rollforward("119300", prior).additions.map((a) => a.label)).toContain("Depreciation");
    expect(rollforward("120200", prior).reductions.map((a) => a.label)).toContain("Capitalisation");
  });
});

describe("GR/IR reconciliation", () => {
  const grir = () => WORLD.reconciliations.filter((r) => r.type === "GR/IR");

  it("covers every GR/IR account and ties the purchase order view to the books", () => {
    expect(grir().map((r) => r.gl).sort()).toEqual(WORLD.glAccounts.filter((g) => g.category === "grir").map((g) => g.gl).sort());
    for (const r of grir()) {
      const v = grirByPo(r.gl!);
      expect(v.total).toBeCloseTo(r.booksBalance, 2);
      expect(r.sourceBalance! + r.items.reduce((s, i) => s + (i.side === "books" ? i.amount : -i.amount), 0)).toBeCloseTo(r.booksBalance, 2);
    }
  });

  it("explains every difference with a real ledger line, and leaves nothing unexplained", () => {
    for (const r of grir()) {
      const v = effectiveRec(r, undefined, WORLD.asOf);
      expect(v.unexplained).toBeCloseTo(0, 2);
      expect(v.withinTolerance).toBe(true);
      for (const i of r.items) {
        expect(i.lineKey && LINE_BY_KEY.has(i.lineKey)).toBe(true);
        expect(["gr-cutoff", "po-closed-open"]).toContain(i.suggestedClass);
      }
    }
  });

  it("classifies closed-order lines without asking anybody for an entry", () => {
    for (const r of grir()) for (const i of effectiveRec(r, undefined, WORLD.asOf).items) expect(needsAction(i)).toBe(false);
  });
});

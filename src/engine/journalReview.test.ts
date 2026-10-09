import { beforeEach, describe, expect, it } from "vitest";
import { BALANCES, GL_BY_ID, LINE_BY_KEY, LINES_BY_DOC, WORLD, balanceAt } from "@/data";
import { buildProposal } from "@/engine/journals";
import { proposalDecisions } from "@/state/journalHooks";
import { JOURNAL_CHECKS, docByKey, flagsFor, journalDocs, reviewJournals, severityOf, userName, type JournalDoc } from "@/engine/journalReview";
import { provisionMovement, reversalCalendar } from "@/engine/accruals";
import { previousQuarterEnd } from "@/engine/context";
import { seededJournalReviews } from "@/data/workspace/activity";
import { seededHistory } from "@/engine/history";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import type { RoleId } from "@/types";

const AS_OF = WORLD.asOf;
const FROM = previousQuarterEnd(AS_OF);
const docs = journalDocs(FROM, AS_OF);
const flags = reviewJournals(docs, AS_OF);
const docKeyOf = (lineKey: string) => {
  const l = LINE_BY_KEY.get(lineKey)!;
  return `${l.fiscalYear}-${l.docNo}`;
};
const anchorDocs = (id: string) => [...new Set(WORLD.anchors[id].map(docKeyOf))];
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();

/** A manual journal with nothing remarkable about it, for testing one check at a time. */
const plain = (over: Partial<JournalDoc> = {}): JournalDoc => ({
  key: "2026-T1", docNo: "T1", fiscalYear: 2026, docType: "SA", postingDate: "2026-09-10", entryDate: "2026-09-10", entryTime: "11:00", enteredBy: "AMALHOTRA",
  manual: true, sourceSystem: "SAP", lines: [], amount: 2_37_500, ...over,
});

describe("journal checks", () => {
  it("flag only manual journals, and only with checks the library defines", () => {
    expect(flags.size).toBeGreaterThan(20);
    expect(flags.size).toBeLessThan(docs.filter((d) => d.manual).length / 4);
    for (const [key, fs] of flags) {
      expect(docs.find((d) => d.key === key)!.manual).toBe(true);
      for (const f of fs) expect(JOURNAL_CHECKS.some((c) => c.id === f.checkId)).toBe(true);
    }
  });

  it("do not flag a system posted journal even when its amount is round", () => {
    expect(flagsFor(plain({ manual: false, amount: 50_00_000, entryTime: "23:30" }), AS_OF)).toEqual([]);
  });

  it("JNL-01 flags an exact multiple of the rounding unit at or above the floor, and nothing else", () => {
    const ids = (amount: number) => flagsFor(plain({ amount }), AS_OF).map((f) => f.checkId);
    expect(ids(1_00_000)).toEqual(["JNL-01"]);
    expect(ids(25_00_000)).toEqual(["JNL-01"]);
    expect(ids(99_999)).toEqual([]);
    expect(ids(1_50_000)).toEqual([]);
    expect(ids(2_37_500)).toEqual([]);
  });

  it("JNL-01 leaves a reversal to be reviewed with the journal it reverses", () => {
    expect(flagsFor(plain({ amount: 64_00_000, text: "Reversal - accrual 2026-07" }), AS_OF)).toEqual([]);
    expect(flagsFor(plain({ amount: 64_00_000, text: "Accrual - services received not invoiced, 2026-07" }), AS_OF).map((f) => f.checkId)).toEqual(["JNL-01"]);
    const reversals = docs.filter((d) => /^reversal\b/i.test(d.text ?? ""));
    expect(reversals.length).toBeGreaterThan(0);
    expect(reversals.every((d) => !flags.get(d.key)?.some((f) => f.checkId === "JNL-01"))).toBe(true);
  });

  it("JNL-02 flags entries from 22:00 and before 06:00", () => {
    const hit = (t: string) => flagsFor(plain({ entryTime: t }), AS_OF).some((f) => f.checkId === "JNL-02");
    expect(hit("22:00")).toBe(true);
    expect(hit("23:42")).toBe(true);
    expect(hit("05:59")).toBe(true);
    expect(hit("21:59")).toBe(false);
    expect(hit("06:00")).toBe(false);
    expect(hit("11:00")).toBe(false);
  });

  it("JNL-03 flags a journal entered after the period end but posted inside it", () => {
    const hit = (entryDate: string) => flagsFor(plain({ postingDate: AS_OF, entryDate }), AS_OF).some((f) => f.checkId === "JNL-03");
    expect(hit("2026-10-02")).toBe(true);
    expect(hit(AS_OF)).toBe(false);
  });

  it("S-12, the round provision entered at 11:42 PM, is flagged for its amount and its hour", () => {
    const [key] = anchorDocs("S-12");
    const ids = flags.get(key)!.map((f) => f.checkId);
    expect(ids).toEqual(expect.arrayContaining(["JNL-01", "JNL-02"]));
    expect(docByKey(key)!.amount).toBe(25_00_000);
  });

  it("S-14, the posting to an account quiet for 14 months, is flagged as dormant", () => {
    const [key] = anchorDocs("S-14");
    expect(flags.get(key)!.map((f) => f.checkId)).toContain("JNL-05");
  });

  it("S-15, the accrual moved across three accounts, is flagged for an unusual account pair", () => {
    const hits = anchorDocs("S-15").filter((k) => flags.get(k)?.some((f) => f.checkId === "JNL-04"));
    expect(hits.length).toBeGreaterThan(0);
  });

  it("rank a journal by its most severe flag", () => {
    expect(severityOf([{ checkId: "JNL-03", reason: "" }])).toBe("low");
    expect(severityOf([{ checkId: "JNL-03", reason: "" }, { checkId: "JNL-01", reason: "" }])).toBe("medium");
    expect(severityOf([{ checkId: "JNL-01", reason: "" }, { checkId: "JNL-02", reason: "" }])).toBe("high");
  });

  it("group journals by document, with the debits as the amount", () => {
    for (const d of docs.slice(0, 300)) {
      const lines = LINES_BY_DOC.get(d.key)!;
      expect(d.lines).toBe(lines);
      expect(d.amount).toBe(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
      expect(-lines.reduce((s, l) => s + (l.amount < 0 ? l.amount : 0), 0)).toBeCloseTo(d.amount, 2);
    }
  });

  it("name the person behind a ledger user", () => {
    expect(userName("AMALHOTRA")).toBe("Arjun Malhotra");
    expect(userName("AP_SSC01")).toBe("AP_SSC01");
  });
});

describe("seeded journal reviews", () => {
  const seeded = seededJournalReviews();

  it("conclude on part of the flagged journals and leave the rest open", () => {
    const n = Object.keys(seeded).length;
    expect(n).toBeGreaterThan(2);
    expect(n).toBeLessThan(flags.size);
  });

  it("leave the scenario journals for the session", () => {
    for (const id of ["S-12", "S-14", "S-15"]) for (const k of anchorDocs(id)) expect(seeded[k], `${id} ${k}`).toBeUndefined();
  });

  it("are acceptances of flagged journals by someone other than the person who entered them", () => {
    for (const [key, r] of Object.entries(seeded)) {
      expect(flags.has(key)).toBe(true);
      expect(r.outcome).toBe("accepted");
      const person = WORLD.people.find((p) => p.id === r.personId)!;
      expect(person.userId).not.toBe(docByKey(key)!.enteredBy);
      expect(r.note.length).toBeGreaterThan(10);
    }
  });

  it("appear in the seeded history with the reviewer's run after each load", () => {
    const history = seededHistory();
    expect(history.filter((e) => e.action === "Journal accepted").length).toBe(Object.keys(seeded).length);
    const runs = history.filter((e) => e.action === "Journals reviewed");
    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.every((e) => e.actorId === "agent:journal-reviewer" && e.actorKind === "Agent")).toBe(true);
  });
});

describe("review actions", () => {
  beforeEach(() => {
    wf().resetDemo();
    as("controller");
  });
  const [s12] = anchorDocs("S-12");

  it("accepting records the conclusion, the reviewer and an event on the journal's lines", () => {
    const r = wf().reviewJournal(s12, "accepted", "Agrees to the contract schedule");
    expect(r.ok).toBe(true);
    const review = wf().journalReviews[s12];
    expect(review).toMatchObject({ outcome: "accepted", personId: "P01" });
    const ev = wf().events.at(-1)!;
    expect(ev.action).toBe("Journal accepted");
    expect(ev.object).toMatchObject({ type: "journal", id: s12 });
    expect(ev.itemKeys).toEqual(docByKey(s12)!.lines.map((l) => l.key));
  });

  it("needs a note, and cannot accept twice", () => {
    expect(wf().reviewJournal(s12, "accepted", "  ").ok).toBe(false);
    expect(wf().reviewJournal(s12, "accepted", "Checked").ok).toBe(true);
    const again = wf().reviewJournal(s12, "accepted", "Checked again");
    expect(again.ok).toBe(false);
  });

  it("only a reviewer concludes: a preparer and the auditor cannot", () => {
    for (const role of ["gl-accountant", "external-auditor", "controls-lead"] as RoleId[]) {
      as(role);
      const r = wf().reviewJournal(s12, "accepted", "Checked");
      expect(r.ok, role).toBe(false);
    }
    expect(wf().journalReviews[s12]).toBeUndefined();
  });

  it("asking for support raises a follow-up to the preparer, and the journal can be accepted once it is answered", () => {
    const r = wf().reviewJournal(s12, "support-requested", "Send the penalty clause and the delay analysis");
    expect(r.ok).toBe(true);
    const fu = Object.values(wf().followUps).find((f) => f.itemKey === s12)!;
    expect(fu).toMatchObject({ status: "open", module: "journals" });
    expect(fu.owner).toContain("Arjun Malhotra");
    expect(fu.message).toContain("Send the penalty clause");
    expect(wf().reviewJournal(s12, "support-requested", "Again").ok).toBe(false);
    expect(wf().respondFollowUp(fu.id, "Attached").ok).toBe(true);
    expect(wf().reviewJournal(s12, "accepted", "Support received and agrees").ok).toBe(true);
    expect(wf().journalReviews[s12].outcome).toBe("accepted");
  });

  it("a journal that is not manual is not reviewed", () => {
    const system = docs.find((d) => !d.manual)!;
    expect(wf().reviewJournal(system.key, "accepted", "Checked").ok).toBe(false);
  });

  it("reopening needs a reason and a reviewer, and puts the journal back in the queue", () => {
    wf().reviewJournal(s12, "accepted", "Checked");
    expect(wf().reopenJournalReview(s12, "").ok).toBe(false);
    as("gl-accountant");
    expect(wf().reopenJournalReview(s12, "New facts").ok).toBe(false);
    as("controller");
    expect(wf().reopenJournalReview(s12, "New facts").ok).toBe(true);
    expect(wf().journalReviews[s12]).toBeUndefined();
    expect(wf().events.at(-1)!.action).toBe("Journal review reopened");
  });

  it("the journals the seed accepted can be reopened", () => {
    const [key] = Object.keys(seededJournalReviews());
    expect(wf().journalReviews[key].outcome).toBe("accepted");
    expect(wf().reopenJournalReview(key, "Support is incomplete").ok).toBe(true);
  });
});

describe("the proposals outbox", () => {
  beforeEach(() => wf().resetDemo());

  it("collects the entries proposed by every module, and leaves out decisions that make none", () => {
    // a receipt applied in Cash Application
    as("ar-specialist");
    expect(wf().confirmMatch(WORLD.anchors["S-11"][0]).ok).toBe(true);
    // a write-off and a retention in the Balance Sheet Review
    const line = LINE_BY_KEY.get(WORLD.anchors["S-01"][0])!;
    const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(line.gl)!.ownerId)!;
    as(owner.roleId);
    const base = { module: "balance-sheet-review", amount: Math.abs(line.amount), justification: "Lapsed", hits: [], rulesVersion: "t" };
    expect(wf().proposeDecision({ ...base, itemKey: line.key, action: "Write off" }).ok).toBe(true);
    const other = WORLD.anchors["S-02"][0];
    expect(wf().proposeDecision({ ...base, itemKey: other, action: "Retain", amount: 1000 }).ok).toBe(true);

    const list = proposalDecisions(wf().decisions);
    expect(list.map((d) => d.module).sort()).toEqual(["balance-sheet-review", "cash-application"]);
    expect(list.map((d) => d.action).sort()).toEqual(["Apply receipt", "Write off"]);
    expect(list.some((d) => d.action === ("Retain" as string))).toBe(false);
    expect(list.every((d) => buildProposal(d))).toBe(true);
  });

  it("drops a withdrawn proposal", () => {
    const line = LINE_BY_KEY.get(WORLD.anchors["S-01"][0])!;
    const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(line.gl)!.ownerId)!;
    as(owner.roleId);
    const r = wf().proposeDecision({ module: "balance-sheet-review", amount: Math.abs(line.amount), justification: "Lapsed", hits: [], rulesVersion: "t", itemKey: line.key, action: "Write off" });
    expect(proposalDecisions(wf().decisions)).toHaveLength(1);
    if (r.ok) wf().withdrawDecision(r.id);
    expect(proposalDecisions(wf().decisions)).toHaveLength(0);
  });
});

describe("accruals and provisions", () => {
  const rows = provisionMovement(FROM, AS_OF);

  it("roll each account forward from the opening balance to the closing balance", () => {
    expect(rows.length).toBeGreaterThan(3);
    for (const r of rows) expect(r.opening + r.provided + r.utilised + r.reversed, r.gl.gl).toBeCloseTo(r.closing, 2);
  });

  it("close at the trial balance", () => {
    for (const r of rows) expect(balanceAt(BALANCES, r.gl.gl, AS_OF)!.closing, r.gl.gl).toBeCloseTo(r.closing, 2);
  });

  it("open at the balance of the previous quarter end", () => {
    for (const r of rows) expect(balanceAt(BALANCES, r.gl.gl, FROM)!.closing, r.gl.gl).toBeCloseTo(r.opening, 2);
  });

  it("treat credits as provided and debits as utilised or reversed", () => {
    for (const r of rows) {
      expect(r.provided).toBeLessThanOrEqual(0);
      expect(r.utilised).toBeGreaterThanOrEqual(0);
      expect(r.reversed).toBeGreaterThanOrEqual(0);
    }
    expect(rows.some((r) => r.reversed > 0)).toBe(true);
  });

  it("list the September accruals as due for reversal on 1 October, and no earlier month", () => {
    const cal = reversalCalendar(AS_OF);
    expect(cal.map((c) => c.reference)).toEqual(["ACR-2026-09"]);
    expect(cal[0].dueDate).toBe("2026-10-01");
    expect(cal[0].amount).toBeGreaterThan(0);
    expect(cal[0].lines).toBeGreaterThan(0);
  });
});

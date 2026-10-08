import { describe, expect, it } from "vitest";
import { PARTY_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { COLLECTION_POLICY as C } from "@/config/policies";
import { STEP_ORDER, behaviourOf, followUpFor, stepOf, type StepId } from "@/engine/collections";
import { ageOf } from "@/engine/review";
import { openOf } from "@/engine/workingCapital";
import { addDays, daysBetween } from "@/lib/dates";

const receivables = openOf("receivables");
const payables = openOf("payables");
const RETENTION = "142100";
const NO_ACTION: StepId[] = ["not-due", "retention-hold"];
const pastDue = (l: { dueDate?: string }) => (l.dueDate ? daysBetween(l.dueDate, WORLD.asOf) : undefined);
const invoices = receivables.filter((l) => l.gl !== RETENTION && l.amount > 0);

describe("the next step of an open item", () => {
  it("every item has one, and it asks for action unless the item is not due or retention is held", () => {
    for (const side of ["receivables", "payables"] as const) {
      for (const l of openOf(side)) {
        const s = stepOf(side, l);
        expect(STEP_ORDER.some((o) => o.id === s.id), l.key).toBe(true);
        expect(s.action, `${l.key} ${s.id}`).toBe(!NO_ACTION.includes(s.id));
        expect(s.basis.length, l.key).toBeGreaterThan(0);
        expect(s.label.length).toBeGreaterThan(5);
      }
    }
  });

  it("reads an invoice by how far past due it is: reminder, then the payment date, then escalation", () => {
    for (const l of invoices) {
      const s = stepOf("receivables", l);
      const late = pastDue(l) ?? ageOf(l, WORLD.asOf);
      if (ageOf(l, WORLD.asOf) > C.provisionReviewAfterAgeDays) expect([s.id, s.reviewProvision], l.key).toEqual(["escalate", true]);
      else if (late >= C.escalateAfterDaysPastDue) expect([s.id, s.reviewProvision], l.key).toEqual(["escalate", false]);
      else if (late >= C.confirmAfterDaysPastDue) expect(s.id, l.key).toBe("confirm");
      else if (late >= 1) expect(s.id, l.key).toBe("remind");
      else expect(s.id, l.key).toBe("not-due");
    }
    // all four are present in the demo ledger
    const seen = new Set(invoices.map((l) => stepOf("receivables", l).id));
    for (const id of ["not-due", "remind", "confirm", "escalate"] as StepId[]) expect(seen.has(id), id).toBe(true);
  });

  it("a step is more pressing the later the invoice is", () => {
    const rank = (l: (typeof invoices)[number]) => stepOf("receivables", l).urgency;
    const byLate = [...invoices].filter((l) => l.dueDate && ageOf(l, WORLD.asOf) <= 365).sort((a, b) => pastDue(a)! - pastDue(b)!);
    for (let i = 1; i < byLate.length; i += 1) expect(rank(byLate[i]), byLate[i].key).toBeGreaterThanOrEqual(rank(byLate[i - 1]));
  });

  it("asks the customer for a reminder or a payment date, and a manager to escalate", () => {
    const owner = (id: StepId) => stepOf("receivables", invoices.find((l) => stepOf("receivables", l).id === id)!).owner;
    const sample = (id: StepId) => invoices.find((l) => stepOf("receivables", l).id === id)!;
    expect(owner("remind")).toBe(PARTY_BY_ID.get(sample("remind").partner!.id)!.name);
    expect(owner("confirm")).toBe(PARTY_BY_ID.get(sample("confirm").partner!.id)!.name);
    expect(owner("escalate")).toMatch(/^(Project manager, |Sales manager)/);
  });

  it("retention is held until its release, asked about when held long on a project still running, and requested when the defects liability period has ended", () => {
    const retention = receivables.filter((l) => l.gl === RETENTION && l.amount > 0);
    expect(retention.length).toBeGreaterThan(50);
    for (const l of retention) {
      const s = stepOf("receivables", l);
      const project = l.wbs ? PROJECT_BY_WBS.get(l.wbs) : undefined;
      const ended = project && (project.stage === "DLP ended" || project.stage === "Closed" || (project.dlpEnd !== undefined && project.dlpEnd < WORLD.asOf));
      if (ended) expect(s.id, l.key).toBe("retention-release");
      else if (ageOf(l, WORLD.asOf) > C.retentionQueryAfterAgeDays) expect(s.id, l.key).toBe("retention-ask");
      else expect(s.id, l.key).toBe("retention-hold");
    }
    const seen = new Set(retention.map((l) => stepOf("receivables", l).id));
    expect(seen.has("retention-hold")).toBe(true);
    expect(seen.has("retention-ask")).toBe(true);
  });

  it("a retention held 957 days on a project still in execution is a question for its manager, not a dunning letter", () => {
    const l = receivables.find((x) => x.reference === "PA/2024/00009")!;
    expect(l.gl).toBe(RETENTION);
    const s = stepOf("receivables", l);
    expect(s.id).toBe("retention-ask");
    expect(s.owner).toBe("Project manager, Distributed control system - Shivant");
    expect(s.basis.join(" ")).toContain("957 days");
    expect(s.basis.join(" ")).toContain("execution");
  });

  it("a credit on a customer account is applied, and a payable is scheduled once past due", () => {
    const credit = receivables.find((l) => l.amount < 0)!;
    expect(stepOf("receivables", credit).id).toBe("apply-credit");
    for (const l of payables) {
      const s = stepOf("payables", l);
      expect(["pay", "apply-credit", "not-due"]).toContain(s.id);
      if (l.amount > 0) expect(s.id).toBe("apply-credit");
      else if (l.dueDate && l.dueDate < WORLD.asOf) expect(s.id).toBe("pay");
    }
  });

  it("knows how a customer pays from the invoices it has settled", () => {
    const shivant = WORLD.parties.find((p) => p.name === "Shivant Chemicals Ltd")!;
    const b = behaviourOf(shivant.id)!;
    expect(b.invoices).toBeGreaterThanOrEqual(3);
    expect(b.averageDays).toBeGreaterThan(20);
    expect(b.averageDays).toBeLessThan(200);
    expect(behaviourOf("CUST-NOBODY")).toBeUndefined();
  });
});

describe("the follow-up that carries a step out", () => {
  const today = "2026-10-08";

  it("is addressed to the owner of the step, due in the days the policy gives, and says what it asks from the document's own facts", () => {
    for (const id of ["remind", "confirm", "escalate", "retention-ask"] as StepId[]) {
      const l = receivables.find((x) => stepOf("receivables", x).id === id)!;
      const s = stepOf("receivables", l);
      const f = followUpFor("receivables", l, s, today);
      expect([f.itemKey, f.module, f.owner]).toEqual([l.key, "working-capital", s.owner]);
      expect(f.dueDate).toBe(addDays(today, s.dueInDays));
      expect(f.message).toContain(l.reference ?? l.docNo);
      expect(f.message.includes(String.fromCharCode(0x2014))).toBe(false);
      expect(f.message.length).toBeGreaterThan(40);
    }
  });

  it("asks the manager to say whether an invoice over a year old should be provided for", () => {
    const l = invoices.find((x) => ageOf(x, WORLD.asOf) > C.provisionReviewAfterAgeDays)!;
    const f = followUpFor("receivables", l, stepOf("receivables", l), today);
    expect(f.message).toContain("provided for");
  });
});

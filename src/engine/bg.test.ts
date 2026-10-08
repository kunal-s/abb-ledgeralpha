import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { BG_POLICY, bankUse, bgItemKey, bgNoOfKey, countsAgainstLimit, expiryLadder, lifecycle, statusOf, typeByStatus, watchOf } from "@/engine/bg";
import { addDays } from "@/lib/dates";
import type { BankGuarantee } from "@/types";

const asOf = WORLD.asOf;
const bgs = WORLD.bankGuarantees;
const make = (patch: Partial<BankGuarantee>): BankGuarantee => ({ bgNo: "T/BG/1", direction: "Issued", type: "Performance", partyId: "C", bank: "HDFC Bank", amount: 1_00_00_000, issueDate: addDays(asOf, -400), validTo: addDays(asOf, 90), status: "Active", acceptance: "Accepted", ...patch });

describe("the register", () => {
  it("has the planted guarantee expiring in 45 days with acceptance pending, and it is red", () => {
    const bg = bgs.find((b) => b.bgNo === WORLD.anchors["S-20"][0])!;
    expect(bg.acceptance).toBe("Pending");
    const w = watchOf(bg, asOf);
    expect(w.days).toBe(45);
    expect(w.flag).toBe("red");
  });

  it("gives every issued guarantee an acceptance and none to a received one", () => {
    for (const b of bgs) {
      if (b.direction === "Issued") expect(["Pending", "Accepted"]).toContain(b.acceptance);
      else expect(b.acceptance).toBeUndefined();
    }
    expect(bgs.some((b) => b.acceptance === "Pending")).toBe(true);
  });

  it("has a status that agrees with the dates", () => {
    for (const b of bgs) {
      if (b.validTo >= asOf) expect(b.status).toBe("Active");
      else expect(b.status).not.toBe("Active");
    }
  });
});

describe("expiry watch", () => {
  it("is amber inside 60 days, red inside 45 only when acceptance is pending, and nothing once expired or far off", () => {
    expect(watchOf(make({ validTo: addDays(asOf, 60) }), asOf).flag).toBe("amber");
    expect(watchOf(make({ validTo: addDays(asOf, 61) }), asOf).flag).toBe("none");
    expect(watchOf(make({ validTo: addDays(asOf, 45), acceptance: "Accepted" }), asOf).flag).toBe("amber");
    expect(watchOf(make({ validTo: addDays(asOf, 45), acceptance: "Pending" }), asOf).flag).toBe("red");
    expect(watchOf(make({ validTo: addDays(asOf, 46), acceptance: "Pending" }), asOf).flag).toBe("amber");
    expect(watchOf(make({ validTo: addDays(asOf, -3), status: "In claim period" }), asOf).flag).toBe("none");
    expect(BG_POLICY.amberDays).toBe(60);
    expect(BG_POLICY.redDays).toBe(45);
  });

  it("builds a ladder that places each active guarantee in the month its validity ends, once", () => {
    const ladder = expiryLadder(bgs, asOf, 12);
    expect(ladder).toHaveLength(12);
    const inWindow = bgs.filter((b) => b.status === "Active" && b.validTo >= asOf && b.validTo < addDays(ladder[11].month, 31));
    expect(ladder.reduce((s, m) => s + m.count, 0)).toBe(inWindow.length);
    expect(ladder.reduce((s, m) => s + m.value, 0)).toBe(inWindow.reduce((s, b) => s + b.amount, 0));
    for (const m of ladder) expect(m.red + m.amber).toBeLessThanOrEqual(m.value);
  });
});

describe("limits and commission", () => {
  const use = bankUse(bgs);

  it("counts an issued guarantee against its bank's limit until it is released (FR-BGR-01)", () => {
    expect(countsAgainstLimit(make({ status: "Expired - original awaited", validTo: addDays(asOf, -10) }))).toBe(true);
    expect(countsAgainstLimit(make({ status: "In claim period" }))).toBe(true);
    expect(countsAgainstLimit(make({ status: "Released" }))).toBe(false);
    expect(countsAgainstLimit(make({ direction: "Received" }))).toBe(false);
  });

  it("sums what each bank carries, and prices it at the bank's commission", () => {
    expect(use.map((u) => u.bank).sort()).toEqual(Object.keys(S.bankLimits).sort());
    for (const u of use) {
      const mine = bgs.filter((b) => b.bank === u.bank && b.direction === "Issued" && ["Active", "In claim period", "Expired - original awaited"].includes(b.status));
      expect(u.used).toBe(mine.reduce((s, b) => s + b.amount, 0));
      expect(u.commission).toBeCloseTo((u.used * S.bankLimits[u.bank].commissionPct) / 100, 2);
      expect(u.pct).toBeCloseTo(u.used / u.limit, 9);
    }
    expect(use.some((u) => u.used > 0)).toBe(true);
  });

  it("keeps every bank inside its limit in the demo data", () => {
    for (const u of use) expect(u.pct).toBeLessThanOrEqual(1);
  });
});

describe("a person's work on a guarantee", () => {
  it("releases an expired guarantee whose original has come back, and only that one", () => {
    const waiting = make({ status: "Expired - original awaited", validTo: addDays(asOf, -10) });
    expect(statusOf(waiting)).toBe("Expired - original awaited");
    expect(statusOf(waiting, { originalReturned: { at: "2026-10-08T10:00", by: "P08" } })).toBe("Released");
    expect(statusOf(make({ status: "Active" }), { originalReturned: { at: "2026-10-08T10:00", by: "P08" } })).toBe("Active");
    expect(countsAgainstLimit(waiting, { originalReturned: { at: "2026-10-08T10:00", by: "P08" } })).toBe(false);
  });

  it("walks a guarantee through its life by date and status", () => {
    const active = lifecycle(make({}), asOf);
    expect(active.map((s) => s.state)).toEqual(["done", "current", "pending"]);
    const claim = lifecycle(make({ validTo: addDays(asOf, -10), claimExpiry: addDays(asOf, 80), status: "In claim period" }), asOf);
    expect(claim.map((s) => s.state)).toEqual(["done", "done", "current", "pending"]);
    const released = lifecycle(make({ validTo: addDays(asOf, -300), claimExpiry: addDays(asOf, -200), status: "Released" }), asOf);
    expect(released.every((s) => s.state === "done")).toBe(true);
  });

  it("addresses a guarantee as an item and reads it back", () => {
    expect(bgNoOfKey(bgItemKey("SBI/BG/2023/04127"))).toBe("SBI/BG/2023/04127");
  });

  it("totals the matrix of types and statuses to the register", () => {
    const m = typeByStatus(bgs);
    const n = m.types.reduce((s, t) => s + m.statuses.reduce((u, st) => u + m.cell(t, st).count, 0), 0);
    expect(n).toBe(bgs.length);
  });
});

import { beforeEach } from "vitest";
import { modelsAt } from "@/test/models";
import { useRoleStore } from "@/lib/stores";
import { useWorkflow } from "@/state/workflow";
import { statusOf as effectiveStatus } from "@/engine/bg";

describe("requests to the bank, in the workflow", () => {
  const wf = () => useWorkflow.getState();
  beforeEach(() => {
    wf().resetDemo();
    useRoleStore.setState({ role: "treasury-analyst" });
  });

  it("raises a follow-up to the bank, marks the guarantee and logs it", () => {
    const bg = bgs.find((b) => b.bgNo === WORLD.anchors["S-20"][0])!;
    const r = wf().requestBgAction(bg.bgNo, "extension", "Please extend", addDays(asOf, 14));
    expect(r.ok).toBe(true);
    const fu = Object.values(wf().followUps).find((f) => f.itemKey === bgItemKey(bg.bgNo))!;
    expect(fu.module).toBe("bank-guarantees");
    expect(fu.owner).toContain(bg.bank);
    expect(wf().bgWork[bg.bgNo].extensionRequestedAt).toBeTruthy();
    expect(wf().bgWork[bg.bgNo].releaseRequestedAt).toBeUndefined();
    const ev = wf().events.find((e) => e.action === "Extension requested")!;
    expect(ev.object).toMatchObject({ type: "bank-guarantee", id: bg.bgNo });
  });

  it("puts the follow-up in the work queue of the person who raised it, linked to the guarantee", () => {
    const bg = bgs[0];
    wf().requestBgAction(bg.bgNo, "release", "Please release", addDays(asOf, 7));
    const items = modelsAt().work("treasury-analyst").filter((i) => i.kind === "follow-up" && i.link?.startsWith("/bank-guarantees/"));
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe(`/bank-guarantees/${encodeURIComponent(bg.bgNo)}`);
    expect(items[0].itemKey).toBeUndefined();
  });

  it("refuses a role that may not raise follow-ups, an unknown guarantee and an empty message", () => {
    const bg = bgs[0];
    useRoleStore.setState({ role: "external-auditor" });
    expect(wf().requestBgAction(bg.bgNo, "extension", "x", addDays(asOf, 7)).ok).toBe(false);
    useRoleStore.setState({ role: "treasury-analyst" });
    expect(wf().requestBgAction("NOPE/1", "extension", "x", addDays(asOf, 7)).ok).toBe(false);
    expect(wf().requestBgAction(bg.bgNo, "extension", "   ", addDays(asOf, 7)).ok).toBe(false);
    expect(Object.keys(wf().followUps)).toHaveLength(0);
  });

  it("releases a guarantee whose original comes back, once, and not any other", () => {
    const awaited = bgs.find((b) => b.status === "Expired - original awaited")!;
    expect(wf().recordOriginalReturned(awaited.bgNo).ok).toBe(true);
    expect(effectiveStatus(awaited, wf().bgWork[awaited.bgNo])).toBe("Released");
    expect(wf().recordOriginalReturned(awaited.bgNo).ok).toBe(false);
    const active = bgs.find((b) => b.status === "Active")!;
    expect(wf().recordOriginalReturned(active.bgNo).ok).toBe(false);
  });

  it("is forgotten when the demo is reset", () => {
    wf().requestBgAction(bgs[0].bgNo, "extension", "Please extend", addDays(asOf, 14));
    wf().resetDemo();
    expect(wf().bgWork).toEqual({});
  });
});

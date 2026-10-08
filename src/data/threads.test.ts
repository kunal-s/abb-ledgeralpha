import { describe, expect, it } from "vitest";
import { LINE_BY_KEY, REC_BY_ID, WORLD } from "@/data";
import { buildThreads } from "@/data/workspace/threads";
import { resolvePath } from "@/lib/modules";
import { ROLES } from "@/config/roles";

const threads = buildThreads();

describe("story threads", () => {
  it("keeps every step of the first four threads", () => {
    const n = Object.fromEntries(threads.map((t) => [t.id, t.steps.length]));
    expect(n["stale-advance"]).toBe(7);
    expect(n["gl-reconciliation"]).toBe(6);
    expect(n["unapplied-receipt"]).toBe(5);
    expect(n["configure-rule"]).toBe(4);
  });

  it("sends every step to a screen that exists, as a role that exists", () => {
    for (const t of threads) {
      expect(ROLES[t.role]).toBeDefined();
      for (const s of t.steps) {
        const path = s.to.split("?")[0];
        expect(resolvePath(path), `${t.id}: ${s.to}`).toBeDefined();
        if (s.role) expect(ROLES[s.role]).toBeDefined();
        expect(s.title.length).toBeGreaterThan(0);
        expect(s.hint.includes(String.fromCharCode(8212))).toBe(false);
      }
    }
  });

  it("reaches real records through the anchors", () => {
    for (const t of threads) {
      for (const s of t.steps) {
        if (s.item) expect(LINE_BY_KEY.has(s.item), `${t.id}: ${s.item}`).toBe(true);
        const rec = s.to.match(/^\/reconciliations\/(REC-[^/?]+)/);
        if (rec) expect(REC_BY_ID.has(rec[1]), `${t.id}: ${rec[1]}`).toBe(true);
        const receipt = s.to.match(/^\/cash-application\/(.+)$/);
        if (receipt) expect(LINE_BY_KEY.has(receipt[1])).toBe(true);
        const acct = s.to.match(/^\/balance-sheet-review\/(\d{6})/);
        if (acct) expect(WORLD.glAccounts.some((g) => g.gl === acct[1])).toBe(true);
      }
    }
  });

  it("starts every thread on a step and never repeats a title inside one", () => {
    for (const t of threads) {
      expect(t.steps.length).toBeGreaterThan(1);
      expect(new Set(t.steps.map((s) => s.title)).size).toBe(t.steps.length);
    }
  });
});

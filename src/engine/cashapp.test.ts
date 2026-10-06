import { beforeEach, describe, expect, it } from "vitest";
import type { Party } from "@/types";
import { LINE_BY_KEY, PARTY_BY_ID, REC_BY_ID, WORLD } from "@/data";
import { buildCashAppData, openReceipts, unappliedFor } from "@/engine/cashappData";
import { applicationJournal, matchAll, matchReceipt, nameTokensOf, signatureOf, type CashAppData, type InvoiceRef, type Receipt } from "@/engine/cashapp";
import { effectiveRec, documentedItems, signOffBlockers } from "@/engine/recs";
import { exportRows } from "@/engine/journals";
import { CASH_APP_POLICY } from "@/config/policies";
import { computeMatches } from "@/state/cashAppModel";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import type { RoleId } from "@/types";

const AS_OF = WORLD.asOf;
const data = buildCashAppData();
const receipts = openReceipts();
const matches = matchAll(receipts, data);
const anchor = (id: string, i = 0) => WORLD.anchors[id][i];
const as = (role: RoleId) => useRoleStore.setState({ role });
const wf = () => useWorkflow.getState();
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

// ---------------------------------------------------------------------------
// A small synthetic book, to test the matcher's rules one at a time
// ---------------------------------------------------------------------------
function book(customers: Partial<Party>[], invoices: [string, string, number, number?][], usual: Record<string, number> = {}): CashAppData {
  const parties = customers.map((c, i) => ({ id: `C${i + 1}`, type: "Customer", name: `Customer ${i + 1}`, taxIdMasked: `PAN${i + 1}`, status: "Active", country: "IN", ...c }) as Party);
  const byCustomer = new Map<string, InvoiceRef[]>();
  const byRef = new Map<string, InvoiceRef>();
  invoices.forEach(([customerId, date, gross, taxable], n) => {
    const inv: InvoiceRef = { key: `K${n}`, docNo: `D${n}`, reference: `INV/${n}`, customerId, date, gross, taxable: taxable ?? Math.round(gross / 1.18), profitCentre: "PC-X" };
    byCustomer.set(customerId, [...(byCustomer.get(customerId) ?? []), inv]);
    byRef.set(inv.reference, inv);
  });
  return {
    asOf: AS_OF, customers: parties, nameTokens: new Map(parties.map((p) => [p.id, nameTokensOf(p.name)])), invoicesByCustomer: byCustomer, invoiceByRef: byRef,
    entityOf: new Map(parties.map((p) => [p.id, parties.filter((q) => q.taxIdMasked === p.taxIdMasked).map((q) => q.id)])), usualRate: new Map(Object.entries(usual)),
  };
}
const receipt = (amount: number, narration: string, date = "2026-09-20"): Receipt => ({ key: "R1", docNo: "9001", amount, date, narration, utr: "UTR1", profitCentre: "PC-CORP" });

describe("planted receipt scenarios", () => {
  it("invoice references are unique", () => {
    const seen = new Set<string>();
    for (const l of WORLD.lines) {
      if (l.gl !== "140100" || l.docType !== "DR" || l.amount <= 0 || !l.partner || !l.assignment) continue;
      expect(seen.has(l.assignment), l.assignment).toBe(false);
      seen.add(l.assignment);
    }
  });

  it("S-11 has two open invoices the receipt pays, and an unrelated third", () => {
    const [receiptKey] = WORLD.anchors["S-11"];
    const inv = WORLD.anchors["S-11i"].map((k) => LINE_BY_KEY.get(k)!);
    expect(inv.map((l) => l.amount)).toEqual([14_16_000, 9_85_890, 11_80_000]);
    expect(LINE_BY_KEY.get(receiptKey)!.amount).toBe(-23_60_000);
    expect(inv.every((l) => !l.clearing && l.postingDate < LINE_BY_KEY.get(receiptKey)!.postingDate)).toBe(true);
  });

  it("S-11 is matched to the two invoices: TDS 2% on ₹20,35,500 and a standard bank charge, nothing left over", () => {
    const m = matches.get(anchor("S-11"))!;
    const best = m.proposals[0];
    expect(best.level).toBe("L4");
    expect(best.invoices.map((i) => i.key).sort()).toEqual([anchor("S-11i", 0), anchor("S-11i", 1)].sort());
    expect(best.deductions.map((d) => [d.kind, d.amount])).toEqual([["tds", 40_710], ["bank-charges", 1_180]]);
    expect(best.residual).toBe(0);
    expect(best.confidence).toBe(0.8);
    expect(data.usualRate.get(best.customerId)).toBe(0.02);
  });

  it("S-17 is matched to the ₹1,18,00,000 invoice: TDS 1% of ₹1,00,00,000 and ₹14,150 of bank charges, from the name alone", () => {
    const m = matches.get(anchor("S-17"))!;
    expect(m.receipt.narration).not.toMatch(/[A-Z]{2}\/\d{4}\/\d+/);
    const best = m.proposals[0];
    expect(best.level).toBe("L3");
    expect(best.invoices.map((i) => i.key)).toEqual([anchor("S-17", 1)]);
    expect(best.invoices[0].taxable).toBe(1_00_00_000);
    expect(best.deductions.map((d) => [d.kind, d.amount])).toEqual([["tds", 1_00_000], ["small-difference", 14_150]]);
    expect(best.residual).toBe(0);
    expect(best.confidence).toBe(0.7);
    expect(best.customerBasis).toMatch(/customer's name/);
  });
});

describe("matcher", () => {
  it("every proposal adds up: receipt + deductions + unexplained = the invoices", () => {
    let n = 0;
    for (const m of matches.values()) {
      for (const p of m.proposals) {
        n += 1;
        expect(p.receipt + sum(p.deductions.map((d) => d.amount)) + p.residual, `${m.receipt.narration} ${p.signature}`).toBe(p.invoiceTotal);
        expect(p.invoiceTotal).toBe(sum(p.invoices.map((i) => i.gross)));
      }
    }
    expect(n).toBeGreaterThan(40);
  });

  it("confidence is always the sum of the factors that were met", () => {
    for (const m of matches.values()) {
      for (const p of m.proposals) {
        const sumMet = Math.round(sum(p.factors.filter((f) => f.met).map((f) => f.weight)) * 100) / 100;
        // a customer the remittance names less surely carries a 0.10 penalty
        expect([sumMet, Math.round((sumMet - 0.1) * 100) / 100]).toContain(p.confidence);
        expect(p.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1, 5);
      }
    }
  });

  it("no invoice is used by two receipts' best proposals", () => {
    const used = new Map<string, string>();
    for (const m of matches.values()) {
      const best = m.proposals[0];
      if (!best || best.confidence < CASH_APP_POLICY.proposeFrom) continue;
      for (const i of best.invoices) {
        expect(used.has(i.key), `${i.reference} used by ${used.get(i.key)} and ${m.receipt.key}`).toBe(false);
        used.set(i.key, m.receipt.key);
      }
    }
  });

  it("a remittance that cites an invoice is level 1, and every level-1 match cites one", () => {
    for (const m of matches.values()) {
      const best = m.proposals[0];
      if (!best) continue;
      const cites = best.factors[1].met;
      expect(best.level === "L1", m.receipt.narration).toBe(cites);
    }
    expect([...matches.values()].filter((m) => m.proposals[0]?.level === "L1").length).toBeGreaterThan(5);
  });

  it("receipts with no named customer and no reference get no proposal", () => {
    const unknown = receipts.filter((r) => /UNKNOWN REMITTER|IMPS CR TRANSFER|NEFT CR PAYMENT|Cheque deposited/.test(r.narration));
    expect(unknown.length).toBeGreaterThan(5);
    for (const r of unknown) expect(matches.get(r.key)!.proposals).toEqual([]);
  });

  it("matches one invoice paid exactly on customer and amount (L2)", () => {
    const d = book([{ name: "Alpha Steel Ltd" }], [["C1", "2026-08-01", 5_90_000], ["C1", "2026-08-10", 7_08_000]]);
    const p = matchReceipt(receipt(5_90_000, "NEFT CR ALPHA STEEL LTD"), d).proposals[0];
    expect(p.level).toBe("L2");
    expect(p.invoices.map((i) => i.gross)).toEqual([5_90_000]);
    expect(p.deductions).toEqual([]);
    expect(p.confidence).toBe(0.8);
  });

  it("recognises a customer name cut off by the bank, and refuses an ambiguous one", () => {
    const d = book([{ name: "Kesari Metro Rail Corporation" }, { name: "Kesari Chemicals Ltd" }], [["C1", "2026-08-01", 5_90_000], ["C2", "2026-08-02", 5_90_000]]);
    const cut = matchReceipt(receipt(5_90_000, "RTGS CR KESARI METRO RAIL CORPOR"), d);
    expect(cut.proposals[0].customerId).toBe("C1");
    expect(cut.customers[0].score).toBeGreaterThanOrEqual(0.9);
    const first = matchReceipt(receipt(5_90_000, "RTGS CR KESARI"), d);
    expect(first.proposals).toEqual([]);
  });

  it("explains withholding at each standard rate on the taxable value, not the gross", () => {
    for (const rate of CASH_APP_POLICY.tdsRates) {
      const gross = 11_80_000;
      const taxable = 10_00_000;
      const d = book([{ name: "Beta Power Ltd" }], [["C1", "2026-08-01", gross, taxable]]);
      const p = matchReceipt(receipt(gross - Math.round(taxable * rate), "RTGS CR BETA POWER LTD"), d).proposals[0];
      expect(p.deductions.map((x) => x.rate), String(rate)).toEqual([rate]);
      expect(p.deductions[0].amount).toBe(Math.round(taxable * rate));
      expect(p.level).toBe("L3");
    }
  });

  it("infers GST TDS only for government and PSU customers", () => {
    const gross = 23_60_000;
    const taxable = 20_00_000;
    const net = gross - Math.round(taxable * 0.02) - Math.round(taxable * 0.02);
    const psu = book([{ name: "Gamma Water Board", governmentOrPsu: true }], [["C1", "2026-08-01", gross, taxable]]);
    const p = matchReceipt(receipt(net, "RTGS CR GAMMA WATER BOARD"), psu).proposals[0];
    expect(p.deductions.map((d) => d.kind)).toEqual(["tds", "gst-tds"]);
    const private_ = book([{ name: "Gamma Water Board" }], [["C1", "2026-08-01", gross, taxable]]);
    expect(matchReceipt(receipt(net, "RTGS CR GAMMA WATER BOARD"), private_).proposals).toEqual([]);
  });

  it("finds a combination of up to four invoices among dozens, and prefers the fewest", () => {
    const invoices: [string, string, number][] = [];
    for (let i = 0; i < 45; i += 1) invoices.push(["C1", `2026-0${1 + (i % 8)}-${String(1 + (i % 27)).padStart(2, "0")}`, 1_00_000 + ((i * 7919 + 13) % 997) * 1_231 + i * 17]);
    const d = book([{ name: "Delta Rail Ltd" }], invoices);
    const pick = [d.invoicesByCustomer.get("C1")![3], d.invoicesByCustomer.get("C1")![17], d.invoicesByCustomer.get("C1")![30]];
    const total = sum(pick.map((i) => i.gross));
    const p = matchReceipt(receipt(total, "RTGS CR DELTA RAIL LTD"), d).proposals[0];
    // other triples may add up to the same total; the matcher must find one of them and no longer set
    expect(p.invoiceTotal).toBe(total);
    expect(p.invoices).toHaveLength(3);
    expect(p.level).toBe("L4");
    expect(signatureOf(p.invoices)).toBe(p.signature);
  });

  it("pools the invoices of every account that shares a tax ID", () => {
    const d = book([{ name: "Epsilon Metro Ltd", taxIdMasked: "SAMEPAN" }, { name: "Epsilon Metro Projects Ltd", taxIdMasked: "SAMEPAN" }], [["C1", "2026-08-01", 4_00_000], ["C2", "2026-08-05", 3_00_000]]);
    const p = matchReceipt(receipt(7_00_000, "RTGS CR EPSILON METRO LTD"), d).proposals[0];
    expect(p.invoices.map((i) => i.customerId).sort()).toEqual(["C1", "C2"]);
  });

  it("applies the receipt to a cited invoice and leaves a short payment open when nothing explains the gap", () => {
    const d = book([{ name: "Zeta Cement Ltd" }], [["C1", "2026-08-01", 10_00_000]]);
    const p = matchReceipt(receipt(8_50_000, "NEFT CR ZETA INV/0"), d).proposals[0];
    expect(p.level).toBe("L1");
    expect(p.residual).toBeGreaterThan(0);
    expect(p.receipt + sum(p.deductions.map((x) => x.amount)) + p.residual).toBe(p.invoiceTotal);
    expect(p.confidence).toBeLessThan(CASH_APP_POLICY.bulkConfirmFrom);
  });

  it("leaves out invoices dated after the receipt, held by another receipt, or rejected", () => {
    const d = book([{ name: "Eta Power Ltd" }], [["C1", "2026-09-25", 5_00_000], ["C1", "2026-08-01", 5_00_000]]);
    const r = receipt(5_00_000, "NEFT CR ETA POWER LTD", "2026-09-20");
    expect(matchReceipt(r, d).proposals[0].invoices[0].key).toBe("K1"); // the later invoice cannot be paid yet
    expect(matchReceipt(r, d, { reserved: new Map([["K1", "OTHER"]]) }).proposals).toEqual([]);
    const sig = matchReceipt(r, d).proposals[0].signature;
    expect(matchReceipt(r, d, { rejected: new Set([sig]) }).proposals).toEqual([]);
  });

  it("two receipts that want the same invoice: the more confident one keeps it", () => {
    const d = book([{ name: "Theta Ports Trust" }], [["C1", "2026-08-01", 5_00_000], ["C1", "2026-08-02", 6_00_000]]);
    const a: Receipt = { ...receipt(5_00_000, "NEFT CR THETA PORTS TRUST INV/0", "2026-09-18"), key: "A" };
    const b: Receipt = { ...receipt(5_00_000, "NEFT CR THETA PORTS TRUST", "2026-09-19"), key: "B" };
    const all = matchAll([a, b], d);
    expect(all.get("A")!.proposals[0].invoices[0].key).toBe("K0"); // cites it
    expect(all.get("B")!.proposals.find((p) => p.invoices.some((i) => i.key === "K0"))).toBeUndefined();
  });
});

describe("cash application workflow", () => {
  beforeEach(() => wf().resetDemo());
  const s11 = anchor("S-11");

  it("confirming S-11 proposes a balanced clearing entry for approval, and holds the invoices", () => {
    as("controller");
    expect(wf().confirmMatch(s11).ok).toBe(false); // the controller does not apply cash
    as("ar-specialist");
    const r = wf().confirmMatch(s11);
    expect(r.ok).toBe(true);
    const d = Object.values(wf().decisions)[0];
    expect([d.module, d.action, d.itemKey, d.amount]).toEqual(["cash-application", "Apply receipt", s11, -23_60_000]);
    expect(d.approvalBandId).toBe("B2");
    const lines = d.journal!.lines;
    expect(lines.filter((l) => l.side === "Dr").reduce((s, l) => s + l.amount, 0)).toBe(24_01_890);
    expect(lines.filter((l) => l.side === "Cr").reduce((s, l) => s + l.amount, 0)).toBe(24_01_890);
    expect(lines.map((l) => [l.gl, l.side, l.amount])).toEqual([["171200", "Dr", 23_60_000], ["161100", "Dr", 40_710], ["531100", "Dr", 1_180], ["140100", "Cr", 14_16_000], ["140100", "Cr", 9_85_890]]);
    expect(d.journal!.clears).toEqual([s11, anchor("S-11i", 0), anchor("S-11i", 1)]);
    // the invoices are held: no other receipt can use them while the application is live
    const held = computeMatches(wf().decisions, wf().cashApp);
    for (const m of held.values()) if (m.receipt.key !== s11) for (const p of m.proposals) expect(p.invoices.some((i) => d.journal!.clears!.includes(i.key))).toBe(false);
    expect(wf().confirmMatch(s11).ok).toBe(false); // already in progress
  });

  it("an approved application exports as a balanced journal proposal with a clearing instruction", () => {
    as("ar-specialist");
    wf().confirmMatch(s11);
    const d = Object.values(wf().decisions)[0];
    as("controller");
    expect(wf().approveDecision(d.id).ok).toBe(true);
    const rows = exportRows([wf().decisions[d.id]], "JVP-TEST", AS_OF);
    const jv = rows.filter((r) => r.docType === "SA");
    expect(sum(jv.filter((r) => r.side === "Dr").map((r) => Number(r.amount)))).toBe(sum(jv.filter((r) => r.side === "Cr").map((r) => Number(r.amount))));
    const clearing = rows.find((r) => r.docType === "Clearing")!;
    expect(clearing.text).toContain(LINE_BY_KEY.get(s11)!.docNo);
    expect(jv.find((r) => r.gl === "140100")!.text).toContain("MO/2026");
  });

  it("rejecting a match needs a reason and removes it from the proposals", () => {
    as("ar-specialist");
    expect(wf().rejectMatch(s11, "").ok).toBe(false);
    expect(wf().rejectMatch(s11, "The customer says the second invoice is disputed").ok).toBe(true);
    const m = computeMatches(wf().decisions, wf().cashApp).get(s11)!;
    expect(m.proposals.some((p) => p.invoices.length === 2 && p.deductions.length === 2)).toBe(false);
    expect(wf().events.some((e) => e.action === "Match rejected" && e.reason?.includes("disputed"))).toBe(true);
  });

  it("a parked receipt cannot be confirmed until it returns to the queue", () => {
    as("ar-specialist");
    expect(wf().parkReceipt(s11, "").ok).toBe(false);
    expect(wf().parkReceipt(s11, "Customer to confirm the invoices").ok).toBe(true);
    expect(wf().confirmMatch(s11).ok).toBe(false);
    expect(wf().unparkReceipt(s11).ok).toBe(true);
    expect(wf().confirmMatch(s11).ok).toBe(true);
  });

  it("confirming in bulk proposes only the matches at the confidence needed, with one event", () => {
    as("ar-specialist");
    const keys = [...matches.values()].map((m) => m.receipt.key);
    const ready = [...matches.values()].filter((m) => (m.proposals[0]?.confidence ?? 0) >= CASH_APP_POLICY.proposeFrom).length;
    const r = wf().confirmMatches(keys);
    expect(r.ok).toBe(true);
    expect(r.ok && r.created).toBe(ready);
    expect(Object.values(wf().decisions)).toHaveLength(ready);
    expect(wf().events.filter((e) => e.action.startsWith("Decisions proposed"))).toHaveLength(1);
    // every application's invoices are distinct
    const clears = Object.values(wf().decisions).flatMap((d) => d.journal!.clears!);
    expect(new Set(clears).size).toBe(clears.length);
  });

  it("the customer statement reconciliation explains the difference with the waiting receipt, and the application documents it", () => {
    const rec = [...REC_BY_ID.values()].find((r) => r.partyId === LINE_BY_KEY.get(anchor("S-11i"))!.partner!.id && r.type === "Customer statement")!;
    expect(rec.confirmation?.status).toBe("reply-received");
    expect(unappliedFor(rec.partyId!).map((u) => u.key)).toContain(s11);
    as("ar-specialist");
    const applied = wf().applyReply(rec.id);
    expect(applied).toMatchObject({ ok: true, found: 1, exact: true });
    const view = effectiveRec(rec, wf().recs[rec.id], AS_OF);
    expect(view.unexplained).toBe(0);
    const item = view.items[0];
    expect([item.classId, item.lineKey, item.amount]).toEqual(["receipt-unapplied", s11, 24_01_890]);
    const blockers = () => signOffBlockers(effectiveRec(rec, wf().recs[rec.id], AS_OF), true, documentedItems(rec.id, Object.values(wf().decisions), Object.values(wf().followUps), view.items));
    expect(blockers()).toContain("1 item without a decision or follow-up");
    expect(wf().confirmMatch(s11).ok).toBe(true);
    expect(blockers()).not.toContain("1 item without a decision or follow-up");
  });

  it("every customer is known to the data the matcher reads", () => {
    for (const m of matches.values()) for (const c of m.customers) expect(PARTY_BY_ID.has(c.customerId)).toBe(true);
  });
});

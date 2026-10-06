// Reconciliations for the period, derived from the ledger: bank, sub-ledger,
// schedule-supported, tax account, intercompany, customer statement and vendor
// statement. Differences come from the ledger itself (open lines without a
// business partner, retention and short-payment residuals, FX revaluation of
// group balances) plus the planted items (S-18, S-19, S-25); counterparty
// replies are generated so the reconciler agent can explain them.

import type { FxRate, GlAccount, IsoDate, LineItem, Party, ReconItem, Reconciliation, RiskTier } from "@/types";
import { makeRng, type Rng } from "@/data/rng";
import { closingFromLines } from "@/data/balances";
import { isOpenAt } from "@/data/quality";
import { diagnoseCustomer, diagnosisCandidates } from "@/engine/diagnose";
import { RECON_POLICY } from "@/config/policies";
import { addDays, daysBetween, fmtDate } from "@/lib/dates";

interface Input {
  lines: LineItem[];
  gls: GlAccount[];
  parties: Party[];
  fxRates: FxRate[];
  anchors: Record<string, string[]>;
  asOf: IsoDate;
  seed: number;
  fyStartMonth: number;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function generateReconciliations(inp: Input): Reconciliation[] {
  const rng: Rng = makeRng(inp.seed);
  const { asOf } = inp;
  const closing = closingFromLines(inp.lines, inp.gls, asOf, inp.fyStartMonth);
  const bal = (gl: string) => closing.get(gl)?.closing ?? 0;
  const glById = new Map(inp.gls.map((g) => [g.gl, g]));
  const partyById = new Map(inp.parties.map((p) => [p.id, p]));
  const lineByKey = new Map(inp.lines.map((l) => [l.key, l]));
  const openLines = inp.lines.filter((l) => isOpenAt(l, asOf));
  const openByGl = (gl: string) => openLines.filter((l) => l.gl === gl);
  const recs: Reconciliation[] = [];

  const add = (r: Omit<Reconciliation, "frequency" | "tolerance" | "reviewerId" | "dueDate" | "seedPrepared"> & Partial<Pick<Reconciliation, "frequency" | "reviewerId" | "dueDate" | "seedPrepared">>) => {
    recs.push({
      frequency: "Monthly",
      reviewerId: "P01",
      dueDate: "2026-10-12",
      seedPrepared: true,
      tolerance: RECON_POLICY.tolerance[r.type],
      ...r,
    });
  };
  const items = (prefix: string) => {
    let n = 0;
    return (i: Omit<ReconItem, "id">): ReconItem => ({ id: `${prefix}${String(++n).padStart(2, "0")}`, origin: "data", ...i });
  };
  const sourceFrom = (books: number, its: ReconItem[]) => books - sum(its.map((i) => (i.side === "books" ? i.amount : -i.amount)));
  const dayOfMonth = (iso: string) => daysBetween(iso, asOf);

  // ---- Bank -----------------------------------------------------------------
  const s19 = inp.anchors["S-19"].map((k) => lineByKey.get(k)!);
  const bankSpecs: { gl: string; risk: RiskTier }[] = [
    { gl: "181100", risk: "High" }, { gl: "181200", risk: "Medium" }, { gl: "181300", risk: "Medium" }, { gl: "181400", risk: "Low" },
  ];
  for (const { gl, risk } of bankSpecs) {
    const mk = items("B");
    const list: ReconItem[] = s19.filter((l) => l.gl === gl).map((l) =>
      mk({ side: "books", amount: l.amount, date: l.postingDate, reference: l.assignment, narration: l.text ?? "", lineKey: l.key, suggestedClass: l.amount > 0 ? "deposit-in-transit" : "unpresented-payment", confidence: 0.97 })
    );
    if (gl === "181100") list.push(mk({ side: "source", amount: 3_75_000, date: "2026-09-28", reference: "UTR628419", narration: "NEFT CR UNKNOWN REMITTER" }));
    if (gl === "181300") {
      list.push(mk({ side: "source", amount: -2_360, date: "2026-09-30", narration: "Account maintenance and SMS charges", suggestedClass: "bank-charges", confidence: 0.98 }));
      list.push(mk({ side: "source", amount: 1_18_420, date: "2026-09-30", narration: "Interest credited for the quarter", suggestedClass: "bank-interest", confidence: 0.98 }));
    }
    const books = bal(gl);
    const monthLines = inp.lines.filter((l) => l.gl === gl && l.postingDate >= `${asOf.slice(0, 7)}-01` && l.postingDate <= asOf);
    const itemKeys = new Set(list.map((i) => i.lineKey));
    const matched = monthLines.filter((l) => !itemKeys.has(l.key));
    add({
      id: `REC-BNK-${gl}`, type: "Bank", name: glById.get(gl)!.description, gl,
      booksLabel: "Balance per books", sourceLabel: "Balance per bank", sourceDetail: `Bank statement at ${fmtDate(asOf)}`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list,
      riskTier: risk, dueDate: "2026-10-06", preparerId: "P08",
      matched: { count: matched.length, value: sum(matched.map((l) => Math.abs(l.amount))) },
    });
  }

  // ---- Sub-ledger -----------------------------------------------------------------
  const subSpecs: { gl: string; preparer: string; risk: RiskTier }[] = [
    { gl: "140100", preparer: "P06", risk: "High" }, { gl: "140200", preparer: "P06", risk: "Medium" }, { gl: "140300", preparer: "P06", risk: "Low" },
    { gl: "210100", preparer: "P02", risk: "High" }, { gl: "210200", preparer: "P02", risk: "Medium" }, { gl: "210300", preparer: "P02", risk: "Low" },
  ];
  for (const { gl, preparer, risk } of subSpecs) {
    const mk = items("S");
    const direct = openByGl(gl).filter((l) => !l.partner);
    const list = direct.map((l) =>
      mk({ side: "books", amount: l.amount, date: l.postingDate, reference: l.docNo, narration: l.text ?? "Posting without a business partner", lineKey: l.key, suggestedClass: gl.startsWith("14") ? "direct-posting" : undefined, confidence: gl.startsWith("14") ? 0.95 : undefined })
    );
    const books = bal(gl);
    add({
      id: `REC-SUB-${gl}`, type: "Sub-ledger", name: glById.get(gl)!.description, gl,
      booksLabel: "Balance per control account", sourceLabel: "Balance per sub-ledger", sourceDetail: `Sum of open items by business partner at ${fmtDate(asOf)}`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list, riskTier: risk, dueDate: "2026-10-07", preparerId: preparer,
    });
  }

  // ---- Schedule-supported ---------------------------------------------------------------
  const schedules: Record<string, string> = {
    "231100": "warranty claims analysis", "231300": "onerous contracts review", "231400": "actuarial valuation", "231500": "leave register",
    "232100": "accruals tracker", "241700": "payroll statutory register", "261100": "payroll register",
    "110200": "fixed asset register", "110300": "fixed asset register", "130100": "stock ledger", "130200": "work-in-progress report", "130300": "stock ledger",
  };
  for (const [gl, schedule] of Object.entries(schedules)) {
    const books = bal(gl);
    if (Math.abs(books) < 1) continue;
    const g = glById.get(gl)!;
    const mk = items("C");
    const list: ReconItem[] = [];
    const roll = rng.next();
    const n = roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2;
    const sign = books < 0 ? -1 : 1;
    for (let k = 0; k < n; k += 1) {
      const amount = sign * Math.round((Math.abs(books) * rng.range(0.0004, 0.006)) / 100) * 100;
      const date = addDays(asOf, -rng.int(1, 14));
      if (rng.chance(0.6)) {
        list.push(mk({ side: "source", amount, date, narration: `September movement recorded in the ${schedule}, journal not yet posted`, suggestedClass: "journal-not-posted", confidence: 0.9 }));
      } else {
        const recent = inp.lines.filter((l) => l.gl === gl && l.manual && l.postingDate > addDays(asOf, -20));
        const ref = recent[0];
        list.push(mk({ side: "books", amount: ref ? ref.amount : amount, date: ref ? ref.postingDate : date, narration: ref?.text ?? `Posting of ${fmtDate(date)} not yet reflected in the ${schedule}`, lineKey: ref?.key, suggestedClass: "schedule-not-updated", confidence: 0.88 }));
      }
    }
    // one estimate difference the agent cannot classify
    if (gl === "231300" && list.length > 0) list[0] = { ...list[0], suggestedClass: undefined, confidence: undefined };
    add({
      id: `REC-SCH-${gl}`, type: "Schedule-supported", name: g.description, gl,
      booksLabel: "Balance per books", sourceLabel: `Balance per ${schedule}`, sourceDetail: `Supporting schedule at ${fmtDate(asOf)}`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list, riskTier: g.riskTier,
      frequency: "Quarterly", dueDate: "2026-10-12", preparerId: g.ownerId, reviewerId: g.reviewerId, seedPrepared: rng.chance(0.85),
    });
  }

  // ---- Tax account -------------------------------------------------------------------------
  for (const gl of ["241100", "241200", "241300"]) {
    const books = bal(gl);
    if (Math.abs(books) < 1) continue;
    const mk = items("T");
    const month = openByGl(gl).filter((l) => l.postingDate >= `${asOf.slice(0, 7)}-01` && l.amount < 0);
    const list: ReconItem[] = month.length
      ? [mk({ side: "books", amount: sum(month.map((l) => l.amount)), date: month[month.length - 1].postingDate, reference: month[0].assignment, narration: `September deduction of ${glById.get(gl)!.description.toLowerCase()}, deposit due 07-Oct`, lineKey: month[0].key, suggestedClass: "deposit-due", confidence: 0.96 })]
      : [];
    add({
      id: `REC-TAX-${gl}`, type: "Tax account", name: glById.get(gl)!.description, gl,
      booksLabel: "Balance per books", sourceLabel: "Balance per challan register", sourceDetail: `Deposits made and returns filed at ${fmtDate(asOf)}; deductions awaiting deposit are timing items`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list, riskTier: "Medium", dueDate: "2026-10-09", preparerId: "P09",
    });
  }

  // ---- Intercompany ----------------------------------------------------------------------------
  const groupGls = new Set(["140300", "164100", "210300", "251100"]);
  const rate = (cur: string) => inp.fxRates.find((r) => r.currency === cur && r.periodEnd === asOf)?.closing ?? 1;
  const groups = inp.parties.filter((p) => p.type === "Group company");
  groups.forEach((gc, idx) => {
    const own = openLines.filter((l) => groupGls.has(l.gl) && l.partner?.id === gc.id);
    if (!own.length) return;
    const mk = items("I");
    const books = sum(own.map((l) => l.amount));
    const list: ReconItem[] = [];
    const foreign = own.filter((l) => l.docCurrency !== "INR");
    const fx = Math.round(sum(foreign.map((l) => l.amountDoc * rate(l.docCurrency))) - sum(foreign.map((l) => l.amount)));
    if (Math.abs(fx) >= 1) list.push(mk({ side: "source", amount: fx, date: asOf, narration: `Balances in ${gc.currency} revalued at the closing rate ${rate(gc.currency!).toFixed(2)}`, suggestedClass: "ic-fx", confidence: 0.99 }));
    const transit = [...own].reverse().find((l) => l.manual && dayOfMonth(l.postingDate) <= 12);
    if (transit && idx % 2 === 0) list.push(mk({ side: "books", amount: transit.amount, date: transit.postingDate, reference: transit.docNo, narration: transit.text ?? "Cross-charge booked on our side only", lineKey: transit.key, suggestedClass: "ic-in-transit", confidence: 0.93 }));
    if (idx === 1 || idx === 4) list.push(mk({ side: "source", amount: -rng.money(5_40_000, 0.4, 2_00_000, 12_00_000), date: addDays(asOf, -rng.int(3, 12)), narration: `Royalty charge booked by ${gc.name}, not yet recorded`, suggestedClass: "ic-missing-booking", confidence: 0.86 }));
    add({
      id: `REC-IC-${gc.id}`, type: "Intercompany", name: gc.name, partyId: gc.id,
      booksLabel: "Balance per books", sourceLabel: "Balance per counterparty confirmation", sourceDetail: `Confirmation from ${gc.name}, translated at the closing rate`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list, riskTier: "Medium", frequency: "Quarterly", dueDate: "2026-10-12", preparerId: "P04",
      confirmation: { status: "confirmed", sentAt: "2026-10-01T09:30", repliedAt: addDays(asOf, 3 + (idx % 3)) + "T11:00", contact: `Finance, ${gc.name}` },
    });
  });

  // ---- Customer statements ------------------------------------------------------------------------
  const customerGls = new Set(["140100", "142100"]);
  const customerLines = new Map<string, LineItem[]>();
  for (const l of inp.lines) {
    if (!customerGls.has(l.gl) || l.partner?.type !== "Customer") continue;
    const list = customerLines.get(l.partner.id) ?? [];
    list.push(l);
    customerLines.set(l.partner.id, list);
  }
  const customerBooks = (id: string) => sum((customerLines.get(id) ?? []).filter((l) => isOpenAt(l, asOf)).map((l) => l.amount));
  const s18Customer = lineByKey.get(inp.anchors["S-18"][0])!.partner!.id;
  // T1: the customer paid two invoices; the receipt waits in clearing and the invoices are still open in our books
  const t1Lines = inp.anchors["S-11i"].slice(0, 2).map((k) => lineByKey.get(k)!);
  const t1Customer = t1Lines[0].partner!.id;
  const t1Settled = sum(t1Lines.map((l) => l.amount));

  type Plan = "agree" | "timing" | "retention" | "both" | "transit" | "sent" | "not-sent" | "s18" | "unapplied";
  interface Facts { id: string; timing?: ReconItem; retention: ReconItem[] }
  const pool: Facts[] = [...customerLines.keys()]
    .filter((id) => id !== s18Customer && id !== t1Customer && (customerLines.get(id) ?? []).filter((l) => isOpenAt(l, asOf)).length >= 3)
    .sort((a, b) => customerBooks(b) - customerBooks(a))
    .slice(0, 60)
    .map((id) => {
      const books = customerBooks(id);
      const cands = diagnosisCandidates({ lines: customerLines.get(id)!, booksBalance: books, replyBalance: books, asOf });
      return {
        id,
        timing: cands.find((c) => c.suggestedClass === "invoice-not-booked"),
        retention: cands.filter((c) => c.suggestedClass === "retention-separate"),
      };
    });

  let customerIndex = 0;
  const customerRec = (id: string, plan: Plan, applied: boolean, facts?: Facts) => {
    const index = customerIndex++;
    const customer = partyById.get(id)!;
    const lines = customerLines.get(id)!;
    const books = customerBooks(id);
    const base = { lines, booksBalance: books, asOf };
    let reply: number | null = books;
    if (plan === "timing") reply = books - facts!.timing!.amount;
    else if (plan === "retention") reply = books - sum(facts!.retention.map((r) => r.amount));
    else if (plan === "both") reply = books - facts!.timing!.amount - sum(facts!.retention.map((r) => r.amount));
    else if (plan === "transit") reply = books - Math.round((Math.abs(books) * rng.range(0.03, 0.12)) / 1000) * 1000;
    else if (plan === "s18") reply = 1_96_50_000;
    else if (plan === "unapplied") reply = books - t1Settled;
    else if (plan === "sent" || plan === "not-sent") reply = null;

    const diag = reply !== null && applied ? diagnoseCustomer({ ...base, replyBalance: reply }) : undefined;
    const status = plan === "sent" ? "sent" : plan === "not-sent" ? "not-sent" : applied ? (reply === books ? "confirmed" : "counter-statement") : "reply-received";
    const replied = `${addDays(asOf, 3 + (index % 3))}T10:${String(10 + index * 3).padStart(2, "0")}`;
    add({
      id: `REC-CUS-${id}`, type: "Customer statement", name: customer.name, partyId: id,
      booksLabel: "Balance per our books", sourceLabel: "Balance per customer confirmation", sourceDetail: `Customer statement of account at ${fmtDate(asOf)}`,
      booksBalance: books, sourceBalance: applied ? reply : null, items: diag?.items ?? [],
      riskTier: Math.abs(books) > 5_00_00_000 ? "High" : "Medium", frequency: "Quarterly", dueDate: "2026-10-16", preparerId: index % 2 ? "P07" : "P06",
      seedPrepared: plan !== "not-sent",
      confirmation: {
        status, contact: `Accounts Payable, ${customer.name}`,
        ...(plan === "not-sent" ? {} : { sentAt: "2026-10-01T10:30" }),
        ...(["confirmed", "counter-statement", "reply-received"].includes(status) ? { repliedAt: replied } : {}),
      },
      ...(reply !== null && !applied ? { reply: { balance: reply, receivedAt: replied, via: "Email attachment, parsed by the reconciler" } } : {}),
    });
  };

  // each slot takes the largest customer that has what the scenario needs; constrained slots first
  const fewRetention = (f: Facts) => f.retention.length >= 1 && f.retention.length <= 2;
  const slots: { plan: Plan; applied: boolean; ok: (f: Facts) => boolean }[] = [
    { plan: "both", applied: true, ok: (f) => !!f.timing && fewRetention(f) },
    { plan: "both", applied: false, ok: (f) => !!f.timing && fewRetention(f) },
    { plan: "retention", applied: true, ok: fewRetention },
    { plan: "timing", applied: true, ok: (f) => !!f.timing },
    { plan: "timing", applied: true, ok: (f) => !!f.timing },
    { plan: "timing", applied: false, ok: (f) => !!f.timing },
    { plan: "transit", applied: false, ok: () => true },
    { plan: "sent", applied: false, ok: () => true },
    { plan: "not-sent", applied: false, ok: () => true },
    { plan: "agree", applied: true, ok: () => true },
    { plan: "agree", applied: true, ok: () => true },
    { plan: "agree", applied: true, ok: () => true },
    { plan: "agree", applied: true, ok: () => true },
  ];
  for (const slot of slots) {
    const at = pool.findIndex(slot.ok);
    if (at < 0) continue;
    const [facts] = pool.splice(at, 1);
    customerRec(facts.id, slot.plan, slot.applied, facts);
  }
  customerRec(s18Customer, "s18", false);
  customerRec(t1Customer, "unapplied", false);

  // ---- Vendor statements ----------------------------------------------------------------------------
  const vendorBooks = new Map<string, number>();
  for (const l of openByGl("210100")) if (l.partner?.type === "Vendor") vendorBooks.set(l.partner.id, (vendorBooks.get(l.partner.id) ?? 0) + l.amount);
  const topVendors = [...vendorBooks.entries()].sort((a, b) => a[1] - b[1]).slice(0, 6);
  topVendors.forEach(([id, books], idx) => {
    const vendor = partyById.get(id)!;
    const mk = items("V");
    const list: ReconItem[] = [];
    const amount = Math.max(5_000, Math.round((Math.abs(books) * rng.range(0.01, 0.04)) / 100) * 100);
    if (idx === 3 || idx === 4) list.push(mk({ side: "source", amount: -amount, date: addDays(asOf, -rng.int(2, 9)), reference: `INV/${rng.int(1000, 9999)}`, narration: "Vendor invoice dated in the last days of September, not yet recorded", suggestedClass: "vendor-invoice-not-booked", confidence: 0.9 }));
    if (idx === 5) list.push(mk({ side: "books", amount, date: addDays(asOf, -rng.int(10, 25)), reference: `DN-${rng.int(100, 999)}`, narration: "Debit note raised for rate difference; vendor credit note awaited", suggestedClass: "credit-note-pending", confidence: 0.84 }));
    const status = list.length ? "counter-statement" : "confirmed";
    add({
      id: `REC-VEN-${id}`, type: "Vendor statement", name: vendor.name, partyId: id,
      booksLabel: "Balance per our books", sourceLabel: "Balance per vendor statement", sourceDetail: `Vendor statement of account at ${fmtDate(asOf)}`,
      booksBalance: books, sourceBalance: sourceFrom(books, list), items: list, riskTier: "Medium", frequency: "Quarterly", dueDate: "2026-10-16", preparerId: "P02",
      confirmation: { status, sentAt: "2026-10-01T10:45", repliedAt: `${addDays(asOf, 2 + (idx % 3))}T15:20`, contact: `Accounts Receivable, ${vendor.name}` },
    });
  });

  return recs;
}

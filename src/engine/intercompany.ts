// Intercompany and related parties (docs/FRD.md §6.5, D-64): what is owed
// between the company and its group companies, how it compares with what each
// confirms, and what was transacted by nature (the related-party disclosure of
// Ind AS 24). The nature of a transaction is read from the profit and loss
// line of its document, so the disclosure is the ledger and not a schedule.

import type { IsoDate } from "@/types";
import { LINES_BY_DOC, PARTY_BY_ID, WORLD, isOpenAt } from "@/data";
import { TENANT } from "@/config/tenant";
import { fiscalYearStartDate } from "@/lib/dates";

export interface Nature {
  id: string;
  label: string;
  /** income of the company, or an expense */
  side: "income" | "expense";
}

export const NATURES: Nature[] = [
  { id: "sales", label: "Sale of goods", side: "income" },
  { id: "services-rendered", label: "Services rendered", side: "income" },
  { id: "purchases", label: "Purchase of goods", side: "expense" },
  { id: "royalty", label: "Royalty", side: "expense" },
  { id: "services-received", label: "Services received", side: "expense" },
];

const NATURE_OF_GL: Record<string, string> = { "410400": "sales", "410300": "services-rendered", "510100": "purchases", "530800": "royalty", "530900": "services-received" };

export const GROUP_BALANCE_GLS = ["140300", "164100", "210300", "251100"] as const;

export interface RptRow {
  partnerId: string;
  name: string;
  country: string;
  byNature: Record<string, number>;
  income: number;
  expense: number;
  documents: number;
}

/** Transactions with group companies in the fiscal year to date, by counterparty and nature. */
export function relatedPartyTransactions(asOf: IsoDate = WORLD.asOf): { rows: RptRow[]; totals: Record<string, number> } {
  const from = fiscalYearStartDate(asOf, TENANT.fiscalYear.startMonth);
  const rows = new Map<string, RptRow>();
  for (const lines of LINES_BY_DOC.values()) {
    const g = lines.find((l) => l.partner?.type === "Group company");
    if (!g || g.postingDate < from || g.postingDate > asOf) continue;
    const pl = lines.find((l) => NATURE_OF_GL[l.gl]);
    if (!pl) continue;
    const id = g.partner!.id;
    const p = PARTY_BY_ID.get(id);
    const r = rows.get(id) ?? { partnerId: id, name: p?.name ?? id, country: p?.country ?? "", byNature: {}, income: 0, expense: 0, documents: 0 };
    const nature = NATURES.find((n) => n.id === NATURE_OF_GL[pl.gl])!;
    const amount = Math.abs(pl.amount);
    r.byNature[nature.id] = (r.byNature[nature.id] ?? 0) + amount;
    if (nature.side === "income") r.income += amount;
    else r.expense += amount;
    r.documents += 1;
    rows.set(id, r);
  }
  const list = [...rows.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense));
  const totals: Record<string, number> = {};
  for (const r of list) for (const [k, v] of Object.entries(r.byNature)) totals[k] = (totals[k] ?? 0) + v;
  return { rows: list, totals };
}

export interface IcBalance {
  partnerId: string;
  name: string;
  country: string;
  currency?: string;
  receivable: number;
  payable: number;
  net: number;
  /** open items in a foreign currency, in rupees */
  foreign: number;
  items: number;
}

/** What is owed to and by each group company on the open items of the group accounts. */
export function icBalances(asOf: IsoDate = WORLD.asOf): IcBalance[] {
  const rows = new Map<string, IcBalance>();
  const gls = new Set<string>(GROUP_BALANCE_GLS);
  for (const l of WORLD.lines) {
    if (!gls.has(l.gl) || l.partner?.type !== "Group company" || l.postingDate > asOf || !isOpenAt(l, asOf)) continue;
    const id = l.partner.id;
    const p = PARTY_BY_ID.get(id);
    const r = rows.get(id) ?? { partnerId: id, name: p?.name ?? id, country: p?.country ?? "", currency: p?.currency, receivable: 0, payable: 0, net: 0, foreign: 0, items: 0 };
    if (l.amount > 0) r.receivable += l.amount;
    else r.payable += -l.amount;
    r.net += l.amount;
    if (l.docCurrency !== "INR") r.foreign += Math.abs(l.amount);
    r.items += 1;
    rows.set(id, r);
  }
  return [...rows.values()].sort((a, b) => b.receivable + b.payable - (a.receivable + a.payable));
}

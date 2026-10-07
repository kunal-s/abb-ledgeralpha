// Journal review (docs/FRD.md §6.4): the journals posted in a period, grouped
// from the universal journal, and the deterministic checks the journal reviewer
// applies to manual ones. A flag is a reason to look, never a verdict. Pure
// over the loaded world and the policy.

import type { IsoDate, LineItem } from "@/types";
import { LINES_BY_DOC, WORLD } from "@/data";
import { JOURNAL_REVIEW_POLICY as P } from "@/config/policies";
import { buildContext } from "@/engine/context";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";

export interface JournalDoc {
  /** `${fiscalYear}-${docNo}` */
  key: string;
  docNo: string;
  fiscalYear: number;
  docType: string;
  postingDate: IsoDate;
  entryDate: IsoDate;
  entryTime?: string;
  enteredBy: string;
  manual: boolean;
  text?: string;
  sourceSystem: string;
  lines: LineItem[];
  /** total debits */
  amount: number;
}

export interface JournalCheck {
  id: string;
  name: string;
  /** one line for the tooltip */
  logic: string;
  severity: "low" | "medium" | "high";
}

export const JOURNAL_CHECKS: JournalCheck[] = [
  { id: "JNL-01", name: "Round amount", logic: `A manual journal for an exact multiple of ${fmtINR(P.round.roundTo)}, from ${fmtINR(P.round.minAmount)}. Reversals are reviewed with the journal they reverse`, severity: "medium" },
  { id: "JNL-02", name: "Entered outside working hours", logic: `Entered at or after ${P.afterHours.lateHour}:00 or before ${String(P.afterHours.earlyHour).padStart(2, "0")}:00`, severity: "high" },
  { id: "JNL-03", name: "Entered after the period end", logic: "Posted inside the period but entered after it ended", severity: "low" },
  { id: "JNL-04", name: "Unusual account pair", logic: `A debit and credit pair used ${P.unusualPair.maxSeen} times or fewer in the whole ledger, for ${fmtINR(P.unusualPair.minAmount)} or more`, severity: "medium" },
  { id: "JNL-05", name: "Posting to a dormant account", logic: `The first posting on the account for more than ${P.dormantDays} days`, severity: "low" },
];

export interface JournalFlag {
  checkId: string;
  reason: string;
}

const groupCache = new Map<string, JournalDoc[]>();

/** Journals whose posting date falls in (from, asOf], oldest first. */
export function journalDocs(from: IsoDate, asOf: IsoDate): JournalDoc[] {
  const k = `${from}|${asOf}`;
  const hit = groupCache.get(k);
  if (hit) return hit;
  const out: JournalDoc[] = [];
  for (const [key, lines] of LINES_BY_DOC) {
    const f = lines[0];
    if (f.postingDate <= from || f.postingDate > asOf) continue;
    out.push({
      key, docNo: f.docNo, fiscalYear: f.fiscalYear, docType: f.docType, postingDate: f.postingDate, entryDate: f.entryDate, entryTime: f.entryTime,
      enteredBy: f.enteredBy, manual: lines.some((l) => l.manual), text: lines.find((l) => l.text)?.text, sourceSystem: f.sourceSystem, lines,
      amount: lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0),
    });
  }
  out.sort((a, b) => a.postingDate.localeCompare(b.postingDate) || a.docNo.localeCompare(b.docNo));
  if (groupCache.size > 8) groupCache.delete(groupCache.keys().next().value!);
  groupCache.set(k, out);
  return out;
}

let pairCounts: Map<string, number> | undefined;

/** How often each debit/credit pair of a two-line manual journal appears in the whole ledger. */
function pairHistory(): Map<string, number> {
  if (pairCounts) return pairCounts;
  const m = new Map<string, number>();
  for (const lines of LINES_BY_DOC.values()) {
    if (lines.length !== 2 || !lines.some((l) => l.manual)) continue;
    const dr = lines.find((l) => l.amount > 0);
    const cr = lines.find((l) => l.amount < 0);
    if (!dr || !cr) continue;
    const k = `${dr.gl}|${cr.gl}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  pairCounts = m;
  return m;
}

export const pairOf = (d: JournalDoc): { dr: string; cr: string } | undefined => {
  if (d.lines.length !== 2) return undefined;
  const dr = d.lines.find((l) => l.amount > 0);
  const cr = d.lines.find((l) => l.amount < 0);
  return dr && cr ? { dr: dr.gl, cr: cr.gl } : undefined;
};

/** Flags for one manual journal. */
export function flagsFor(d: JournalDoc, asOf: IsoDate): JournalFlag[] {
  if (!d.manual) return [];
  const out: JournalFlag[] = [];
  // a reversal is reviewed with the journal it reverses, so its mirrored amount is not flagged again
  if (!/^reversal\b/i.test(d.text ?? "") && d.amount >= P.round.minAmount && d.amount % P.round.roundTo === 0) {
    out.push({ checkId: "JNL-01", reason: `Exactly ${fmtINR(d.amount)}, entered by ${userName(d.enteredBy)}` });
  }
  const hour = d.entryTime ? Number(d.entryTime.slice(0, 2)) : 12;
  if (hour >= P.afterHours.lateHour || hour < P.afterHours.earlyHour) {
    out.push({ checkId: "JNL-02", reason: `Entered at ${d.entryTime} on ${fmtDate(d.entryDate)} by ${userName(d.enteredBy)}` });
  }
  if (d.entryDate > asOf && d.postingDate <= asOf) {
    out.push({ checkId: "JNL-03", reason: `Entered ${fmtDate(d.entryDate)}, after the period end, with posting date ${fmtDate(d.postingDate)}` });
  }
  const pair = pairOf(d);
  if (pair && d.amount >= P.unusualPair.minAmount) {
    const seen = pairHistory().get(`${pair.dr}|${pair.cr}`) ?? 0;
    if (seen <= P.unusualPair.maxSeen) out.push({ checkId: "JNL-04", reason: `Debit ${pair.dr} and credit ${pair.cr} used ${seen} time${seen === 1 ? "" : "s"} in the ledger` });
  }
  const dates = buildContext(asOf).glPostingDates;
  for (const l of d.lines) {
    const list = dates.get(l.gl) ?? [];
    let lo = 0;
    let hi = list.length - 1;
    let prev: IsoDate | undefined;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < l.postingDate) {
        prev = list[mid];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (!prev) continue;
    const quiet = daysBetween(prev, l.postingDate);
    if (quiet > P.dormantDays) {
      out.push({ checkId: "JNL-05", reason: `First posting on ${l.gl} in ${quiet} days (previous ${fmtDate(prev)})` });
      break;
    }
  }
  return out;
}

/** The journal reviewer's run over the journals of a period: flags by journal. */
export function reviewJournals(docs: JournalDoc[], asOf: IsoDate): Map<string, JournalFlag[]> {
  const out = new Map<string, JournalFlag[]>();
  for (const d of docs) {
    const f = flagsFor(d, asOf);
    if (f.length) out.set(d.key, f);
  }
  return out;
}

/** Highest severity among a journal's flags. */
export function severityOf(flags: JournalFlag[]): "low" | "medium" | "high" {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return flags.reduce<"low" | "medium" | "high">((s, f) => {
    const c = JOURNAL_CHECKS.find((x) => x.id === f.checkId)?.severity ?? "low";
    return rank[c] > rank[s] ? c : s;
  }, "low");
}

export const docByKey = (key: string): JournalDoc | undefined => {
  const lines = LINES_BY_DOC.get(key);
  if (!lines) return undefined;
  const f = lines[0];
  return {
    key, docNo: f.docNo, fiscalYear: f.fiscalYear, docType: f.docType, postingDate: f.postingDate, entryDate: f.entryDate, entryTime: f.entryTime,
    enteredBy: f.enteredBy, manual: lines.some((l) => l.manual), text: lines.find((l) => l.text)?.text, sourceSystem: f.sourceSystem, lines,
    amount: lines.reduce((s, l) => (l.amount > 0 ? s + l.amount : s), 0),
  };
};

/** The request for support on a flagged journal, drafted from what was flagged. */
export function draftJournalFollowUp(d: JournalDoc, flags: JournalFlag[], preparerName: string): { owner: string; message: string } {
  const what = `journal ${d.docNo} of ${fmtDate(d.postingDate)} for ${fmtINR(d.amount)}${d.text ? ` ("${d.text}")` : ""}`;
  const why = flags.length ? flags.map((f) => f.reason.replace(/\.$/, "")).join("; ") : "it was selected for review";
  return {
    owner: `${preparerName} (preparer)`,
    message: `Please provide the support for ${what}. The journal reviewer flagged it because: ${why}. Share the calculation or approval that supports the amount and the account used.`,
  };
}

/** The person behind a ledger user name; the user name itself when the roster does not hold it. */
export const userName = (userId: string): string => WORLD.people.find((p) => p.userId === userId)?.name ?? userId;

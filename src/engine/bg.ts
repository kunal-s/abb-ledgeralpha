// Bank guarantees (docs/FRD.md §6.9, D-61): what is in force, what is about to
// expire and what each bank has been asked to carry. Validity and the claim
// period are separate dates (FR-BGR-01), and a guarantee issued by a bank
// counts against its limit until it is released, not until it expires.

import type { BankGuarantee, IsoDate } from "@/types";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { daysBetween } from "@/lib/dates";

export const BG_POLICY = { amberDays: 60, redDays: 45 } as const;

export const bgItemKey = (bgNo: string) => `BG::${bgNo}`;
export const isBgItemKey = (key: string) => key.startsWith("BG::");
export const bgNoOfKey = (key: string) => key.slice(4);

/** What a person has done about a guarantee in this session. */
export interface BgWork {
  extensionRequestedAt?: string;
  releaseRequestedAt?: string;
  originalReturned?: { at: string; by: string };
}

export type BgStatus = BankGuarantee["status"];

/** The status once the session's work is applied: an original that came back is released. */
export function statusOf(bg: BankGuarantee, work?: BgWork): BgStatus {
  return work?.originalReturned && bg.status === "Expired - original awaited" ? "Released" : bg.status;
}

export type Flag = "red" | "amber" | "none";

export interface Watch {
  flag: Flag;
  /** days until the guarantee stops being valid; negative once it has */
  days: number;
}

/** Amber from 60 days before the end of validity; red from 45 days when the customer has not yet accepted it. */
export function watchOf(bg: BankGuarantee, asOf: IsoDate, work?: BgWork): Watch {
  const days = daysBetween(asOf, bg.validTo);
  if (statusOf(bg, work) !== "Active" || days < 0) return { flag: "none", days };
  if (days <= BG_POLICY.redDays && bg.acceptance === "Pending") return { flag: "red", days };
  if (days <= BG_POLICY.amberDays) return { flag: "amber", days };
  return { flag: "none", days };
}

/** A guarantee counts against a limit from issue until it is released, whatever its validity date says. */
export const countsAgainstLimit = (bg: BankGuarantee, work?: BgWork) => bg.direction === "Issued" && ["Active", "In claim period", "Expired - original awaited"].includes(statusOf(bg, work));

export interface BankUse {
  bank: string;
  limit: number;
  used: number;
  pct: number;
  count: number;
  /** commission for a year at the current outstanding amount */
  commission: number;
}

export function bankUse(bgs: BankGuarantee[], works: Record<string, BgWork> = {}): BankUse[] {
  return Object.entries(S.bankLimits).map(([bank, cfg]) => {
    const mine = bgs.filter((b) => b.bank === bank && countsAgainstLimit(b, works[b.bgNo]));
    const used = mine.reduce((s, b) => s + b.amount, 0);
    return { bank, limit: cfg.limit, used, pct: cfg.limit ? used / cfg.limit : 0, count: mine.length, commission: (used * cfg.commissionPct) / 100 };
  }).sort((a, b) => b.pct - a.pct);
}

export interface LadderMonth {
  /** first day of the month */
  month: IsoDate;
  count: number;
  value: number;
  red: number;
  amber: number;
}

/** Guarantees by the month their validity ends, for the months ahead. */
export function expiryLadder(bgs: BankGuarantee[], asOf: IsoDate, months = 12, works: Record<string, BgWork> = {}): LadderMonth[] {
  const out: LadderMonth[] = [];
  const [y, m] = asOf.split("-").map(Number);
  for (let k = 0; k < months; k += 1) {
    const d = new Date(y, m - 1 + k, 1);
    out.push({ month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, count: 0, value: 0, red: 0, amber: 0 });
  }
  for (const b of bgs) {
    if (statusOf(b, works[b.bgNo]) !== "Active" || b.validTo < asOf) continue;
    const slot = out.find((o) => o.month.slice(0, 7) === b.validTo.slice(0, 7));
    if (!slot) continue;
    slot.count += 1;
    slot.value += b.amount;
    const w = watchOf(b, asOf, works[b.bgNo]);
    if (w.flag === "red") slot.red += b.amount;
    else if (w.flag === "amber") slot.amber += b.amount;
  }
  return out;
}

export interface Step {
  label: string;
  date?: IsoDate;
  state: "done" | "current" | "pending";
}

/** The guarantee's life as the register knows it: issued, valid, in its claim period, then released or invoked. */
export function lifecycle(bg: BankGuarantee, asOf: IsoDate, work?: BgWork): Step[] {
  const status = statusOf(bg, work);
  const ended = status === "Released" || status === "Invoked";
  const expired = bg.validTo < asOf;
  const steps: Step[] = [
    { label: "Issued", date: bg.issueDate, state: "done" },
    { label: "Valid", date: bg.validTo, state: expired ? "done" : "current" },
  ];
  if (bg.claimExpiry) steps.push({ label: "Claim period", date: bg.claimExpiry, state: ended || bg.claimExpiry < asOf ? "done" : expired ? "current" : "pending" });
  steps.push({
    label: status === "Invoked" ? "Invoked" : status === "Expired - original awaited" ? "Original awaited" : "Released",
    date: work?.originalReturned?.at.slice(0, 10),
    state: ended ? "done" : status === "Expired - original awaited" ? "current" : "pending",
  });
  return steps;
}

export interface Matrix {
  types: string[];
  statuses: BgStatus[];
  cell: (type: string, status: BgStatus) => { count: number; value: number };
}

export function typeByStatus(bgs: BankGuarantee[], works: Record<string, BgWork> = {}): Matrix {
  const types = [...new Set(bgs.map((b) => b.type))];
  const statuses: BgStatus[] = ["Active", "In claim period", "Expired - original awaited", "Released", "Invoked"];
  return {
    types,
    statuses,
    cell: (type, status) => {
      const xs = bgs.filter((b) => b.type === type && statusOf(b, works[b.bgNo]) === status);
      return { count: xs.length, value: xs.reduce((s, b) => s + b.amount, 0) };
    },
  };
}

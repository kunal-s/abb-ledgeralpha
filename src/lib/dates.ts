// Date helpers (docs/FRD.md §7.1). Two calendars can differ:
//  - the company's fiscal year (tenant config: e.g. Jan–Dec, labelled "CY2026",
//    or Apr–Mar, labelled "FY2026-27");
//  - the statutory tax year (India: Apr–Mar), used for withholding-tax credits.
// ISO dates ("2026-09-30") are parsed as calendar dates, never through UTC, so
// ageing does not shift by a day with the machine's timezone.

import type { IsoDate } from "@/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parse "YYYY-MM-DD" into a local-midnight Date. Throws on malformed input. */
export function parseIsoDate(iso: IsoDate): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86_400_000);
}

/** "30-Sep-2026" */
export function fmtDate(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** "06:15" or "23:42" → "6:15 AM" / "11:42 PM" */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Sep 2026" */
export function fmtMonth(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fiscalYearStart(d: Date, startMonth: number): number {
  return d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
}

/**
 * Fiscal year label. A January start reads as a single year ("CY2026");
 * any other start spans two years ("FY2026-27").
 */
export function fiscalYearLabel(iso: IsoDate, startMonth: number, prefix: string): string {
  const d = parseIsoDate(iso);
  const start = fiscalYearStart(d, startMonth);
  if (startMonth === 1) return `${prefix}${start}`;
  return `${prefix}${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Fiscal quarter label: "Q3 CY2026", "Q2 FY2026-27". */
export function fiscalQuarterLabel(iso: IsoDate, startMonth: number, prefix: string): string {
  const d = parseIsoDate(iso);
  const offset = (d.getMonth() + 1 - startMonth + 12) % 12; // months into the fiscal year
  return `Q${Math.floor(offset / 3) + 1} ${fiscalYearLabel(iso, startMonth, prefix)}`;
}

/** The calendar year in which the fiscal year containing `iso` starts (SAP GJAHR for Jan starts). */
export function fiscalYearOf(iso: IsoDate, startMonth: number): number {
  return fiscalYearStart(parseIsoDate(iso), startMonth);
}

/** First day of the fiscal year containing `iso`. */
export function fiscalYearStartDate(iso: IsoDate, startMonth: number): IsoDate {
  return `${fiscalYearOf(iso, startMonth)}-${String(startMonth).padStart(2, "0")}-01`;
}

/** Date → "YYYY-MM-DD" (local calendar date). */
export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Calendar arithmetic: `iso` plus `days` (negative to go back). */
export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Last day of the month containing `iso`. */
export function monthEnd(iso: IsoDate): IsoDate {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Month-ends from the month of `from` to the month of `to`, inclusive. */
export function monthEndsBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  const end = monthEnd(to);
  let cur = monthEnd(from);
  while (cur <= end) {
    out.push(cur);
    cur = monthEnd(addDays(cur, 1));
  }
  return out;
}

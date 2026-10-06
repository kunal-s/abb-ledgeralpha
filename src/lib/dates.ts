// Date helpers (FRD §11.2). Two calendars matter for ABB India:
//  - ABB India's financial year is the calendar year (Jan–Dec), so the review
//    period reads "Q3 CY2026".
//  - Income-tax (TDS, Form 26AS) runs on the Indian FY (Apr–Mar), so a TDS
//    credit reads "FY2026-27 Q2".
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

/** "30-Sep-2026" — DD-MMM-YYYY, the format SAP India users and auditors read. */
export function fmtDate(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** "Q3 CY2026" — ABB India reporting quarter (calendar-year FY). */
export function abbQuarterLabel(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  return `Q${Math.floor(d.getMonth() / 3) + 1} CY${d.getFullYear()}`;
}

/** "FY2026-27 Q2" — Indian income-tax FY quarter (Apr–Mar), used for TDS / 26AS. */
export function indianFyQuarterLabel(iso: IsoDate): string {
  const d = parseIsoDate(iso);
  const month = d.getMonth(); // 0 = Jan
  const fyStart = month >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const quarter = Math.floor(((month + 9) % 12) / 3) + 1; // Apr–Jun = Q1
  return `FY${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")} Q${quarter}`;
}

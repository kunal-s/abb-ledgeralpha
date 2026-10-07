// Working days around a period end (docs/FRD.md §6.3). WD0 is the period end
// (or the last working day on or before it); WD+1 is the first working day
// after it, WD-1 the working day before it. The calendar is the localisation
// pack's: weekends and fixed-date national holidays.

import type { IsoDate } from "@/types";
import { LOCALISATION } from "@/config/localisation";
import { addDays, parseIsoDate } from "@/lib/dates";

export function isWorkingDay(iso: IsoDate): boolean {
  const d = parseIsoDate(iso);
  if ((LOCALISATION.workCalendar.weekend as readonly number[]).includes(d.getDay())) return false;
  return !(LOCALISATION.workCalendar.holidays as readonly string[]).includes(iso.slice(5));
}

/** The working-day number of a date relative to the period end. */
export function wdOf(periodEnd: IsoDate, date: IsoDate): number {
  let n = 0;
  if (date > periodEnd) {
    for (let d = addDays(periodEnd, 1); d <= date; d = addDays(d, 1)) if (isWorkingDay(d)) n += 1;
    return n;
  }
  for (let d = addDays(date, 1); d <= periodEnd; d = addDays(d, 1)) if (isWorkingDay(d)) n -= 1;
  return n;
}

/** The date of working day `wd`: the inverse of `wdOf`. WD0 is the period end, or the working day before it when it is not one. */
export function dateOfWd(periodEnd: IsoDate, wd: number): IsoDate {
  let d = periodEnd;
  while (!isWorkingDay(d)) d = addDays(d, -1);
  if (wd === 0) return d;
  const step = wd > 0 ? 1 : -1;
  let left = Math.abs(wd);
  while (left > 0) {
    d = addDays(d, step);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

/** "WD+4", "WD0", "WD-2" */
export function wdLabel(wd: number): string {
  return wd === 0 ? "WD0" : `WD${wd > 0 ? "+" : "-"}${Math.abs(wd)}`;
}

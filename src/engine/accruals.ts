// Accruals and provisions (docs/FRD.md §6.4): the roll-forward of each
// provision and accrual account over the review period, and the calendar of
// month-end accruals still waiting to be reversed. From the ledger lines.

import type { GlAccount, IsoDate } from "@/types";
import { GL_BY_ID, WORLD } from "@/data";
import { addDays, fmtMonth, monthEnd } from "@/lib/dates";

/** Provisions and accruals, and goods received not invoiced. */
const CATEGORIES = new Set(["provisions", "grir"]);

export interface ProvisionRow {
  gl: GlAccount;
  opening: number;
  /** credits other than reversals: provided or accrued in the period */
  provided: number;
  /** debits other than reversals: utilised or settled */
  utilised: number;
  /** debits that reverse an earlier accrual */
  reversed: number;
  closing: number;
}

const isReversal = (text?: string) => /^reversal\b/i.test(text ?? "");

/** Roll-forward over (prior, asOf]; amounts are signed as the ledger holds them (credit negative). */
export function provisionMovement(prior: IsoDate, asOf: IsoDate): ProvisionRow[] {
  const rows = new Map<string, ProvisionRow>();
  for (const g of WORLD.glAccounts) if (CATEGORIES.has(g.category)) rows.set(g.gl, { gl: g, opening: 0, provided: 0, utilised: 0, reversed: 0, closing: 0 });
  for (const l of WORLD.lines) {
    if (l.postingDate > asOf) break;
    const r = rows.get(l.gl);
    if (!r) continue;
    r.closing += l.amount;
    if (l.postingDate <= prior) r.opening += l.amount;
    else if (l.amount < 0) r.provided += l.amount;
    else if (isReversal(l.text)) r.reversed += l.amount;
    else r.utilised += l.amount;
  }
  return [...rows.values()].filter((r) => r.opening !== 0 || r.closing !== 0 || r.provided !== 0 || r.utilised !== 0 || r.reversed !== 0).sort((a, b) => a.gl.gl.localeCompare(b.gl.gl));
}

export interface ReversalDue {
  /** the accrual's assignment, "ACR-2026-09" */
  reference: string;
  month: string;
  /** amount still to reverse, positive */
  amount: number;
  lines: number;
  profitCentres: number;
  dueDate: IsoDate;
  gl: string;
}

/** Month-end accruals (assignment ACR-YYYY-MM) with no reversal yet; the reversal is due on the first of the next month. */
export function reversalCalendar(asOf: IsoDate): ReversalDue[] {
  const groups = new Map<string, { net: number; lines: number; pcs: Set<string>; gl: string }>();
  for (const l of WORLD.lines) {
    if (l.postingDate > asOf) break;
    if (!l.assignment || !/^ACR-\d{4}-\d{2}$/.test(l.assignment) || !CATEGORIES.has(GL_BY_ID.get(l.gl)?.category ?? "")) continue;
    const g = groups.get(l.assignment) ?? { net: 0, lines: 0, pcs: new Set<string>(), gl: l.gl };
    g.net += l.amount;
    if (l.amount < 0) {
      g.lines += 1;
      g.pcs.add(l.profitCentre);
    }
    groups.set(l.assignment, g);
  }
  const out: ReversalDue[] = [];
  for (const [reference, g] of groups) {
    if (g.net >= 0) continue;
    const month = reference.slice(4);
    out.push({ reference, month, amount: -g.net, lines: g.lines, profitCentres: g.pcs.size, dueDate: addDays(monthEnd(`${month}-01`), 1), gl: g.gl });
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const monthLabel = (month: string) => fmtMonth(`${month}-01`);

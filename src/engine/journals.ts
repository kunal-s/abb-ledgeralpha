// Journal proposals from approved decisions (docs/FRD.md Appendix C). Proposal
// only: nothing here posts anywhere. Clear decisions export as clearing
// instructions; write-back, write-off, provide and reclassify as journal lines.

import type { Decision, GlAccount, IsoDate, LineItem } from "@/types";
import { LINE_BY_KEY, GL_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { ROLES } from "@/config/roles";
import { fmtDate } from "@/lib/dates";

const INCOME_WRITE_BACK = "461500"; // liabilities no longer required written back
const BAD_DEBTS = "531500";
const TAX_EXPENSE = "550100";
const ECL_EXPENSE = "531400";
const ECL_ALLOWANCE = "149100";
const BANK_CHARGES = "531100";

export interface ProposalLine {
  gl: string;
  glDescription: string;
  side: "Dr" | "Cr";
  amount: number;
  profitCentre: string;
  wbs?: string;
  assignment?: string;
  text: string;
}

/** Profit centre for entries that belong to no project or business unit (bank, tax, group). */
const CORPORATE_PC = "PC-CORP";

export interface Proposal {
  decision: Decision;
  /** the ledger line behind the decision; absent for reconciling items, which carry their own journal */
  item?: LineItem;
  kind: "JV" | "CLEARING";
  header: string;
  lines: ProposalLine[];
  /** set when no target account could be determined - the preparer completes it */
  needsTarget: boolean;
}

const line = (gl: string, side: "Dr" | "Cr", amount: number, item: LineItem, text: string): ProposalLine => ({
  gl,
  glDescription: gl ? GL_BY_ID.get(gl)?.description ?? "" : "Target account to be confirmed",
  side,
  amount,
  profitCentre: item.profitCentre,
  wbs: item.wbs,
  assignment: item.assignment ?? item.reference,
  text,
});

/** Account a reclassified item should move to. */
function reclassTarget(item: LineItem, gl: GlAccount): string {
  if (gl.category === "vendor-adv" && item.amount < 0) return "210100";
  if (gl.category === "customer-adv" && item.amount > 0) return "140100";
  if (item.gl === "171400") return BANK_CHARGES;
  if (item.gl === "171200") return "140100";
  return "";
}

function specProposal(d: Decision): Proposal | undefined {
  const j = d.journal;
  if (!j) return undefined;
  return {
    decision: d,
    kind: "JV",
    header: j.header,
    needsTarget: !!j.needsTarget || j.lines.some((l) => !l.gl),
    lines: j.lines.map((l) => ({
      gl: l.gl,
      glDescription: l.gl ? GL_BY_ID.get(l.gl)?.description ?? "" : "Target account to be confirmed",
      side: l.side,
      amount: l.amount,
      profitCentre: l.profitCentre ?? CORPORATE_PC,
      text: l.text,
    })),
  };
}

export function buildProposal(d: Decision): Proposal | undefined {
  if (d.journal) return d.action === "Adjust books" ? specProposal(d) : undefined;
  const item = LINE_BY_KEY.get(d.itemKey);
  if (!item) return undefined;
  const gl = GL_BY_ID.get(item.gl)!;
  const abs = Math.abs(item.amount);
  const reverse = (text: string): ProposalLine => line(item.gl, item.amount < 0 ? "Dr" : "Cr", abs, item, text);
  const ref = item.po ? `PO ${item.po.number}` : item.reference ?? item.docNo;

  switch (d.action) {
    case "Write back":
      return { decision: d, item, kind: "JV", header: `${gl.description} write-back, ${ref}`, needsTarget: false, lines: [reverse(`Write-back of ${ref}`), line(INCOME_WRITE_BACK, "Cr", abs, item, `Write-back of ${ref}`)] };
    case "Write off": {
      const expense = gl.category === "tds-recv" ? TAX_EXPENSE : BAD_DEBTS;
      return { decision: d, item, kind: "JV", header: `${gl.description} write-off, ${ref}`, needsTarget: false, lines: [line(expense, "Dr", abs, item, `Write-off of ${ref}`), reverse(`Write-off of ${ref}`)] };
    }
    case "Provide":
      return { decision: d, item, kind: "JV", header: `Provision against ${gl.description.toLowerCase()}, ${ref}`, needsTarget: false, lines: [line(ECL_EXPENSE, "Dr", abs, item, `Provision for ${ref}`), line(ECL_ALLOWANCE, "Cr", abs, item, `Provision for ${ref}`)] };
    case "Reclassify": {
      const target = reclassTarget(item, gl);
      return { decision: d, item, kind: "JV", header: `Reclassification from ${gl.description.toLowerCase()}, ${ref}`, needsTarget: !target, lines: [reverse(`Reclassified from ${item.gl}`), line(target, item.amount < 0 ? "Cr" : "Dr", abs, item, `Reclassified from ${item.gl}`)] };
    }
    case "Clear":
      return { decision: d, item, kind: "CLEARING", header: `Clear document ${item.docNo} against its counter-item`, needsTarget: false, lines: [] };
    default:
      return undefined; // follow-up and retain decisions produce no journal
  }
}

export interface ExportRow {
  proposalId: string;
  companyCode: string;
  postingDate: IsoDate;
  docType: string;
  header: string;
  lineNo: number;
  gl: string;
  account: string;
  side: string;
  amount: string;
  profitCentre: string;
  wbs: string;
  text: string;
  source: string;
  approvals: string;
}

export const EXPORT_COLUMNS = [
  "Proposal ID", "Company code", "Proposed posting date", "Document type", "Header text", "Line", "GL account", "Account",
  "Dr / Cr", "Amount (INR)", "Profit centre", "WBS", "Assignment / text", "Source", "Approval references",
];

function approvalRefs(d: Decision): string {
  const a = d.approvals.map((x) => `${ROLES[x.roleId].label} ${fmtDate(x.at.slice(0, 10))}`);
  if (d.taxReview) a.push(`Tax ${d.taxReview.outcome} ${fmtDate(d.taxReview.at.slice(0, 10))} by ${PERSON_BY_ID.get(d.taxReview.personId)?.name ?? ""}`);
  return a.join(" · ");
}

export function exportRows(decisions: Decision[], batchId: string, postingDate: IsoDate): ExportRow[] {
  const rows: ExportRow[] = [];
  decisions.forEach((d, i) => {
    const p = buildProposal(d);
    if (!p) return;
    const proposalId = `${batchId}-${String(i + 1).padStart(3, "0")}`;
    const base = { proposalId, companyCode: p.item?.companyCode ?? WORLD.lines[0].companyCode, postingDate, header: p.header, source: `${d.module} · ${d.itemKey}`, approvals: approvalRefs(d) };
    if (p.kind === "CLEARING" && p.item) {
      rows.push({ ...base, docType: "Clearing", lineNo: 1, gl: p.item.gl, account: GL_BY_ID.get(p.item.gl)?.description ?? "", side: "", amount: "", profitCentre: p.item.profitCentre, wbs: p.item.wbs ?? "", text: "Clear against counter-item (see source)" });
      return;
    }
    p.lines.forEach((l, n) =>
      rows.push({ ...base, docType: "SA", lineNo: n + 1, gl: l.gl, account: l.glDescription, side: l.side, amount: l.amount.toFixed(2), profitCentre: l.profitCentre, wbs: l.wbs ?? "", text: l.assignment && !l.text.includes(l.assignment) ? `${l.text} · ${l.assignment}` : l.text })
    );
  });
  return rows;
}

// Line-item fields as the ERP names them (docs/FRD.md §5.3). Shared by Data
// Sources (field mapping) and the item drawer (document fields).

import type { LineItem } from "@/types";
import { GL_BY_ID, PARTY_BY_ID, PROJECT_BY_WBS } from "@/data";
import { fmtDate, fmtTime } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";

export const FIELD_MAP: { field: string; sap: string; value: (l: LineItem) => string }[] = [
  { field: "Company code", sap: "RBUKRS", value: (l) => l.companyCode },
  { field: "GL account", sap: "RACCT", value: (l) => `${l.gl} · ${GL_BY_ID.get(l.gl)?.description ?? ""}` },
  { field: "Fiscal year", sap: "GJAHR", value: (l) => String(l.fiscalYear) },
  { field: "Document number", sap: "BELNR", value: (l) => l.docNo },
  { field: "Line item", sap: "DOCLN", value: (l) => String(l.lineItem) },
  { field: "Document type", sap: "BLART", value: (l) => l.docType },
  { field: "Posting key", sap: "BSCHL", value: (l) => l.postingKey },
  { field: "Posting date", sap: "BUDAT", value: (l) => fmtDate(l.postingDate) },
  { field: "Document date", sap: "BLDAT", value: (l) => fmtDate(l.documentDate) },
  { field: "Due date", sap: "ZFBDT + terms", value: (l) => (l.dueDate ? fmtDate(l.dueDate) : "-") },
  { field: "Entry date and time", sap: "CPUDT / CPUTM", value: (l) => `${fmtDate(l.entryDate)}${l.entryTime ? ` ${fmtTime(l.entryTime)}` : ""}` },
  { field: "Entered by", sap: "USNAM", value: (l) => l.enteredBy },
  { field: "Amount in company-code currency", sap: "HSL", value: (l) => fmtDrCr(l.amount) },
  { field: "Document currency and amount", sap: "RWCUR / WSL", value: (l) => `${l.docCurrency} ${fmtInt(Math.abs(l.amountDoc))}` },
  { field: "Assignment", sap: "ZUONR", value: (l) => l.assignment ?? "-" },
  { field: "Reference", sap: "XBLNR", value: (l) => l.reference ?? "-" },
  { field: "Item text", sap: "SGTXT", value: (l) => l.text ?? "-" },
  { field: "Profit centre", sap: "PRCTR", value: (l) => l.profitCentre },
  { field: "WBS element", sap: "PS_POSID", value: (l) => (l.wbs ? `${l.wbs} · ${PROJECT_BY_WBS.get(l.wbs)?.name ?? ""}` : "-") },
  { field: "Business partner", sap: "KUNNR / LIFNR", value: (l) => (l.partner ? `${l.partner.id} · ${PARTY_BY_ID.get(l.partner.id)?.name ?? ""}` : "-") },
  { field: "Purchase order", sap: "EBELN / EBELP", value: (l) => (l.po ? `${l.po.number} / ${l.po.item}` : "-") },
  { field: "Clearing document", sap: "AUGBL / AUGDT", value: (l) => (l.clearing ? `${l.clearing.docNo} · ${fmtDate(l.clearing.date)}` : "Open") },
  { field: "Source system", sap: "-", value: (l) => l.sourceSystem },
];

// Where the record behind a close task, or a close area, is worked on: the
// module and the filtered view (docs/FRD.md FR-HOM-01, FR-CLS-01).

import type { CloseTaskDef } from "@/types";
import type { CloseArea } from "@/engine/close";

export interface RecordLink {
  to: string;
  label: string;
}

export function taskLink(task: CloseTaskDef): RecordLink | undefined {
  const l = task.link;
  switch (l.kind) {
    case "manual":
      return undefined;
    case "accounts":
      return { to: `/balance-sheet-review?tab=accounts${l.categories.length === 1 ? `&acategory=${l.categories[0]}` : ""}`, label: "Open the accounts" };
    case "recs":
      return { to: `/reconciliations?tab=register${l.types.length === 1 ? `&type=${encodeURIComponent(l.types[0])}` : ""}`, label: "Open the reconciliations" };
    case "flagged-documented":
      return { to: "/balance-sheet-review?tab=exceptions", label: "Open the exceptions" };
    case "journals-reviewed":
      return { to: "/journals?tab=review&jstatus=flagged", label: "Open the flagged journals" };
    case "proposals-exported":
      return { to: "/journals?tab=proposed", label: "Open the journal proposals" };
    case "receipts-handled":
      return { to: "/cash-application?tab=receipts", label: "Open the receipts" };
    case "postings":
      return { to: `/journals?tab=register&jtype=${l.docType}`, label: "Open the postings" };
    case "accruals-posted":
      return { to: "/journals?tab=accruals", label: "Open the accruals" };
    case "pbc":
      return { to: l.ids?.length === 1 ? `/audit-readiness?tab=requests&req=${l.ids[0]}` : "/audit-readiness?tab=requests", label: "Open the requests" };
  }
}

export function areaLink(area: CloseArea["id"]): RecordLink {
  switch (area) {
    case "bsr":
      return { to: "/balance-sheet-review?tab=exceptions", label: "Balance Sheet Review" };
    case "recs":
      return { to: "/reconciliations?tab=register", label: "Reconciliations" };
    case "journals":
      return { to: "/journals?tab=review&jstatus=flagged", label: "Journals" };
    case "cash":
      return { to: "/cash-application?tab=receipts", label: "Cash Application" };
    case "tax":
      return { to: "/tax/withholding?tab=receivable", label: "Withholding Tax" };
  }
}

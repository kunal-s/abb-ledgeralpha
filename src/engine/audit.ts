// Audit readiness (docs/FRD.md §6.17): where each auditor request stands, with
// progress computed from sign-offs for requests that depend on work in the
// platform. Pure: the caller supplies the states it reads.

import type { AccountCategory, AccountReviewStatus, IsoDate, PbcRequest, PbcStatus, PbcWork, ReconType } from "@/types";

export interface AuditInputs {
  accounts: { category: AccountCategory; status: AccountReviewStatus }[];
  recs: { type: ReconType; status: AccountReviewStatus }[];
  /** journals the reviewer flagged, and whether each has a conclusion */
  journals: { reviewed: boolean }[];
}

export interface PbcProgress {
  done: number;
  total: number;
  /** "3 of 4 bank reconciliations signed off" */
  label: string;
}

export function pbcProgress(link: PbcRequest["link"], input: AuditInputs): PbcProgress | undefined {
  if (!link) return undefined;
  if (link.kind === "accounts") {
    const xs = input.accounts.filter((a) => link.categories.includes(a.category));
    const done = xs.filter((a) => a.status === "reviewer-signed").length;
    return { done, total: xs.length, label: `${done} of ${xs.length} account${xs.length === 1 ? "" : "s"} signed off` };
  }
  if (link.kind === "recs") {
    const xs = input.recs.filter((r) => link.types.includes(r.type));
    const done = xs.filter((r) => r.status === "reviewer-signed").length;
    return { done, total: xs.length, label: `${done} of ${xs.length} reconciliation${xs.length === 1 ? "" : "s"} signed off` };
  }
  const total = input.journals.length;
  const done = input.journals.filter((j) => j.reviewed).length;
  return { done, total, label: `${done} of ${total} flagged journal${total === 1 ? "" : "s"} reviewed` };
}

export interface PbcState {
  req: PbcRequest;
  status: PbcStatus;
  ownerId: string;
  evidence?: string;
  note?: string;
  progress?: PbcProgress;
  /** not provided and past its due date */
  overdue: boolean;
  /** what stops it being provided, when something does */
  blocker?: string;
}

export function pbcState(req: PbcRequest, work: PbcWork | undefined, input: AuditInputs, today: IsoDate): PbcState {
  const status = work?.status ?? req.seedStatus;
  const progress = pbcProgress(req.link, input);
  const complete = !progress || progress.total === 0 || progress.done >= progress.total;
  return {
    req,
    status,
    ownerId: work?.ownerId ?? req.ownerId,
    evidence: work?.evidence ?? req.seedEvidence,
    note: work?.note,
    progress,
    overdue: (status === "open" || status === "in-preparation") && req.due < today,
    blocker: status === "closed" || status === "provided" || complete ? undefined : progress!.label,
  };
}

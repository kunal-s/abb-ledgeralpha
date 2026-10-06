// TDS credit position for the screens: the allocation of every deduction against
// the tax credit statement under the Balance Sheet Review's BSR-07 parameters
// (so a change in Rules & Policies shows here too), and the credits expected
// from the receipt applications Cash Application has proposed.

import { useMemo } from "react";
import { PARTY_BY_ID, WORLD } from "@/data";
import { analyseTds, type TdsAnalysis } from "@/engine/tdsAnalysis";
import { checkExpectedCredit, taxQuarterOf, type AllocateParams, type TdsAllocation } from "@/engine/tds";
import { useReview } from "@/state/ReviewContext";
import { useCashApp } from "@/state/cashAppHooks";

export interface TdsParams extends AllocateParams {
  writeOffYears: number;
}

export function useTdsParams(): TdsParams {
  const review = useReview();
  return useMemo(() => {
    const rule = review.run.rules.find((r) => r.id === "BSR-07");
    const v = (key: string, fallback: number) => rule?.params.find((x) => x.key === key)?.value ?? fallback;
    return { statementLagDays: v("statementLagDays", 75), toleranceAmount: v("toleranceAmount", 10), writeOffYears: v("writeOffYears", 3) };
  }, [review.run.rules]);
}

export function useTds(): { analysis: TdsAnalysis; params: TdsParams } {
  const params = useTdsParams();
  const analysis = useMemo(() => analyseTds(WORLD.asOf, params), [params]);
  return { analysis, params };
}

export interface ExpectedCredit {
  receiptKey: string;
  customerId: string;
  customerName: string;
  date: string;
  quarter: string;
  amount: number;
  label: string;
  check: TdsAllocation;
  /** the application is already approved or exported, so the deduction is on its way into the books */
  inProgress: boolean;
}

/** Withholding the matcher inferred from receipts, checked against the statement lines that no booked deduction uses. */
export function useExpectedCredits(): ExpectedCredit[] {
  const { rows } = useCashApp();
  const { analysis, params } = useTds();
  return useMemo(() => {
    const out: ExpectedCredit[] = [];
    for (const r of rows) {
      if (!r.best || r.status === "parked") continue;
      for (const d of r.best.deductions) {
        if (d.kind !== "tds") continue;
        out.push({
          receiptKey: r.key, customerId: r.best.customerId, customerName: PARTY_BY_ID.get(r.best.customerId)?.name ?? r.best.customerId,
          date: r.receipt.date, quarter: taxQuarterOf(r.receipt.date), amount: d.amount, label: d.label,
          check: checkExpectedCredit(r.best.customerId, r.receipt.date, d.amount, analysis.unbooked, PARTY_BY_ID, WORLD.asOf, params),
          inProgress: ["approved", "exported", "closed-in-erp"].includes(r.status),
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, analysis, params]);
}

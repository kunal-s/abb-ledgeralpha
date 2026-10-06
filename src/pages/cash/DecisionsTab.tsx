import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DecisionQueue, type QueueEntry } from "@/components/review/DecisionQueue";
import { useCashApp } from "@/state/cashAppHooks";

/** Applications proposed from receipts in clearing: approve, export as a proposal file. */
export function DecisionsTab() {
  const { rows } = useCashApp();
  const navigate = useNavigate();

  const entries = useMemo(() => {
    const out: QueueEntry[] = [];
    for (const r of rows) {
      if (!r.decision) continue;
      out.push({
        decision: r.decision,
        source: r.customerName ?? "Not identified",
        primary: r.receipt.utr ?? r.receipt.docNo,
        secondary: r.decision.journal?.header,
        open: () => navigate(`/cash-application/${r.key}`),
      });
    }
    return out;
  }, [rows, navigate]);

  return <DecisionQueue title="Applications proposed from receipts" sourceLabel="Customer" itemLabel="Receipt" entries={entries} />;
}

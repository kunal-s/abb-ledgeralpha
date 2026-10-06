import { useMemo } from "react";
import { DecisionQueue, type QueueEntry } from "@/components/review/DecisionQueue";
import { useRecRows } from "@/state/recHooks";
import { useItemDrawer } from "@/state/drawer";
import { recItemKey } from "@/engine/recs";

/** Entries proposed from reconciling items: approve, clear tax review, export as a proposal file. */
export function DecisionsTab() {
  const recRows = useRecRows();
  const open = useItemDrawer((s) => s.open);

  const entries = useMemo(() => {
    const out: QueueEntry[] = [];
    for (const r of recRows) {
      for (const [itemId, decision] of r.decisionByItem) {
        const item = r.view.items.find((i) => i.id === itemId);
        out.push({ decision, source: r.rec.name, primary: item?.reference ?? item?.narration ?? itemId, secondary: item?.cls?.label, open: () => open(recItemKey(r.rec.id, itemId)) });
      }
    }
    return out;
  }, [recRows, open]);

  return <DecisionQueue title="Entries proposed from reconciling items" sourceLabel="Reconciliation" itemLabel="Item" entries={entries} />;
}

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useItemDrawer } from "@/state/drawer";
import { RecItemBody } from "@/components/recon/RecItemDrawer";
import { parseRecItemKey } from "@/engine/recs";

/**
 * The drawer beside a reconciliation: a reconciling item's facts, class, decision and history.
 * A ledger line opens its own screen instead (`/balance-sheet-review/item/:key`).
 */
export function ItemDrawer() {
  const itemKey = useItemDrawer((s) => s.itemKey);
  const close = useItemDrawer((s) => s.close);
  const recItem = itemKey ? parseRecItemKey(itemKey) : undefined;
  return (
    <Sheet open={!!recItem} onOpenChange={(o) => !o && close()}>
      <SheetContent>{recItem && <RecItemBody recId={recItem.recId} itemId={recItem.itemId} />}</SheetContent>
    </Sheet>
  );
}

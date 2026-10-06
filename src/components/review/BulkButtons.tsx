import { Button } from "@/components/ui/button";
import { followUpRows, followable, proposable, proposeRows } from "@/components/review/bulk";
import type { ItemRow } from "@/state/hooks";

interface BulkButtonsProps {
  selected: ItemRow[];
  clear: () => void;
  asOf: string;
  rulesVersion: string;
  /** the module the decisions and follow-ups are raised in; the Balance Sheet Review by default */
  module?: string;
}

/** Bulk follow-up and propose, each showing how many of the selection it applies to. */
export function BulkButtons({ selected, clear, asOf, rulesVersion, module }: BulkButtonsProps) {
  const follow = followable(selected).length;
  const propose = proposable(selected).length;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={follow === 0}
        title={follow === 0 ? "Every selected item already has an open follow-up" : "Drafts a follow-up for each item; nothing is sent"}
        onClick={() => followUpRows(selected, asOf, module) && clear()}
      >
        Request follow-up ({follow})
      </Button>
      <Button
        size="sm"
        className="h-8"
        disabled={propose === 0}
        title={propose === 0 ? "None of the selected items has a recommended action other than follow-up. Filter by suggested action to find items that do." : `Proposes the recommended action for ${propose} item${propose === 1 ? "" : "s"}`}
        onClick={() => proposeRows(selected, rulesVersion, module) && clear()}
      >
        Propose recommended actions ({propose})
      </Button>
    </>
  );
}

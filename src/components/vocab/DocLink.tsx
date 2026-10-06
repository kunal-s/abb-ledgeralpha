import { cn } from "@/lib/utils";
import { useItemDrawer } from "@/state/drawer";

interface DocLinkProps {
  itemKey: string;
  /** shown text; defaults to the document number */
  children: React.ReactNode;
  className?: string;
}

/** A document reference that opens the item drawer (docs/FRD.md Appendix B). */
export function DocLink({ itemKey, children, className }: DocLinkProps) {
  const open = useItemDrawer((s) => s.open);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        open(itemKey);
      }}
      className={cn("font-mono text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      {children}
    </button>
  );
}

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  /** right-aligned controls in the panel header */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** side-by-side lists: the sibling sets the row height and this body scrolls inside the card */
  fit?: boolean;
}

/** Titled card section - the one shared panel header (no per-page variants). */
export function Panel({ title, actions, children, className, bodyClassName, fit }: PanelProps) {
  return (
    <Card className={cn("anim-rise flex flex-col overflow-hidden", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {fit ? (
        <div className="relative min-h-48 flex-1">
          <div className={cn("absolute inset-0 overflow-y-auto p-4", bodyClassName)}>{children}</div>
        </div>
      ) : (
        <div className={cn("flex-1 p-4", bodyClassName)}>{children}</div>
      )}
    </Card>
  );
}

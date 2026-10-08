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
}

/** Titled card section - the one shared panel header (no per-page variants). */
export function Panel({ title, actions, children, className, bodyClassName }: PanelProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

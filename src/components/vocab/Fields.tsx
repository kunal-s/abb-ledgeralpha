import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label / value rows for configuration and detail panels. `compact` narrows the label column for side panels. */
export function Fields({ rows, compact }: { rows: [string, ReactNode][]; compact?: boolean }) {
  return (
    <dl className="divide-y divide-border/70">
      {rows.map(([label, value]) => (
        <div key={label} className={cn("grid grid-cols-1 gap-1 px-4 py-2.5 text-sm sm:gap-4", compact ? "sm:grid-cols-[8rem_1fr]" : "sm:grid-cols-[14rem_1fr]")}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Chips({ items }: { items: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className="rounded-md bg-secondary px-2 py-0.5 text-xs">
          {i}
        </span>
      ))}
    </div>
  );
}

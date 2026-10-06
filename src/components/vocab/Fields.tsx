import type { ReactNode } from "react";

/** Label / value rows for configuration and detail panels. */
export function Fields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border/70">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-1 px-4 py-2.5 text-sm sm:grid-cols-[14rem_1fr] sm:gap-4">
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

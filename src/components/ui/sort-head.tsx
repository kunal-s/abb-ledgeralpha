import { ArrowDown, ArrowUp } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** A table header that sorts its column; choosing the sorted column again reverses the order. */
export function SortHead<K extends string>({ label, k, sort, desc, onSort, className }: { label: string; k: K; sort: K | undefined; desc: boolean; onSort: (k: K) => void; className?: string }) {
  const active = sort === k;
  return (
    <TableHead className={className} aria-sort={active ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide", active ? "text-foreground" : "hover:text-foreground")}>
        {label}
        {active && (desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </TableHead>
  );
}

/** Read and write a sort held in the URL as `key` or `-key` (descending). */
export function parseSort<K extends string>(value: string | null, keys: readonly K[], fallback?: { k: K; desc: boolean }): { k: K | undefined; desc: boolean } {
  if (!value) return fallback ?? { k: undefined, desc: true };
  const desc = value.startsWith("-");
  const k = (desc ? value.slice(1) : value) as K;
  return keys.includes(k) ? { k, desc } : (fallback ?? { k: undefined, desc: true });
}

export const nextSort = <K extends string>(current: { k: K | undefined; desc: boolean }, k: K): string => (current.k === k ? (current.desc ? k : `-${k}`) : `-${k}`);

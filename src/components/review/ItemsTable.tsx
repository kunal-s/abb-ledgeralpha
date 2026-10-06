import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfidenceChip, DocLink, StatusChip } from "@/components/vocab";
import { GL_BY_ID, PARTY_BY_ID } from "@/data";
import { useItemDrawer } from "@/state/drawer";
import type { ItemRow } from "@/state/hooks";
import { BUCKETS } from "@/engine/review";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortKey = "amount" | "age" | "confidence";

interface ItemsTableProps {
  rows: ItemRow[];
  /** show the GL account column (register-wide lists) */
  showAccount?: boolean;
  /** bulk-action buttons for the current selection */
  bulk?: (selected: ItemRow[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  empty?: string;
}

function SortHead({ label, k, sort, onSort, className }: { label: string; k: SortKey; sort: SortKey; onSort: (k: SortKey) => void; className?: string }) {
  return (
    <TableHead className={className}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide", sort === k ? "text-foreground" : "hover:text-foreground")}>
        {label}
        {sort === k && <ArrowDown className="h-3 w-3" />}
      </button>
    </TableHead>
  );
}

/** Paged, sortable item list with row selection and the shared bulk bar. */
export function ItemsTable({ rows, showAccount, bulk, pageSize = 25, empty = "No items match" }: ItemsTableProps) {
  const open = useItemDrawer((s) => s.open);
  const [sort, setSort] = useState<SortKey>("amount");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "amount") list.sort((a, b) => Math.abs(b.item.amount) - Math.abs(a.item.amount));
    else if (sort === "age") list.sort((a, b) => b.age - a.age);
    else list.sort((a, b) => (b.rec?.confidence ?? -1) - (a.rec?.confidence ?? -1));
    return list;
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const chosen = useMemo(() => rows.filter((r) => selected.has(r.key)), [rows, selected]);
  const allOnPage = visible.length > 0 && visible.every((r) => selected.has(r.key));

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const clear = () => setSelected(new Set());

  return (
    <div>
      {bulk && chosen.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.04] px-4 py-2 text-sm">
          <span className="font-medium tnum">{fmtInt(chosen.length)} selected</span>
          {chosen.length < rows.length && (
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSelected(new Set(rows.map((r) => r.key)))}>
              Select all {fmtInt(rows.length)}
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {bulk(chosen, clear)}
            <Button size="sm" variant="ghost" className="h-8" onClick={clear}>
              Clear
            </Button>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {bulk && (
              <TableHead className="w-8 pr-0">
                <input
                  type="checkbox"
                  aria-label="Select this page"
                  checked={allOnPage}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      for (const r of visible) allOnPage ? n.delete(r.key) : n.add(r.key);
                      return n;
                    })
                  }
                />
              </TableHead>
            )}
            <TableHead>Document</TableHead>
            {showAccount && <TableHead>Account</TableHead>}
            <TableHead>Party and text</TableHead>
            <SortHead label="Age" k="age" sort={sort} onSort={setSort} />
            <SortHead label="Amount" k="amount" sort={sort} onSort={setSort} className="text-right" />
            <TableHead>Findings</TableHead>
            <SortHead label="Suggested" k="confidence" sort={sort} onSort={setSort} />
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
          {visible.map((r) => {
            const party = r.item.partner ? PARTY_BY_ID.get(r.item.partner.id) : undefined;
            const bucket = BUCKETS.find((b) => b.id === r.bucket)!;
            return (
              <TableRow key={r.key} className="cursor-pointer" onClick={() => open(r.key)} data-state={selected.has(r.key) ? "selected" : undefined}>
                {bulk && (
                  <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${r.item.docNo}`} checked={selected.has(r.key)} onChange={() => toggle(r.key)} />
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap py-2">
                  <DocLink itemKey={r.key}>{r.item.docNo}</DocLink>
                  <div className="text-2xs text-muted-foreground">
                    {r.item.docType} · {fmtDate(r.item.postingDate)}
                  </div>
                </TableCell>
                {showAccount && (
                  <TableCell className="py-2">
                    <div className="max-w-44 truncate text-xs">{GL_BY_ID.get(r.item.gl)?.description}</div>
                    <div className="font-mono text-2xs text-muted-foreground">{r.item.gl}</div>
                  </TableCell>
                )}
                <TableCell className="max-w-56 py-2">
                  <div className="truncate text-sm">{party?.name ?? r.item.text ?? "-"}</div>
                  {party && r.item.text && <div className="truncate text-2xs text-muted-foreground">{r.item.text}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap py-2">
                  <div className="tnum text-sm">{fmtInt(r.age)} d</div>
                  <div className="text-2xs text-muted-foreground">{bucket.label}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtDrCr(r.item.amount)}</TableCell>
                <TableCell className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {r.hits.slice(0, 2).map((h) => (
                      <span key={h.ruleId} title={h.reason} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-2xs">
                        {h.ruleId}
                      </span>
                    ))}
                    {r.hits.length > 2 && <span className="text-2xs text-muted-foreground">+{r.hits.length - 2}</span>}
                    {r.hits.length === 0 && <span className="text-2xs text-muted-foreground">-</span>}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap py-2">
                  {r.rec ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{r.rec.action}</span>
                      <ConfidenceChip score={r.rec.confidence} showIcon={false} />
                    </div>
                  ) : (
                    <span className="text-2xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <StatusChip status={r.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
        <span className="tnum">
          {rows.length === 0 ? "0 items" : `${fmtInt(page * pageSize + 1)}–${fmtInt(Math.min(rows.length, (page + 1) * pageSize))} of ${fmtInt(rows.length)}`}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="tnum">
            {page + 1} / {pages}
          </span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

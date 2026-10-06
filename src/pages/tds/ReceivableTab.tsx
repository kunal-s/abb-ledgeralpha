import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Panel, StatusChip } from "@/components/vocab";
import { DocLink } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkButtons } from "@/components/review/BulkButtons";
import { TDS_GROUPS, quarterSortKey } from "@/pages/tds/OverviewTab";
import { PARTY_BY_ID, WORLD } from "@/data";
import { rowFor, useReview } from "@/state/ReviewContext";
import type { ItemRow } from "@/state/hooks";
import { useTds } from "@/state/tdsHooks";
import { useItemDrawer } from "@/state/drawer";
import { useQueryParams } from "@/lib/useQueryParams";
import { CREDIT_AGE_BUCKETS, TDS_STATUS_LABELS, creditAgeBucket, type TdsCreditStatus } from "@/engine/tds";
import { downloadCsv } from "@/lib/exportCsv";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const AT_RISK: TdsCreditStatus[] = ["short", "missing", "wrong-quarter"];

export function ReceivableTab() {
  const review = useReview();
  const { analysis } = useTds();
  const open = useItemDrawer((s) => s.open);
  const [params, setParams] = useQueryParams();
  const status = params.get("tstatus") ?? "all";
  const quarter = params.get("tquarter") ?? "all";
  const age = params.get("tage") ?? "all";
  const q = params.get("tq") ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(
    () =>
      analysis.open
        .map((l) => ({ l, a: analysis.byLine.get(l.key), row: rowFor(review, l) as ItemRow }))
        .filter((x): x is { l: (typeof analysis.open)[number]; a: NonNullable<typeof x.a>; row: ItemRow } => !!x.a),
    [analysis, review]
  );
  const quarters = useMemo(() => [...new Set(all.map((x) => x.a.quarter))].sort((a, b) => quarterSortKey(b).localeCompare(quarterSortKey(a))), [all]);
  const shown = useMemo(
    () =>
      all
        .filter(
          (x) =>
            (status === "all" || (status === "at-risk" ? AT_RISK.includes(x.a.status) : x.a.status === status)) &&
            (quarter === "all" || x.a.quarter === quarter) &&
            (age === "all" || creditAgeBucket(x.l.postingDate, WORLD.asOf) === age) &&
            (!q || (PARTY_BY_ID.get(x.l.partner!.id)?.name ?? "").toLowerCase().includes(q.toLowerCase()) || x.l.docNo.includes(q))
        )
        .sort((a, b) => a.l.postingDate.localeCompare(b.l.postingDate)),
    [all, status, quarter, age, q]
  );
  const chosen = shown.filter((x) => selected.has(x.l.key)).map((x) => x.row);

  return (
    <Panel title="Customer deductions in TDS receivable" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={status} onValueChange={(v) => setParams({ tstatus: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statement checks</SelectItem>
            <SelectItem value="at-risk">Short, missing or wrong quarter</SelectItem>
            {TDS_GROUPS.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={quarter} onValueChange={(v) => setParams({ tquarter: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All quarters</SelectItem>
            {quarters.map((x) => (
              <SelectItem key={x} value={x}>
                {x}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={age} onValueChange={(v) => setParams({ tage: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {CREDIT_AGE_BUCKETS.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ tq: e.target.value || null })} placeholder="Customer or document" className="h-8 w-48" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} deductions</span>
        <div className="flex-1" />
        {chosen.length > 0 && <BulkButtons selected={chosen} clear={() => setSelected(new Set())} asOf={review.asOf} rulesVersion={review.run.version} module="withholding-tax" />}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "tds-receivable.csv",
              ["Document", "Customer", "Deductor ID", "Deducted on", "Tax-year quarter", "Amount", "Credited per statement", "Statement check", "Age (days)"],
              shown.map((x) => [x.l.docNo, PARTY_BY_ID.get(x.l.partner!.id)?.name ?? "", PARTY_BY_ID.get(x.l.partner!.id)?.deductorIdMasked ?? "", fmtDate(x.l.postingDate), x.a.quarter, x.l.amount, x.a.credited, TDS_STATUS_LABELS[x.a.status], daysBetween(x.l.postingDate, WORLD.asOf)])
            )
          }
        >
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 pr-0">
              <input
                type="checkbox"
                aria-label="Select all deductions shown"
                checked={shown.length > 0 && shown.slice(0, 100).every((x) => selected.has(x.l.key))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.slice(0, 100).map((x) => x.l.key)) : new Set())}
              />
            </TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Quarter</TableHead>
            <TableHead className="text-right">Deducted</TableHead>
            <TableHead className="text-right">Credited</TableHead>
            <TableHead>Statement check</TableHead>
            <TableHead>Workflow</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                No deductions match
              </TableCell>
            </TableRow>
          )}
          {shown.slice(0, 100).map((x) => (
            <TableRow key={x.l.key} className="cursor-pointer" onClick={() => open(x.l.key)} data-state={selected.has(x.l.key) ? "selected" : undefined}>
              <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${x.l.docNo}`}
                  checked={selected.has(x.l.key)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(x.l.key)) n.delete(x.l.key);
                      else n.add(x.l.key);
                      return n;
                    })
                  }
                />
              </TableCell>
              <TableCell className="whitespace-nowrap py-2">
                <DocLink itemKey={x.l.key}>{x.l.docNo}</DocLink>
                <div className="text-2xs text-muted-foreground">{fmtDate(x.l.postingDate)}</div>
              </TableCell>
              <TableCell className="max-w-56 py-2">
                <div className="truncate text-sm">{PARTY_BY_ID.get(x.l.partner!.id)?.name}</div>
                <div className="font-mono text-2xs text-muted-foreground">{PARTY_BY_ID.get(x.l.partner!.id)?.deductorIdMasked}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap py-2 text-xs">{x.a.quarter}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right tnum text-sm">{fmtINR(x.l.amount)}</TableCell>
              <TableCell className={cn("whitespace-nowrap py-2 text-right tnum text-sm", x.a.status === "short" && "text-warn-foreground")}>{x.a.credited ? fmtINR(x.a.credited) : "-"}</TableCell>
              <TableCell className="py-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusChip status={x.a.status} />
                  {x.a.status === "wrong-quarter" && x.a.statementQuarter && <span className="text-2xs text-muted-foreground">in {x.a.statementQuarter}</span>}
                </div>
              </TableCell>
              <TableCell className="py-2">
                <StatusChip status={x.row.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shown.length > 100 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the oldest 100 of {fmtInt(shown.length)}; narrow the filters to see the rest</div>}
    </Panel>
  );
}

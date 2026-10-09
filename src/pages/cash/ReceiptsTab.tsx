import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { ConfidenceChip, Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, nextSort, parseSort } from "@/components/ui/sort-head";
import { AGE_BUCKETS, CASH_GROUPS, bucketOfAge, groupOfStatus } from "@/pages/cash/OverviewTab";
import { useCashApp } from "@/state/cashAppHooks";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { ROLES, can } from "@/config/roles";
import { LEVEL_LABELS, type MatchLevel } from "@/engine/cashapp";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate } from "@/lib/dates";
import { fmtINR, fmtINRCompact, fmtInt } from "@/lib/format";
import { toast } from "@/lib/toast";

const LEVELS: MatchLevel[] = ["L1", "L2", "L3", "L4"];
const SORT_KEYS = ["age", "amount", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];
/** status order follows the work: ready first, then to review, in approval, applied, parked, no match */
const statusRank = (s: Parameters<typeof groupOfStatus>[0]) => CASH_GROUPS.findIndex((g) => g.key === groupOfStatus(s));

export function ReceiptsTab() {
  const { rows } = useCashApp();
  const navigate = useNavigate();
  const role = useRoleStore((s) => s.role);
  const { confirmMatches } = useWorkflow.getState();
  const [params, setParams] = useQueryParams();
  const status = params.get("cstatus") ?? "all";
  const level = params.get("clevel") ?? "all";
  const age = params.get("cage") ?? "all";
  const q = params.get("cq") ?? "";
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sort = parseSort(params.get("csort"), SORT_KEYS);
  const onSort = (k: SortKey) => setParams({ csort: nextSort(sort, k) });

  const shown = useMemo(() => {
    const list = rows.filter(
      (r) =>
        (status === "all" || groupOfStatus(r.status) === status) &&
        (level === "all" || (level === "none" ? !r.best : r.best?.level === level)) &&
        (age === "all" || bucketOfAge(r.age) === age) &&
        (!q || `${r.receipt.narration} ${r.receipt.utr ?? ""} ${r.customerName ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    );
    if (!sort.k) return list;
    const dir = sort.desc ? -1 : 1;
    const value = (r: (typeof list)[number]) => (sort.k === "age" ? r.age : sort.k === "amount" ? Math.abs(r.receipt.amount) : statusRank(r.status));
    return [...list].sort((a, b) => dir * (value(a) - value(b)) || b.age - a.age);
  }, [rows, status, level, age, q, sort.k, sort.desc]);
  const ready = rows.filter((r) => r.status === "ready");
  const chosen = shown.filter((r) => selected.has(r.key));
  const canPropose = can(role, "propose");

  const confirm = (keys: string[]) => {
    const r = confirmMatches(keys);
    if (r.ok) {
      toast(`${r.created} application${r.created === 1 ? "" : "s"} proposed`, { description: r.skipped ? `${r.skipped} skipped` : "Routed to approvers by amount band; nothing is posted", tone: "ok" });
      setSelected(new Set());
    } else toast(r.error, { tone: "danger" });
  };

  return (
    <Panel title="Receipts in incoming payments clearing" bodyClassName="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
        <Select value={status} onValueChange={(v) => setParams({ cstatus: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CASH_GROUPS.map((g) => (
              <SelectItem key={g.key} value={g.key}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={(v) => setParams({ clevel: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All match levels</SelectItem>
            {LEVELS.map((l) => (
              <SelectItem key={l} value={l}>
                {l} {LEVEL_LABELS[l]}
              </SelectItem>
            ))}
            <SelectItem value="none">No match</SelectItem>
          </SelectContent>
        </Select>
        <Select value={age} onValueChange={(v) => setParams({ cage: v === "all" ? null : v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ages</SelectItem>
            {AGE_BUCKETS.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={q} onChange={(e) => setParams({ cq: e.target.value || null })} placeholder="Narration, reference or customer" className="h-8 w-60" />
        <span className="text-xs text-muted-foreground">{fmtInt(shown.length)} receipts</span>
        <div className="flex-1" />
        {chosen.length > 0 && (
          <Button size="sm" className="h-8" disabled={!canPropose} onClick={() => confirm(chosen.map((r) => r.key))}>
            Confirm {chosen.length} selected
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={ready.length === 0 || !canPropose}
          title={ready.length === 0 ? "No receipt is ready to confirm" : canPropose ? "Proposes the application of every receipt at the bulk-confirmation confidence; approvals still follow" : `${ROLES[role].label} cannot propose applications`}
          onClick={() => confirm(ready.map((r) => r.key))}
        >
          Confirm all ready{ready.length ? ` (${ready.length})` : ""}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            downloadCsv(
              "receipts-in-clearing.csv",
              ["Document", "Date", "Reference", "Narration", "Amount", "Customer", "Match level", "Confidence", "Invoices", "Deductions", "Status"],
              shown.map((r) => [r.receipt.docNo, fmtDate(r.receipt.date), r.receipt.utr ?? "", r.receipt.narration, r.receipt.amount, r.customerName ?? "", r.best?.level ?? "", r.best?.confidence ?? "", r.best?.invoices.map((i) => i.reference).join("; ") ?? "", r.best?.deductions.map((d) => `${d.label} ${d.amount}`).join("; ") ?? "", r.status])
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
                aria-label="Select all receipts shown"
                checked={shown.length > 0 && shown.slice(0, 100).every((r) => selected.has(r.key))}
                onChange={(e) => setSelected(e.target.checked ? new Set(shown.slice(0, 100).map((r) => r.key)) : new Set())}
              />
            </TableHead>
            <SortHead label="Receipt · age" k="age" sort={sort.k} desc={sort.desc} onSort={onSort} />
            <TableHead>Customer</TableHead>
            <SortHead label="Amount" k="amount" sort={sort.k} desc={sort.desc} onSort={onSort} className="text-right" />
            <TableHead>Match</TableHead>
            <SortHead label="Status" k="status" sort={sort.k} desc={sort.desc} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                No receipts match
              </TableCell>
            </TableRow>
          )}
          {shown.slice(0, 100).map((r) => (
            <TableRow key={r.key} className="cursor-pointer" onClick={() => navigate(`/cash-application/${r.key}`)} data-state={selected.has(r.key) ? "selected" : undefined}>
              <TableCell className="w-8 pr-0" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  aria-label={`Select ${r.receipt.utr ?? r.receipt.docNo}`}
                  checked={selected.has(r.key)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(r.key)) n.delete(r.key);
                      else n.add(r.key);
                      return n;
                    })
                  }
                />
              </TableCell>
              <TableCell className="max-w-56 py-2">
                <div className="truncate text-sm">{r.receipt.narration || r.receipt.docNo}</div>
                <div className="truncate text-2xs text-muted-foreground">
                  <span className="font-mono">{r.receipt.utr ?? r.receipt.docNo}</span> · {fmtDate(r.receipt.date)} · {fmtInt(r.age)} d
                </div>
              </TableCell>
              <TableCell className="max-w-44 truncate py-2 text-sm">{r.customerName ?? <span className="text-muted-foreground">Not identified</span>}</TableCell>
              <TableCell className="whitespace-nowrap py-2 text-right">
                <div className="tnum text-sm" title={fmtINR(r.receipt.amount)}>{fmtINRCompact(r.receipt.amount)}</div>
              </TableCell>
              <TableCell className="max-w-52 py-2">
                {r.best ? (
                  <>
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
                      {r.best.level} · {r.best.invoices.length} invoice{r.best.invoices.length === 1 ? "" : "s"}
                      <ConfidenceChip score={r.best.confidence} showIcon={false} />
                    </div>
                    <div className="truncate text-2xs text-muted-foreground">{r.best.deductions.map((d) => d.label).join(", ") || "No deductions"}</div>
                  </>
                ) : (
                  <span className="text-2xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="py-2">
                <StatusChip status={r.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {shown.length > 100 && <div className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">Showing the oldest 100 of {fmtInt(shown.length)}; narrow the filters to see the rest</div>}
    </Panel>
  );
}

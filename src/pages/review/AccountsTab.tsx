import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, nextSort, parseSort } from "@/components/ui/sort-head";
import { StatusBars, STATUS_GROUPS } from "@/components/review/StatusBars";
import { PERSON_BY_ID } from "@/data";
import { useReview } from "@/state/ReviewContext";
import type { AccountRow } from "@/state/hooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { CATEGORY_LABELS } from "@/lib/labels";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import type { AccountCategory, RiskTier } from "@/types";

const SEVERITY = { High: "high", Medium: "medium", Low: "low" } as const;

const SORT_KEYS = ["risk", "balance", "older", "flagged", "status"] as const;
type SortKey = (typeof SORT_KEYS)[number];
const RISK_RANK: Record<RiskTier, number> = { High: 3, Medium: 2, Low: 1 };
const STATUS_RANK: Record<string, number> = { "not-started": 1, "in-review": 2, reopened: 2, "ready-for-signoff": 3, "preparer-signed": 4, "reviewer-signed": 5 };
const SORT_VALUE: Record<SortKey, (a: AccountRow) => number> = {
  risk: (a) => RISK_RANK[a.summary.gl.riskTier],
  balance: (a) => Math.abs(a.summary.closing),
  older: (a) => a.summary.overAmount,
  flagged: (a) => a.flaggedCount,
  status: (a) => STATUS_RANK[a.status] ?? 0,
};

export function AccountsTab() {
  const review = useReview();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams();
  const category = params.get("acategory") ?? "all";
  const risk = params.get("risk") ?? "all";
  const group = params.get("astatus") ?? "all";
  const q = params.get("aq") ?? "";

  const sort = parseSort(params.get("asort"), SORT_KEYS);
  const onSort = (k: SortKey) => setParams({ asort: nextSort(sort, k) });

  const statusOf = (s: string) => STATUS_GROUPS.find((g) => g.statuses.includes(s as never))?.key ?? "not-started";
  const rows = useMemo(() => {
    const list = review.accounts.filter(
      (a) =>
        (category === "all" || a.summary.gl.category === category) &&
        (risk === "all" || a.summary.gl.riskTier === risk) &&
        (group === "all" || statusOf(a.status) === group) &&
        (!q || a.summary.gl.gl.includes(q) || a.summary.gl.description.toLowerCase().includes(q.toLowerCase()))
    );
    if (!sort.k) return list;
    const value = SORT_VALUE[sort.k];
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => dir * (value(a) - value(b)) || a.summary.gl.gl.localeCompare(b.summary.gl.gl));
  }, [review.accounts, category, risk, group, q, sort.k, sort.desc]);

  const chart = useMemo(() => {
    const data: Record<RiskTier, Record<string, number>> = { High: {}, Medium: {}, Low: {} };
    for (const a of review.accounts) {
      const g = statusOf(a.status);
      data[a.summary.gl.riskTier][g] = (data[a.summary.gl.riskTier][g] ?? 0) + 1;
    }
    return data;
  }, [review.accounts]);

  const categories = [...new Set(review.accounts.map((a) => a.summary.gl.category))] as AccountCategory[];

  return (
    <div className="space-y-4">
      <Panel title="Accounts by risk and review status">
        <StatusBars data={chart} onSelect={(r, g) => setParams({ risk: r, astatus: g })} />
      </Panel>

      <Panel title="Accounts" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <Select value={category} onValueChange={(v) => setParams({ acategory: v })}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={risk} onValueChange={(v) => setParams({ risk: v })}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk tiers</SelectItem>
              {(["High", "Medium", "Low"] as const).map((r) => (
                <SelectItem key={r} value={r}>
                  {r} risk
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={group} onValueChange={(v) => setParams({ astatus: v })}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_GROUPS.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={q} onChange={(e) => setParams({ aq: e.target.value })} placeholder="GL or account" className="h-8 w-48" />
          <span className="text-xs text-muted-foreground">{fmtInt(rows.length)} accounts</span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() =>
              downloadCsv(
                "balance-sheet-accounts.csv",
                ["GL", "Account", "Category", "Statement line", "Owner", "Reviewer", "Risk", "Balance", `Older than threshold`, "Items flagged", "Review status"],
                rows.map((a) => [a.summary.gl.gl, a.summary.gl.description, CATEGORY_LABELS[a.summary.gl.category], a.summary.gl.statementLine, PERSON_BY_ID.get(a.summary.gl.ownerId)?.name ?? "", PERSON_BY_ID.get(a.summary.gl.reviewerId)?.name ?? "", a.summary.gl.riskTier, a.summary.closing, a.summary.overAmount, a.flaggedCount, a.status])
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GL</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Statement line</TableHead>
              <TableHead>Owner</TableHead>
              <SortHead label="Risk" k="risk" sort={sort.k} desc={sort.desc} onSort={onSort} />
              <SortHead label="Balance" k="balance" sort={sort.k} desc={sort.desc} onSort={onSort} className="text-right" />
              <SortHead label="Older than threshold" k="older" sort={sort.k} desc={sort.desc} onSort={onSort} className="text-right" />
              <SortHead label="Flagged" k="flagged" sort={sort.k} desc={sort.desc} onSort={onSort} className="text-right" />
              <SortHead label="Status" k="status" sort={sort.k} desc={sort.desc} onSort={onSort} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.summary.gl.gl} className="cursor-pointer" onClick={() => navigate(`/balance-sheet-review/${a.summary.gl.gl}`)}>
                <TableCell className="font-mono text-xs">{a.summary.gl.gl}</TableCell>
                <TableCell>
                  <div className="text-sm">{a.summary.gl.description}</div>
                  <div className="text-2xs text-muted-foreground">
                    {CATEGORY_LABELS[a.summary.gl.category]}
                    {!a.summary.gl.openItemManaged && " · balance only"}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.summary.gl.statementLine}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{PERSON_BY_ID.get(a.summary.gl.ownerId)?.name}</TableCell>
                <TableCell>
                  <SeverityBadge severity={SEVERITY[a.summary.gl.riskTier]} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{fmtDrCr(a.summary.closing, true)}</TableCell>
                <TableCell className="whitespace-nowrap text-right tnum">{a.summary.overAmount ? `${fmtINRCompact(a.summary.overAmount)} · ${fmtInt(a.summary.overCount)}` : "-"}</TableCell>
                <TableCell className="text-right tnum">{a.flaggedCount ? fmtInt(a.flaggedCount) : "-"}</TableCell>
                <TableCell>
                  <StatusChip status={a.status} />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                  No accounts match
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

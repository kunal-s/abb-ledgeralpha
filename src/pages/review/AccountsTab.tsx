import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { Panel, SeverityBadge, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBars, STATUS_GROUPS } from "@/components/review/StatusBars";
import { PERSON_BY_ID } from "@/data";
import { useReview } from "@/state/ReviewContext";
import { useQueryParams } from "@/lib/useQueryParams";
import { CATEGORY_LABELS } from "@/lib/labels";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import type { AccountCategory, RiskTier } from "@/types";

const SEVERITY = { High: "high", Medium: "medium", Low: "low" } as const;

export function AccountsTab() {
  const review = useReview();
  const navigate = useNavigate();
  const [params, setParams] = useQueryParams();
  const category = params.get("acategory") ?? "all";
  const risk = params.get("risk") ?? "all";
  const group = params.get("astatus") ?? "all";
  const q = params.get("aq") ?? "";

  const statusOf = (s: string) => STATUS_GROUPS.find((g) => g.statuses.includes(s as never))?.key ?? "not-started";
  const rows = useMemo(
    () =>
      review.accounts.filter(
        (a) =>
          (category === "all" || a.summary.gl.category === category) &&
          (risk === "all" || a.summary.gl.riskTier === risk) &&
          (group === "all" || statusOf(a.status) === group) &&
          (!q || a.summary.gl.gl.includes(q) || a.summary.gl.description.toLowerCase().includes(q.toLowerCase()))
      ),
    [review.accounts, category, risk, group, q]
  );

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
              <TableHead>Risk</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Older than threshold</TableHead>
              <TableHead className="text-right">Flagged</TableHead>
              <TableHead>Status</TableHead>
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
                <TableCell className="whitespace-nowrap text-right tnum">{a.summary.overAmount ? `${fmtINRCompact(a.summary.overAmount)} · ${fmtInt(a.summary.overCount)}` : "—"}</TableCell>
                <TableCell className="text-right tnum">{a.flaggedCount ? fmtInt(a.flaggedCount) : "—"}</TableCell>
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

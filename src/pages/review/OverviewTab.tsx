import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { KpiTile, Panel, DocLink, ConfidenceChip } from "@/components/vocab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeatmapGrid, type HeatMode } from "@/components/review/Heatmap";
import { GL_BY_ID, PARTY_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { useReview } from "@/state/ReviewContext";
import { useQueryParams } from "@/lib/useQueryParams";
import { AGEING_POLICY } from "@/config/policies";
import { REVIEW_CATEGORIES, buildHeatmap } from "@/engine/review";
import { CATEGORY_LABELS } from "@/lib/labels";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountCategory } from "@/types";

function Delta({ value, goodWhen }: { value: number; goodWhen: "down" | "up" }) {
  if (Math.abs(value) < 1) return <span className="text-muted-foreground">—</span>;
  const up = value > 0;
  const good = (up && goodWhen === "up") || (!up && goodWhen === "down");
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tnum", good ? "text-ok-foreground" : "text-danger-foreground")}>
      <Icon className="h-3 w-3" />
      {fmtINRCompact(Math.abs(value))}
    </span>
  );
}

export function OverviewTab() {
  const review = useReview();
  const [params, setParams] = useQueryParams();
  const mode = (params.get("mode") as HeatMode) || "amount";
  const owner = params.get("owner") ?? "all";
  const pc = params.get("pc") ?? "all";
  const source = params.get("source") ?? "all";

  const owners = useMemo(() => [...new Set(WORLD.glAccounts.filter((g) => g.category !== "pl").map((g) => g.ownerId))].map((id) => PERSON_BY_ID.get(id)!), []);
  const sources = useMemo(() => [...new Set(WORLD.lines.map((l) => l.sourceSystem))], []);

  const rows = useMemo(
    () =>
      review.rows.filter(
        (r) =>
          (owner === "all" || GL_BY_ID.get(r.item.gl)?.ownerId === owner) &&
          (pc === "all" || r.item.profitCentre === pc) &&
          (source === "all" || r.item.sourceSystem === source)
      ),
    [review.rows, owner, pc, source]
  );
  const open = useMemo(() => rows.filter((r) => r.isOpen), [rows]);
  const heatmap = useMemo(() => buildHeatmap(open.map((r) => r.item), new Set(open.filter((r) => r.flagged).map((r) => r.key)), review.asOf), [open, review.asOf]);

  const threshold = AGEING_POLICY.reviewThresholdDays;
  const over = open.filter((r) => r.age > threshold);
  const flagged = rows.filter((r) => r.flagged);
  const awaiting = rows.filter((r) => r.decision?.status === "proposed");
  const accounts = review.accounts.filter((a) => owner === "all" || a.summary.gl.ownerId === owner);
  const signed = accounts.filter((a) => a.status === "reviewer-signed").length;
  const actionKinds = new Set(["Write back", "Write off", "Provide"]);
  const proposedValue = rows.filter((r) => r.decision && ["proposed", "approved", "exported", "closed-in-erp"].includes(r.decision.status) && actionKinds.has(r.decision.action)).reduce((s, r) => s + Math.abs(r.item.amount), 0);
  const recommendedValue = flagged.filter((r) => r.rec && actionKinds.has(r.rec.action)).reduce((s, r) => s + Math.abs(r.item.amount), 0);

  const needsDecision = flagged
    .filter((r) => r.rec && r.rec.action !== "Follow up" && !r.decision)
    .sort((a, b) => Math.abs(b.item.amount) - Math.abs(a.item.amount))
    .slice(0, 10);

  const byCategory = new Map<AccountCategory, { total: number; signed: number }>();
  for (const a of accounts) {
    const c = byCategory.get(a.summary.gl.category) ?? { total: 0, signed: 0 };
    c.total += 1;
    if (a.status === "reviewer-signed") c.signed += 1;
    byCategory.set(a.summary.gl.category, c);
  }
  const progress = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);

  const movement = REVIEW_CATEGORIES.map((c) => review.scan.categories.get(c)).filter((m): m is NonNullable<typeof m> => !!m && (Math.abs(m.closing) > 0 || m.over > 0 || m.priorOver > 0));

  const drill = (category: AccountCategory | null, bucket: string | null) =>
    setParams({ tab: "exceptions", category, bucket, show: "all", status: null, rule: null, q: null }, { replace: false });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiTile label="Value reviewed" value={fmtINRCompact(open.reduce((s, r) => s + Math.abs(r.item.amount), 0))} sublabel={`${fmtInt(open.length)} open items`} />
        <KpiTile label={`Older than ${threshold} days`} value={fmtINRCompact(over.reduce((s, r) => s + Math.abs(r.item.amount), 0))} sublabel={`${fmtInt(over.length)} items`} accent="warn" />
        <KpiTile label="Items flagged" value={fmtInt(flagged.length)} sublabel={fmtINRCompact(flagged.reduce((s, r) => s + Math.abs(r.item.amount), 0))} accent="danger" onClick={() => setParams({ tab: "exceptions", category: null, bucket: null, show: null }, { replace: false })} />
        <KpiTile label="Awaiting approval" value={fmtInt(awaiting.length)} sublabel="decisions in progress" accent="info" onClick={() => setParams({ tab: "decisions" }, { replace: false })} />
        <KpiTile label="Accounts signed off" value={`${signed}/${accounts.length}`} sublabel="reviewer signed" accent="ok" onClick={() => setParams({ tab: "accounts" }, { replace: false })} />
        <KpiTile label="Proposed adjustments" value={fmtINRCompact(proposedValue)} sublabel={`${fmtINRCompact(recommendedValue)} recommended`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={owner} onValueChange={(v) => setParams({ owner: v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All owners</SelectItem>
            {owners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pc} onValueChange={(v) => setParams({ pc: v })}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Profit centre" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All profit centres</SelectItem>
            {WORLD.profitCentres.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={(v) => setParams({ source: v })}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Source system" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel
          title="Open items by category and age"
          className="xl:col-span-2"
          actions={
            <div className="flex rounded-md border border-border p-0.5 text-xs">
              {(["amount", "count"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setParams({ mode: m === "amount" ? null : m })} className={cn("rounded px-2 py-0.5", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {m === "amount" ? "Amount" : "Items"}
                </button>
              ))}
            </div>
          }
        >
          <HeatmapGrid heatmap={heatmap} mode={mode} onSelect={drill} />
        </Panel>

        <Panel title="Needs a decision" bodyClassName="p-0">
          {needsDecision.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Every recommended action has a decision</div>
          ) : (
            <ul className="divide-y divide-border/70">
              {needsDecision.map((r) => (
                <li key={r.key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <DocLink itemKey={r.key}>{r.item.docNo}</DocLink>
                    <span className="tnum text-sm">{fmtDrCr(r.item.amount, true)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">
                      {GL_BY_ID.get(r.item.gl)?.description}
                      {r.item.partner ? ` · ${PARTY_BY_ID.get(r.item.partner.id)?.name}` : ""}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="font-medium">{r.rec!.action}</span>
                      <ConfidenceChip score={r.rec!.confidence} showIcon={false} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel title={`Movement since ${fmtDate(review.priorDate)}`} className="xl:col-span-2" bodyClassName="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Older than {threshold} days</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movement.map((m) => (
                <TableRow key={m.category} className="cursor-pointer" onClick={() => drill(m.category, null)}>
                  <TableCell>{CATEGORY_LABELS[m.category]}</TableCell>
                  <TableCell className="text-right tnum">{fmtDrCr(m.closing, true)}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tnum">{m.closing - m.prior === 0 ? "—" : `${m.closing - m.prior > 0 ? "+" : "−"}${fmtINRCompact(Math.abs(m.closing - m.prior))}`}</TableCell>
                  <TableCell className="text-right tnum">{m.over ? fmtINRCompact(m.over) : "—"}</TableCell>
                  <TableCell className="text-right text-xs">
                    <Delta value={m.over - m.priorOver} goodWhen="down" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Sign-off progress">
          <ul className="space-y-2.5">
            {progress.map(([c, p]) => (
              <li key={c}>
                <div className="flex items-center justify-between text-xs">
                  <span>{CATEGORY_LABELS[c]}</span>
                  <span className="tnum text-muted-foreground">
                    {p.signed}/{p.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm bg-muted">
                  <div className="h-1.5 rounded-sm bg-ok" style={{ width: `${(p.signed / p.total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

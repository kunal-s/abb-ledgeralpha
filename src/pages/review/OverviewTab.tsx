import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { KpiTile, Panel } from "@/components/vocab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HeatmapGrid, type HeatMode } from "@/components/review/Heatmap";
import { AgeingLegend, FocusAreas } from "@/components/review/FocusAreas";
import { ActionMix } from "@/components/review/ActionMix";
import { StaleBalances } from "@/components/review/StaleBalances";
import { MethodBadge } from "@/components/vocab";
import { portfolioFacts } from "@/engine/reviewStory";
import { GL_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
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
  if (Math.abs(value) < 1) return <span className="text-muted-foreground">-</span>;
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

  const facts = useMemo(() => portfolioFacts(rows, { signed, total: accounts.length }), [rows, signed, accounts.length]);

  const movement = REVIEW_CATEGORIES.map((c) => review.scan.categories.get(c)).filter((m): m is NonNullable<typeof m> => !!m && (Math.abs(m.closing) > 0 || m.over > 0 || m.priorOver > 0));

  const drill = (category: AccountCategory | null, bucket: string | null) =>
    setParams({ tab: "exceptions", category, bucket, show: "all", status: null, rule: null, q: null }, { replace: false });

  return (
    <div className="space-y-3">
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
        <Panel title="Flagged balances by age" className="xl:col-span-2" actions={<AgeingLegend />}>
          <FocusAreas areas={facts.focus} onSelect={(c, b) => drill(c, b ?? null)} />
        </Panel>
        <div className="flex flex-col gap-3">
          <Panel title="Recommended actions" actions={<MethodBadge method="judgement" showConfidence={false} />}>
            <ActionMix slices={facts.mix} onSelect={(a) => setParams({ tab: "exceptions", category: null, bucket: null, show: "all", status: null, rule: null, q: null, action: a }, { replace: false })} />
          </Panel>
          <Panel fit title="Oldest balances, over a year" className="flex-1" bodyClassName="p-0">
            <StaleBalances accounts={facts.stale.slice(0, 6)} />
          </Panel>
        </div>
      </div>

      <Panel
        title="Open items by category and age"
       
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

      <Panel title={`Movement since ${fmtDate(review.priorDate)}`} bodyClassName="p-0">
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
                <TableCell className="text-right text-xs text-muted-foreground tnum">{m.closing - m.prior === 0 ? "-" : `${m.closing - m.prior > 0 ? "+" : "−"}${fmtINRCompact(Math.abs(m.closing - m.prior))}`}</TableCell>
                <TableCell className="text-right tnum">{m.over ? fmtINRCompact(m.over) : "-"}</TableCell>
                <TableCell className="text-right text-xs">
                  <Delta value={m.over - m.priorOver} goodWhen="down" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </div>
  );
}

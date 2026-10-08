import { useMemo } from "react";
import { ChevronRight, Download } from "lucide-react";
import { Panel } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemsTable } from "@/components/review/ItemsTable";
import { BulkButtons } from "@/components/review/BulkButtons";
import { GL_BY_ID, PARTY_BY_ID, PERSON_BY_ID } from "@/data";
import { useReview } from "@/state/ReviewContext";
import type { ItemRow } from "@/state/hooks";
import { useQueryParams } from "@/lib/useQueryParams";
import { BUCKETS, REVIEW_CATEGORIES } from "@/engine/review";
import { CATEGORY_LABELS } from "@/lib/labels";
import { downloadCsv } from "@/lib/exportCsv";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemStatus } from "@/types";

const PIPELINE: { key: ItemStatus | "exported"; label: string; statuses: ItemStatus[] }[] = [
  { key: "flagged", label: "Flagged", statuses: ["flagged"] },
  { key: "in-follow-up", label: "In follow-up", statuses: ["in-follow-up"] },
  { key: "decision-proposed", label: "Decision proposed", statuses: ["decision-proposed"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "exported", label: "Exported", statuses: ["exported", "closed-in-erp"] },
];

export function ExceptionsTab() {
  const review = useReview();
  const [params, setParams] = useQueryParams();
  const show = params.get("show") === "all" ? "all" : "flagged";
  const category = params.get("category") ?? "all";
  const bucket = params.get("bucket") ?? "all";
  const rule = params.get("rule") ?? "all";
  const status = params.get("status") ?? "all";
  const owner = params.get("eowner") ?? "all";
  const suggested = params.get("action") ?? "all";
  const q = params.get("q") ?? "";

  const base = useMemo(() => review.rows.filter((r) => (show === "all" ? true : r.flagged)), [review.rows, show]);
  const rows = useMemo(
    () =>
      base.filter(
        (r) =>
          (category === "all" || r.category === category) &&
          (bucket === "all" || r.bucket === bucket) &&
          (rule === "all" || r.hits.some((h) => h.ruleId === rule)) &&
          (status === "all" || (status === "exported" ? ["exported", "closed-in-erp"].includes(r.status) : r.status === status)) &&
          (owner === "all" || GL_BY_ID.get(r.item.gl)?.ownerId === owner) &&
          (suggested === "all" || r.rec?.action === suggested) &&
          (!q ||
            r.item.docNo.includes(q) ||
            (r.item.text ?? "").toLowerCase().includes(q.toLowerCase()) ||
            (r.item.partner ? (PARTY_BY_ID.get(r.item.partner.id)?.name ?? "").toLowerCase().includes(q.toLowerCase()) : false) ||
            (r.item.po?.number ?? "").includes(q))
      ),
    [base, category, bucket, rule, status, owner, suggested, q]
  );

  const flagged = review.rows.filter((r) => r.flagged);
  const pipeline = PIPELINE.map((p) => ({ ...p, count: flagged.filter((r) => p.statuses.includes(r.status)).length }));
  const rejected = flagged.filter((r) => r.status === "rejected").length;
  const byRule = review.run.rules
    .filter((r) => r.enabled)
    .map((r) => {
      const hit = flagged.filter((x) => x.hits.some((h) => h.ruleId === r.id));
      return { rule: r, count: hit.length, value: hit.reduce((s, x) => s + Math.abs(x.item.amount), 0) };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.value - a.value);
  const maxValue = Math.max(1, ...byRule.map((r) => r.value));

  const owners = useMemo(() => [...new Set(review.accounts.map((a) => a.summary.gl.ownerId))].map((id) => PERSON_BY_ID.get(id)!), [review.accounts]);
  const categories = REVIEW_CATEGORIES.filter((c) => review.rows.some((r) => r.category === c));
  const filtered = category !== "all" || bucket !== "all" || rule !== "all" || status !== "all" || owner !== "all" || suggested !== "all" || q || show === "all";

  const exportRows = () =>
    downloadCsv(
      "exceptions.csv",
      ["Document", "Posting date", "GL", "Account", "Party", "Amount", "Age (days)", "Findings", "Suggested action", "Confidence", "Status"],
      rows.map((r) => [r.item.docNo, fmtDate(r.item.postingDate), r.item.gl, GL_BY_ID.get(r.item.gl)?.description ?? "", r.item.partner ? PARTY_BY_ID.get(r.item.partner.id)?.name ?? "" : "", r.item.amount, r.age, r.hits.map((h) => h.ruleId).join(" "), r.rec?.action ?? "", r.rec?.confidence.toFixed(2) ?? "", r.status])
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
        <Panel title="Exception pipeline" className="xl:col-span-2">
          <div className="flex items-stretch gap-1">
            {pipeline.map((p, i) => (
              <div key={p.key} className="flex flex-1 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setParams({ status: status === p.key ? null : p.key, show: null })}
                  aria-pressed={status === p.key}
                  className={cn("flex-1 rounded-md border px-2 py-2 text-left transition-colors", status === p.key ? "border-primary bg-primary/10" : "border-border hover:bg-accent")}
                >
                  <div className="tnum text-lg font-semibold leading-tight">{fmtInt(p.count)}</div>
                  <div className="text-2xs text-muted-foreground">{p.label}</div>
                </button>
                {i < pipeline.length - 1 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </div>
            ))}
          </div>
          {rejected > 0 && <div className="mt-2 text-xs text-muted-foreground">{rejected} rejected and back with the preparer</div>}
        </Panel>

        <Panel title="Value flagged by rule" className="xl:col-span-3" bodyClassName="max-h-52 overflow-y-auto p-2">
          <ul>
            {byRule.map(({ rule: r, count, value }) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setParams({ rule: rule === r.id ? null : r.id, show: null })}
                  aria-pressed={rule === r.id}
                  className={cn("grid w-full grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_3rem] items-center gap-3 rounded-md px-2 py-1 text-left text-sm", rule === r.id ? "bg-primary/10" : "hover:bg-accent")}
                >
                  <span className="font-mono text-2xs text-muted-foreground">{r.id}</span>
                  <span className="truncate text-xs">{r.name}</span>
                  <span className="h-2 rounded-sm bg-muted">
                    <span className="block h-2 rounded-sm bg-primary" style={{ width: `${Math.max(1.5, (value / maxValue) * 100)}%` }} />
                  </span>
                  <span className="text-right text-xs tnum">{fmtINRCompact(value)}</span>
                  <span className="text-right text-xs tnum text-muted-foreground">{fmtInt(count)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Items" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-2.5">
          <div className="flex rounded-md border border-border p-0.5 text-xs">
            {(["flagged", "all"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setParams({ show: m === "flagged" ? null : "all" })} className={cn("rounded px-2 py-1", show === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {m === "flagged" ? "Flagged" : "All open items"}
              </button>
            ))}
          </div>
          <Select value={category} onValueChange={(v) => setParams({ category: v })}>
            <SelectTrigger className="h-8 w-48">
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
          <Select value={bucket} onValueChange={(v) => setParams({ bucket: v })}>
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ages</SelectItem>
              {BUCKETS.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rule} onValueChange={(v) => setParams({ rule: v })}>
            <SelectTrigger className="h-8 w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {review.run.rules.filter((r) => r.enabled).map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.id} · {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={suggested} onValueChange={(v) => setParams({ action: v })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suggested actions</SelectItem>
              {["Write back", "Write off", "Provide", "Clear", "Reclassify", "Escalate", "Follow up"].map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={(v) => setParams({ eowner: v })}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
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
          <Input value={q} onChange={(e) => setParams({ q: e.target.value })} placeholder="Document, party, PO, text" className="h-8 w-52" />
          {filtered && (
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setParams({ category: null, bucket: null, rule: null, status: null, eowner: null, action: null, q: null, show: null })}>
              Clear filters
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportRows}>
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
        <ItemsTable
          rows={rows}
          showAccount
          bulk={(selected: ItemRow[], clear) => <BulkButtons selected={selected} clear={clear} asOf={review.asOf} rulesVersion={review.run.version} />}
          empty={show === "flagged" ? "No flagged items match" : "No open items match"}
        />
      </Panel>
    </div>
  );
}

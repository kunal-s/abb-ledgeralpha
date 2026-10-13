// The system's own assessment of a ledger line, shown apart from the retrieved
// facts: the rules that flagged it (Deterministic) and the recommendation (Judgement).

import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, Lightbulb, ShieldAlert, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ConfidenceChip, MethodBadge } from "@/components/vocab";
import { useReview } from "@/state/ReviewContext";
import type { ItemRow } from "@/state/hooks";
import { priorityOf } from "@/engine/recommend";
import { fmtINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A collapsible block: the header always shows a one-line summary, the detail opens below it. */
function Block({ open, onToggle, icon: Icon, title, summary, aside, children }: { open: boolean; onToggle: () => void; icon: typeof Check; title: string; summary: React.ReactNode; aside: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="anim-rise flex min-w-0 flex-col border-t-2 border-t-primary">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-2 px-4 py-2.5 text-left">
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="h-3.5 w-3.5" /></span>
        <h2 className="shrink-0 text-sm font-semibold tracking-tight">{title}</h2>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span>
        <span className="shrink-0">{aside}</span>
      </button>
      {open && <div className="flex-1 border-t border-border px-4 py-3">{children}</div>}
    </Card>
  );
}

function FlaggedBy({ row, open, onToggle }: { row: ItemRow; open: boolean; onToggle: () => void }) {
  const review = useReview();
  const rules = new Map(review.run.rules.map((r) => [r.id, r]));
  const hits = [...row.hits].sort((a, b) => priorityOf(a.ruleId) - priorityOf(b.ruleId));
  return (
    <Block open={open} onToggle={onToggle} icon={ShieldAlert} title="Flagged by" aside={<MethodBadge method="deterministic" />} summary={hits.length ? `${hits.map((h) => h.ruleId).join(", ")}` : "within policy"}>
      {hits.length ? (
        <ul className="divide-y divide-border">
          {hits.map((h) => {
            const rule = rules.get(h.ruleId);
            return (
              <li key={h.ruleId} className="py-1.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 text-sm">
                  <Link to={`/rules?rule=${h.ruleId}`} className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-2xs text-primary hover:underline">{h.ruleId}</Link>
                  <span className="truncate font-medium">{rule?.name}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{h.reason}</p>
                {rule?.params.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {rule.params.map((p) => (
                      <span key={p.key} className="rounded-sm bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground">
                        {p.label}: <span className="font-medium tnum text-foreground">{p.unit === "amount" ? fmtINRCompact(p.value) : `${p.value}${p.unit === "%" ? "%" : ` ${p.unit}`}`}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Within policy: no rule applies.</p>
      )}
    </Block>
  );
}

function RecommendedAction({ row, open, onToggle }: { row: ItemRow; open: boolean; onToggle: () => void }) {
  const rec = row.rec;
  return (
    <Block open={open} onToggle={onToggle} icon={Lightbulb} title="Recommended" aside={<MethodBadge method="judgement" showConfidence={false} />} summary={rec ? `${rec.action}, confidence ${rec.confidence.toFixed(2)}` : "none"}>
      {rec ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary px-2.5 py-0.5 text-sm font-semibold text-primary-foreground">{rec.action}</span>
            <ConfidenceChip score={rec.confidence} size="sm" />
            {rec.requiresTaxReview && <span className="rounded-md bg-warn-subtle px-1.5 py-0.5 text-2xs font-medium text-warn-foreground">Tax review required</span>}
            <span className="text-2xs text-muted-foreground">Band {rec.approvalBandId}</span>
          </div>
          <p className="mt-2 text-sm">{rec.rationale}</p>
          <p className="mt-1 text-xs text-muted-foreground">Next: <span className="text-foreground">{rec.nextStep}</span></p>
          <div className="mt-2" title="Confidence is the sum of the met factor weights">
            <div className="flex h-1 gap-px overflow-hidden rounded-full bg-secondary">
              {rec.factors.filter((f) => f.met).map((f) => (
                <span key={f.label} className="anim-grow-x bg-primary" style={{ width: `${f.weight * 100}%` }} />
              ))}
            </div>
            <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
              {rec.factors.map((f) => (
                <li key={f.label} className={cn("flex min-w-0 items-center gap-1.5 text-2xs", !f.met && "text-muted-foreground/70")}>
                  {f.met ? <Check className="h-3 w-3 shrink-0 text-ok" /> : <X className="h-3 w-3 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  <span className={cn("tnum", f.met && "font-medium text-foreground")}>{f.met ? "+" : ""}{f.weight.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No recommendation: nothing to act on.</p>
      )}
    </Block>
  );
}

/** The two blocks open and close together. */
export function SystemAssessment({ row }: { row: ItemRow }) {
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((o) => !o);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <FlaggedBy row={row} open={open} onToggle={toggle} />
      <RecommendedAction row={row} open={open} onToggle={toggle} />
    </div>
  );
}

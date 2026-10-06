import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KpiTile, PageHeader, Panel, StatusChip } from "@/components/vocab";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BalanceBreakdown, type BreakdownAction, type BreakdownBucket } from "@/components/review/BalanceBreakdown";
import { BalanceTrend, type TrendPoint } from "@/components/review/BalanceTrend";
import { ItemsTable } from "@/components/review/ItemsTable";
import { SignOffPanel } from "@/components/review/SignOffPanel";
import { BulkButtons } from "@/components/review/BulkButtons";
import { BALANCES, GL_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { useReview, rowFor } from "@/state/ReviewContext";
import { AGEING_POLICY } from "@/config/policies";
import { BUCKETS, inScope, type BucketId } from "@/engine/review";
import { CATEGORY_LABELS } from "@/lib/labels";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ItemRow } from "@/state/hooks";

const ACTION_ORDER = ["Write back", "Write off", "Provide", "Clear", "Reclassify", "Follow up", "Retain", "No finding"] as const;

export function AccountScrutiny() {
  const { gl } = useParams();
  const review = useReview();
  const acct = gl ? review.accountByGl.get(gl) : undefined;
  const [show, setShow] = useState<"flagged" | "all">("flagged");
  const [bucket, setBucket] = useState<BucketId>();
  const [action, setAction] = useState<string>();

  const account = gl ? GL_BY_ID.get(gl) : undefined;
  const rows = useMemo(() => (gl ? review.rows.filter((r) => r.item.gl === gl) : []), [review.rows, gl]);
  const openRows = useMemo(() => rows.filter((r) => r.isOpen), [rows]);

  const buckets = useMemo<BreakdownBucket[]>(
    () =>
      BUCKETS.map((b) => {
        const r = openRows.filter((x) => x.bucket === b.id);
        return { id: b.id, count: r.length, amount: r.reduce((s, x) => s + Math.abs(x.item.amount), 0) };
      }),
    [openRows]
  );
  const actions = useMemo<BreakdownAction[]>(() => {
    const m = new Map<string, BreakdownAction>();
    for (const r of openRows) {
      const k = r.flagged && r.rec ? r.rec.action : "No finding";
      const a = m.get(k) ?? { action: k as BreakdownAction["action"], count: 0, amount: 0 };
      a.count += 1;
      a.amount += Math.abs(r.item.amount);
      m.set(k, a);
    }
    return ACTION_ORDER.map((k) => m.get(k)).filter((a): a is BreakdownAction => !!a);
  }, [openRows]);

  const tableRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          (show === "all" || r.flagged) &&
          (!bucket || r.bucket === bucket) &&
          (!action || (action === "No finding" ? !(r.flagged && r.rec) : r.flagged && r.rec?.action === action))
      ),
    [rows, show, bucket, action]
  );

  const trend = useMemo<TrendPoint[]>(() => {
    if (!gl) return [];
    return (BALANCES.byGl.get(gl) ?? []).filter((b) => b.periodEnd <= review.asOf).slice(-12).map((b) => ({ month: fmtMonth(b.periodEnd).slice(0, 3), label: fmtMonth(b.periodEnd), closing: b.closing }));
  }, [gl, review.asOf]);

  const postings = useMemo<ItemRow[]>(
    () =>
      !gl || !account || account.openItemManaged
        ? []
        : WORLD.lines.filter((l) => l.gl === gl && l.postingDate > review.priorDate && l.postingDate <= review.asOf && inScope(l, review.businessUnitId)).map((l) => rowFor(review, l)),
    [gl, account, review]
  );

  if (!gl || !account || !acct) {
    return (
      <div className="space-y-4">
        <PageHeader title="Account not found" breadcrumbs={[{ label: "Balance Sheet Review", to: "/balance-sheet-review" }, { label: gl ?? "" }]} />
        <Card className="p-5 text-sm">
          <Link to="/balance-sheet-review?tab=accounts" className="font-medium text-primary hover:underline">
            Go to the accounts register
          </Link>
        </Card>
      </div>
    );
  }

  const s = acct.summary;
  const change = s.closing - s.prior;
  const flagged = rows.filter((r) => r.flagged);
  const periodLines = !account.openItemManaged ? postings : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${account.gl} · ${account.description}`}
        breadcrumbs={[{ label: "Balance Sheet Review", to: "/balance-sheet-review" }, { label: "Accounts", to: "/balance-sheet-review?tab=accounts" }, { label: account.gl }]}
        badge={<StatusChip status={acct.status} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiTile label="Balance" value={fmtDrCr(s.closing, true)} sublabel={`${account.statementLine} · ${CATEGORY_LABELS[account.category]}`} />
        <KpiTile label={`Since ${fmtDate(review.priorDate)}`} value={change === 0 ? "-" : `${change > 0 ? "+" : "−"}${fmtINRCompact(Math.abs(change))}`} sublabel={`was ${fmtDrCr(s.prior, true)}`} />
        {account.openItemManaged ? (
          <>
            <KpiTile label={`Older than ${AGEING_POLICY.reviewThresholdDays} days`} value={fmtINRCompact(s.overAmount)} sublabel={`${fmtInt(s.overCount)} of ${fmtInt(s.openCount)} open items`} accent={s.overCount ? "warn" : "none"} />
            <KpiTile label="Items flagged" value={fmtInt(flagged.length)} sublabel={fmtINRCompact(flagged.reduce((t, r) => t + Math.abs(r.item.amount), 0))} accent={flagged.length ? "danger" : "none"} />
          </>
        ) : (
          <>
            <KpiTile label="Postings this period" value={fmtInt(postings.length)} sublabel={`since ${fmtDate(review.priorDate)}`} />
            <KpiTile label="Review basis" value="Schedule" sublabel="not open-item managed" />
          </>
        )}
        <KpiTile label="Owner · reviewer" value={PERSON_BY_ID.get(account.ownerId)?.name.split(" ")[0] ?? ""} sublabel={`${PERSON_BY_ID.get(account.ownerId)?.name} · ${PERSON_BY_ID.get(account.reviewerId)?.name} · ${account.riskTier} risk`} />
      </div>

      {account.openItemManaged ? (
        <Panel title="What the balance is made of">
          <BalanceBreakdown buckets={buckets} actions={actions} bucket={bucket} action={action} onBucket={setBucket} onAction={setAction} />
        </Panel>
      ) : (
        <Panel title="Month-end balance">
          <BalanceTrend data={trend} />
        </Panel>
      )}

      <Panel
        title={account.openItemManaged ? "Items" : "Postings in the review period"}
        bodyClassName="p-0"
        actions={
          account.openItemManaged ? (
            <>
              {(bucket || action) && (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => { setBucket(undefined); setAction(undefined); }}>
                  Clear filters
                </Button>
              )}
              <div className="flex rounded-md border border-border p-0.5 text-xs normal-case">
                {(["flagged", "all"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setShow(m)} className={cn("rounded px-2 py-0.5", show === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {m === "flagged" ? "Flagged" : "All open items"}
                  </button>
                ))}
              </div>
            </>
          ) : undefined
        }
      >
        <ItemsTable
          rows={account.openItemManaged ? tableRows : periodLines}
          bulk={
            account.openItemManaged
              ? (selected, clear) => <BulkButtons selected={selected} clear={clear} asOf={review.asOf} rulesVersion={review.run.version} />
              : undefined
          }
          empty={show === "flagged" && account.openItemManaged ? "No flagged items" : "No items"}
        />
      </Panel>

      <SignOffPanel key={`${acct.summary.gl.gl}-${acct.status}`} acct={acct} review={review} rows={rows} />
    </div>
  );
}

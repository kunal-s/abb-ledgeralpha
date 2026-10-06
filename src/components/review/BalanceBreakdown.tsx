// Pattern from LedgerAlpha's SubstantiationPanel: what a balance is made of, with
// each segment a filter on the items below. Two views of the same open items -
// by ageing bucket and by recommended action.

import type { ActionKind } from "@/types";
import { BUCKETS, type BucketId } from "@/engine/review";
import { fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

// Ordinal ramp, steps 250 / 350 / 500 / 650 of the reference blue: older is darker.
const BUCKET_COLOURS: Record<BucketId, string> = { "0-90": "#86b6ef", "91-180": "#5598e7", "181-365": "#256abf", "365+": "#104281" };

export interface BreakdownBucket {
  id: BucketId;
  count: number;
  amount: number;
}
export interface BreakdownAction {
  action: ActionKind | "No finding";
  count: number;
  amount: number;
}

interface BalanceBreakdownProps {
  buckets: BreakdownBucket[];
  actions: BreakdownAction[];
  bucket?: BucketId;
  action?: string;
  onBucket: (id?: BucketId) => void;
  onAction: (a?: string) => void;
}

function Row({ selected, onClick, swatch, label, count, amount, share }: { selected: boolean; onClick: () => void; swatch?: string; label: string; count: number; amount: number; share: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn("grid w-full grid-cols-[minmax(0,1.2fr)_4rem_5.5rem_3.5rem] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors", selected ? "bg-primary/10" : "hover:bg-accent")}
    >
      <span className="flex min-w-0 items-center gap-2">
        {swatch && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: swatch }} />}
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right text-xs tnum text-muted-foreground">{fmtInt(count)}</span>
      <span className="text-right text-xs tnum">{fmtINRCompact(amount)}</span>
      <span className="text-right text-xs tnum text-muted-foreground">{fmtPct(share)}</span>
    </button>
  );
}

export function BalanceBreakdown({ buckets, actions, bucket, action, onBucket, onAction }: BalanceBreakdownProps) {
  const total = buckets.reduce((s, b) => s + b.amount, 0) || 1;
  const maxAction = Math.max(1, ...actions.map((a) => a.amount));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>By ageing</span>
          <span className="font-normal normal-case">gross · click to filter</span>
        </div>
        <div className="mb-3 flex h-6 gap-0.5">
          {buckets.map((b) =>
            b.amount > 0 ? (
              <button
                key={b.id}
                type="button"
                aria-label={`${BUCKETS.find((x) => x.id === b.id)!.label}: ${fmtINRCompact(b.amount)}`}
                onClick={() => onBucket(bucket === b.id ? undefined : b.id)}
                className={cn("h-full rounded-[3px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", bucket && bucket !== b.id && "opacity-35")}
                style={{ flexGrow: b.amount, flexBasis: 0, background: BUCKET_COLOURS[b.id] }}
              />
            ) : null
          )}
        </div>
        <div>
          {buckets.map((b) => (
            <Row key={b.id} selected={bucket === b.id} onClick={() => onBucket(bucket === b.id ? undefined : b.id)} swatch={BUCKET_COLOURS[b.id]} label={BUCKETS.find((x) => x.id === b.id)!.label} count={b.count} amount={b.amount} share={b.amount / total} />
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span>By recommended action</span>
          <span className="font-normal normal-case">gross · click to filter</span>
        </div>
        <div className="space-y-0.5">
          {actions.map((a) => (
            <button
              key={a.action}
              type="button"
              onClick={() => onAction(action === a.action ? undefined : a.action)}
              aria-pressed={action === a.action}
              className={cn("block w-full rounded-md px-2 py-1.5 text-left transition-colors", action === a.action ? "bg-primary/10" : "hover:bg-accent")}
            >
              <div className="flex items-center justify-between text-sm">
                <span>{a.action}</span>
                <span className="flex gap-3 text-xs tnum">
                  <span className="text-muted-foreground">{fmtInt(a.count)}</span>
                  <span className="w-20 text-right">{fmtINRCompact(a.amount)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-sm bg-muted">
                <div className="h-1.5 rounded-sm bg-primary" style={{ width: `${Math.max(1.5, (a.amount / maxAction) * 100)}%` }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

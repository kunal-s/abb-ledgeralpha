import { bridgeOf, type RecView } from "@/engine/recs";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";
import { Waterfall, type WaterfallColumn } from "@/components/charts/Waterfall";

/**
 * Books less source, walked down to what is left. The first column is the
 * difference; each class of reconciling item takes a step towards zero; the
 * last column is the unexplained amount, green inside tolerance and red outside.
 */
export function ReconBridge({ view }: { view: RecView }) {
  const b = bridgeOf(view);
  if (!b || view.sourceBalance === null) return <div className="py-12 text-center text-sm text-muted-foreground">Waiting for the counterparty's balance</div>;
  if (b.start === 0 && b.steps.length === 0) return <div className="py-12 text-center text-sm text-muted-foreground">The balances agree; there is nothing to reconcile</div>;

  const ok = view.withinTolerance;
  const cols: WaterfallColumn[] = [
    { key: "start", label: "Difference", sub: "books less source", from: 0, to: b.start, value: b.start, tone: "ink" },
    ...b.steps.map((s): WaterfallColumn => ({ key: s.key, label: s.label, sub: `${fmtInt(s.count)} item${s.count === 1 ? "" : "s"}`, from: s.from, to: s.to, value: -s.effect, tone: "step", connect: true })),
    { key: "end", label: "Unexplained", sub: ok ? "within tolerance" : "outside tolerance", from: 0, to: b.residual, value: b.residual, tone: ok ? "ok" : "danger" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-muted-foreground">{view.rec.booksLabel} </span>
          <span className="font-medium tnum">{fmtDrCr(view.rec.booksBalance, true)}</span>
        </span>
        <span className="text-muted-foreground">less</span>
        <span>
          <span className="text-muted-foreground">{view.rec.sourceLabel} </span>
          <span className="font-medium tnum">{fmtDrCr(view.sourceBalance, true)}</span>
        </span>
        <span className="text-muted-foreground">equals</span>
        <span className="font-medium tnum">{b.start === 0 ? "Nil" : fmtDrCr(b.start, true)}</span>
      </div>

      <Waterfall columns={cols} min={b.min} max={b.max} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="tnum">Tolerance for this type: {fmtINR(b.tolerance)}</span>
        {b.unclassified.count > 0 && (
          <span className="tnum">{fmtInt(b.unclassified.count)} item{b.unclassified.count === 1 ? "" : "s"} not classified yet ({fmtDrCr(b.unclassified.effect, true)}), counted in the unexplained amount</span>
        )}
      </div>
    </div>
  );
}

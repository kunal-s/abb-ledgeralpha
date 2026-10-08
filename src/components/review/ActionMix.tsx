import type { ActionSlice } from "@/engine/reviewStory";
import { fmtINRCompact, fmtInt } from "@/lib/format";

interface ActionMixProps {
  slices: ActionSlice[];
  onSelect?: (action: ActionSlice["action"]) => void;
}

/** What the engine recommends, by action: value as a bar, items as a count. Follow up means the evidence is not yet enough. */
export function ActionMix({ slices, onSelect }: ActionMixProps) {
  const max = Math.max(1, ...slices.map((s) => s.value));
  return (
    <ul className="space-y-3">
      {slices.map((s, i) => (
        <li key={s.action}>
          <button type="button" disabled={!onSelect || s.action === "No recommendation"} onClick={() => onSelect?.(s.action)} className="block w-full text-left disabled:cursor-default">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium">{s.action}</span>
              <span className="tnum text-xs text-muted-foreground">
                {fmtInt(s.count)} items <span className="ml-2 text-sm font-medium text-foreground">{fmtINRCompact(s.value)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-secondary">
              <div className="anim-grow-x h-full rounded-full bg-primary" style={{ width: `${Math.max((s.value / max) * 100, 2)}%`, animationDelay: `${i * 60}ms` }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

import { Link } from "react-router-dom";
import type { StaleAccount } from "@/engine/reviewStory";
import { fmtINRCompact, fmtInt } from "@/lib/format";

/** Accounts holding flagged balances older than a year: the ones a reviewer has to explain first. */
export function StaleBalances({ accounts }: { accounts: StaleAccount[] }) {
  if (accounts.length === 0) return <div className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing flagged is older than a year</div>;
  const max = Math.max(1, ...accounts.map((a) => a.amount));
  return (
    <ul className="divide-y divide-border">
      {accounts.map((a) => (
        <li key={a.gl}>
          <Link to={`/balance-sheet-review/${a.gl}`} className="block px-4 py-2.5 hover:bg-accent/50">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{a.name}</span>
              <span className="shrink-0 text-sm font-medium tnum">{fmtINRCompact(a.amount)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-1 flex-1 rounded-full bg-secondary">
                <div className="anim-grow-x h-full rounded-full" style={{ width: `${(a.amount / max) * 100}%`, background: "hsl(var(--age-4))" }} />
              </div>
              <span className="shrink-0 text-2xs text-muted-foreground tnum">
                {fmtInt(a.count)} items, oldest {fmtInt(a.oldest)} days{a.action ? `, ${a.action.toLowerCase()}` : ""}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

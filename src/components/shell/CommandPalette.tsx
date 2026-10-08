import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ENABLED_MODULES } from "@/lib/modules";
import { WORLD } from "@/data";
import { cn } from "@/lib/utils";

interface Hit {
  id: string;
  group: "Module" | "Account" | "Reconciliation";
  label: string;
  detail?: string;
  to: string;
}

const MAX = 12;

/** Jump to any module, balance sheet account or reconciliation. Opens with Ctrl K. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo<Hit[]>(
    () => [
      ...ENABLED_MODULES.map((m) => ({ id: `m:${m.id}`, group: "Module" as const, label: m.label, to: m.path })),
      ...WORLD.glAccounts
        .filter((g) => g.openItemManaged || g.reconAccount)
        .map((g) => ({ id: `g:${g.gl}`, group: "Account" as const, label: g.description, detail: g.gl, to: `/balance-sheet-review/${g.gl}` })),
      ...WORLD.reconciliations.map((r) => ({ id: `r:${r.id}`, group: "Reconciliation" as const, label: r.name, detail: `${r.id} · ${r.type}`, to: `/reconciliations/${r.id}` })),
    ],
    []
  );

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return all.filter((h) => h.group === "Module").slice(0, MAX);
    return all.filter((h) => `${h.label} ${h.detail ?? ""}`.toLowerCase().includes(t)).slice(0, MAX);
  }, [all, q]);

  useEffect(() => setCursor(0), [q, open]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  useEffect(() => {
    listRef.current?.children[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = (h: Hit) => {
    onOpenChange(false);
    navigate(h.to);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter" && hits[cursor]) go(hits[cursor]);
            }}
            placeholder="Search modules, accounts, reconciliations"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {hits.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing matches</li>}
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(h)}
                className={cn("flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm", i === cursor && "bg-accent")}
              >
                <span className="min-w-0 truncate">{h.label}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  {h.detail && <span className="tnum">{h.detail}</span>}
                  <span className="w-24 text-right">{h.group}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

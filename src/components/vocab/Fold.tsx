import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** A panel that stays closed until asked for: title and a one-line summary show, the detail opens on click. */
export function Fold({ title, summary, children }: { title: string; summary?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <h2 className="text-sm font-semibold">{title}</h2>
        {summary && <span className="ml-auto text-xs text-muted-foreground tnum">{summary}</span>}
      </button>
      {open && <div className="border-t border-border/70">{children}</div>}
    </Card>
  );
}

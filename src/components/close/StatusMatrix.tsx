// Status by business unit and close area (docs/FRD.md §6.1). Each cell is the
// work done over the work there is, judged against the close plan for that
// area at the working day being read; a cell opens the module's filtered view.

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellState, CloseArea } from "@/engine/close";
import type { CloseMatrix } from "@/state/closeModel";
import { wdLabel } from "@/lib/workdays";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE: Record<CellState, { cls: string; label: string }> = {
  none: { cls: "bg-secondary/50 text-muted-foreground", label: "Nothing to do" },
  complete: { cls: "bg-ok-subtle text-ok-foreground", label: "Complete" },
  "on-track": { cls: "bg-info-subtle text-info-foreground", label: "On track" },
  behind: { cls: "bg-warn-subtle text-warn-foreground", label: "Behind the plan" },
};

export function StatusMatrix({ matrix, wd, onSelect }: { matrix: CloseMatrix; wd: number; onSelect: (areaId: CloseArea["id"], buId: string) => void }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-44 px-2 py-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Business unit</th>
              {matrix.areas.map(({ area, window }) => (
                <th key={area.id} className="px-2 py-1 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">{area.label}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Planned {wdLabel(window.startWd)} to {wdLabel(window.dueWd)}
                    </TooltipContent>
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.units.map((u) => (
              <tr key={u.id}>
                <td className="px-2 py-1 text-sm">{u.name}</td>
                {matrix.areas.map(({ area }) => {
                  const c = matrix.cells[area.id][u.id];
                  const tone = TONE[c.state];
                  return (
                    <td key={area.id} className="p-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            disabled={c.state === "none"}
                            onClick={() => onSelect(area.id, u.id)}
                            aria-label={`${u.name}, ${area.label}: ${tone.label}, ${c.cell.done} of ${c.cell.total}`}
                            className={cn("flex h-11 w-full flex-col items-start justify-center rounded-md px-2.5 text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:shadow-md", tone.cls)}
                          >
                            <span className="text-sm font-medium tnum">{c.state === "none" ? "-" : `${fmtInt(c.cell.done)} of ${fmtInt(c.cell.total)}`}</span>
                            <span className="text-2xs">{tone.label}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {u.name}, {area.label}: {fmtInt(c.cell.done)} of {fmtInt(c.cell.total)} done at {wdLabel(wd)}
                          {c.cell.openValue > 0 ? `, ${fmtINRCompact(c.cell.openValue)} still open` : ""}
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

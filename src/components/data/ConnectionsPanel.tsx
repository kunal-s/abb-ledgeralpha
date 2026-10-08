import { CheckCircle2, Circle } from "lucide-react";
import { Panel } from "@/components/vocab";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TENANT } from "@/config/tenant";
import { WRITE_BACK_POLICY } from "@/config/policies";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SourceDataset } from "@/types";

const MODES: { id: "demo" | "masked" | "live"; label: string; tip: string }[] = [
  { id: "demo", label: "Structure only", tip: "Field names, templates and a synthetic dataset built to the same fields, ageing bands and layouts." },
  { id: "masked", label: "Masked sample", tip: "A small extract with party names replaced, amounts scaled and sensitive identifiers removed." },
  { id: "live", label: "Live connection", tip: "Read access to the source systems. Nothing is written back without an approved proposal." },
];

/** Where the data comes from, which mode the workspace runs in, and how approved work leaves the platform. */
export function ConnectionsPanel({ datasets }: { datasets: SourceDataset[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
      <Panel title="Source systems" className="xl:col-span-3" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {TENANT.sourceSystems.map((name, i) => {
            const mine = datasets.filter((d) => d.sourceSystem === name);
            const role = TENANT.sourceRoles[i];
            return (
              <li key={name} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-2xs font-medium text-secondary-foreground">{role?.role}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">{role?.scope}</div>
                </div>
                <div className="text-right text-xs tnum text-muted-foreground">
                  <div className="text-sm font-medium text-foreground">{fmtInt(mine.reduce((s, d) => s + d.records, 0))}</div>
                  <div>{mine.length} {mine.length === 1 ? "dataset" : "datasets"}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Data mode and write-back" className="xl:col-span-2">
        <ol className="space-y-2">
          {MODES.map((m) => {
            const on = m.id === TENANT.dataMode;
            return (
              <Tooltip key={m.id}>
                <TooltipTrigger asChild>
                  <li className={cn("flex items-center gap-2.5 text-sm", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {on ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
                    {m.label}
                  </li>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">{m.tip}</TooltipContent>
              </Tooltip>
            );
          })}
        </ol>
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground">Write-back</div>
          <div className="mt-1 text-sm font-medium">{WRITE_BACK_POLICY.label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Only after a different person approves</div>
        </div>
      </Panel>
    </div>
  );
}

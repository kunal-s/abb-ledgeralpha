import { ArrowRight, CheckCircle2, Database, XCircle } from "lucide-react";
import type { DataQualityCheck, SourceDataset } from "@/types";
import { fmtInt } from "@/lib/format";
import { cn } from "@/lib/utils";

interface SourceFlowProps {
  datasets: SourceDataset[];
  checks: DataQualityCheck[];
  ledger: { label: string; value: number }[];
}

/** Sources → validation → ledger: where the data came from and what landed. */
export function SourceFlow({ datasets, checks, ledger }: SourceFlowProps) {
  const systems = [...new Set(datasets.map((d) => d.sourceSystem))].map((name) => {
    const ds = datasets.filter((d) => d.sourceSystem === name);
    return { name, datasets: ds, records: ds.reduce((s, d) => s + d.records, 0) };
  });
  const maxRecords = Math.max(...systems.map((s) => s.records));
  const passed = checks.filter((c) => c.exceptions === 0).length;
  const allPassed = passed === checks.length;

  return (
    <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[minmax(0,1.5fr)_auto_minmax(0,0.8fr)_auto_minmax(0,1.2fr)]">
      {/* Sources */}
      <div className="space-y-2">
        {systems.map((s) => (
          <div key={s.name} className="rounded-md border border-border bg-background px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="tnum text-xs text-muted-foreground">{fmtInt(s.records)}</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-muted">
              <div className="h-1 rounded-full bg-primary/70" style={{ width: `${Math.max(2, (s.records / maxRecords) * 100)}%` }} />
            </div>
            <div className="mt-1 truncate text-2xs text-muted-foreground">{s.datasets.map((d) => d.name).join(" · ")}</div>
          </div>
        ))}
      </div>

      <div className="hidden items-center lg:flex">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Validation */}
      <div className="flex flex-col justify-center rounded-md border border-border bg-background p-4">
        <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Validation</div>
        <div className="mt-2 flex items-center gap-2">
          {allPassed ? <CheckCircle2 className="h-5 w-5 text-ok" /> : <XCircle className="h-5 w-5 text-danger" />}
          <span className="tnum text-2xl font-semibold">
            {passed}/{checks.length}
          </span>
        </div>
        <div className={cn("mt-1 text-xs", allPassed ? "text-ok-foreground" : "text-danger-foreground")}>
          {allPassed ? "Checks passed" : `${checks.length - passed} checks with exceptions`}
        </div>
        <div className="mt-3 space-y-1">
          {checks.slice(0, 4).map((c) => (
            <div key={c.id} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.exceptions === 0 ? "bg-ok" : "bg-danger")} />
              <span className="truncate">{c.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden items-center lg:flex">
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Ledger */}
      <div className="rounded-md border border-primary/30 bg-primary/[0.03] p-4">
        <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Ledger</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
          {ledger.map((s) => (
            <div key={s.label}>
              <dt className="text-2xs text-muted-foreground">{s.label}</dt>
              <dd className="tnum text-base font-semibold">{fmtInt(s.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, StatusChip } from "@/components/vocab";
import { INCREMENTS, screenForPath, type ScreenDef } from "@/lib/screens";
import { cn } from "@/lib/utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="text-foreground">{children}</div>
    </div>
  );
}

/** The build plan, shown on the landing route while the scaffold is under review. */
function BuildPlan() {
  return (
    <Card>
      <CardHeader className="border-b border-border/70 py-2.5">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Build plan · docs/FRD.md §16
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/70 p-0">
        {INCREMENTS.map((inc) => (
          <div key={inc.id} className="grid grid-cols-[3rem_14rem_1fr_auto] items-start gap-3 px-4 py-2.5 text-sm">
            <span className="font-mono text-xs text-muted-foreground">{inc.id}</span>
            <span className="font-medium">{inc.title}</span>
            <span className="text-muted-foreground">
              {inc.scope}
              {inc.gatedBy && (
                <span className="mt-0.5 block text-2xs text-muted-foreground/80">Gated by: {inc.gatedBy}</span>
              )}
            </span>
            <StatusChip status={inc.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Placeholder for every registered screen until its increment is built.
 * Shows the screen's contract from the FRD so the scaffold can be reviewed
 * against the requirements before any feature work starts.
 */
export function ScreenPlaceholder() {
  const { pathname } = useLocation();
  const screen = screenForPath(pathname) as ScreenDef;
  const Icon = screen.icon;

  return (
    <div className="space-y-5">
      <PageHeader
        title={screen.title}
        description={screen.purpose}
        icon={<Icon className="h-5 w-5" />}
        badge={<StatusChip status={screen.status} />}
      />

      <Card className={cn("border-dashed", screen.status === "blocked" && "border-warn/60")}>
        <CardContent className="flex gap-4 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <Construction className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 divide-y divide-border/70">
            <Field label="Screen">{screen.id}</Field>
            <Field label="FRD reference">{screen.frd}</Field>
            {screen.views && <Field label="ABB view">{screen.views.join(", ")}</Field>}
            <Field label="Leads with">{screen.leadVisual}</Field>
            <Field label="Increment">{screen.increment}</Field>
            {screen.blockedBy && <Field label="Waiting on">{screen.blockedBy}</Field>}
          </div>
        </CardContent>
      </Card>

      {screen.path === "/" && <BuildPlan />}
    </div>
  );
}

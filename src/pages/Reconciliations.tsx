import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WORLD } from "@/data";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { OverviewTab } from "@/pages/recon/OverviewTab";
import { RegisterTab } from "@/pages/recon/RegisterTab";
import { StatementsTab } from "@/pages/recon/StatementsTab";
import { DecisionsTab } from "@/pages/recon/DecisionsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "register", label: "Register" },
  { key: "statements", label: "Statements" },
  { key: "decisions", label: "Decisions" },
] as const;

export function Reconciliations() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const setPeriodEnd = usePeriodStore((s) => s.setPeriodEnd);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";

  // reconciliations are prepared for the loaded period only
  if (periodEnd !== WORLD.asOf) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reconciliations" />
        <Card className="flex items-center justify-between gap-4 p-5 text-sm">
          <span>Reconciliations are prepared for {fmtMonth(WORLD.asOf)}. The selected period is {fmtMonth(periodEnd)}.</span>
          <Button size="sm" onClick={() => setPeriodEnd(WORLD.asOf)}>
            Switch to {fmtMonth(WORLD.asOf)}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Reconciliations" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "overview" ? null : v }, { replace: false })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="register">
          <RegisterTab />
        </TabsContent>
        <TabsContent value="statements">
          <StatementsTab />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

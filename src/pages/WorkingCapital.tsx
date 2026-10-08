import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WORLD } from "@/data";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { OverviewTab } from "@/pages/wc/OverviewTab";
import { DrillTab } from "@/pages/wc/DrillTab";
import { MsmeTab } from "@/pages/wc/MsmeTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "receivables", label: "Receivables" },
  { key: "payables", label: "Payables" },
  { key: "msme", label: "Supplier payment window" },
] as const;

export function WorkingCapital() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const setPeriodEnd = usePeriodStore((s) => s.setPeriodEnd);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";

  // balances are complete for the loaded period only
  if (periodEnd !== WORLD.asOf) {
    return (
      <div className="space-y-4">
        <PageHeader title="Working Capital" />
        <Card className="flex items-center justify-between gap-4 p-5 text-sm">
          <span>
            Working capital is read at {fmtMonth(WORLD.asOf)}. The selected period is {fmtMonth(periodEnd)}.
          </span>
          <Button size="sm" onClick={() => setPeriodEnd(WORLD.asOf)}>
            Switch to {fmtMonth(WORLD.asOf)}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Working Capital" />
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
        <TabsContent value="receivables">
          <DrillTab side="receivables" />
        </TabsContent>
        <TabsContent value="payables">
          <DrillTab side="payables" />
        </TabsContent>
        <TabsContent value="msme">
          <MsmeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

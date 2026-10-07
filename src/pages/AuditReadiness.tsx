import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { usePeriodStore, useScopeStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { fmtMonth } from "@/lib/dates";
import { OverviewTab } from "@/pages/audit/OverviewTab";
import { RequestsTab } from "@/pages/audit/RequestsTab";
import { SchedulesTab } from "@/pages/audit/SchedulesTab";
import { EvidenceTab } from "@/pages/audit/EvidenceTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "requests", label: "Requests" },
  { key: "schedules", label: "Schedules" },
  { key: "evidence", label: "Evidence" },
] as const;

export function AuditReadiness() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const setPeriodEnd = usePeriodStore((s) => s.setPeriodEnd);
  const businessUnitId = useScopeStore((s) => s.businessUnitId);
  const setBusinessUnit = useScopeStore((s) => s.setBusinessUnit);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";

  // the auditor reviews the whole company for the loaded period
  const wrongPeriod = periodEnd !== WORLD.asOf;
  const wrongScope = businessUnitId !== "all";
  if (wrongPeriod || wrongScope) {
    return (
      <div className="space-y-4">
        <PageHeader title="Audit Readiness" />
        <Card className="flex items-center justify-between gap-4 p-5 text-sm">
          <span>
            {wrongPeriod
              ? `Audit readiness is prepared for ${fmtMonth(WORLD.asOf)}. The selected period is ${fmtMonth(periodEnd)}.`
              : `Audit readiness covers all of ${TENANT.workspace}. The scope is set to ${TENANT.businessUnits.find((b) => b.id === businessUnitId)?.name ?? businessUnitId}.`}
          </span>
          <Button size="sm" onClick={() => (wrongPeriod ? setPeriodEnd(WORLD.asOf) : setBusinessUnit("all"))}>
            {wrongPeriod ? `Switch to ${fmtMonth(WORLD.asOf)}` : "Switch to all business units"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Audit Readiness" />
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
        <TabsContent value="requests">
          <RequestsTab />
        </TabsContent>
        <TabsContent value="schedules">
          <SchedulesTab />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/useQueryParams";
import { OverviewTab } from "@/pages/review/OverviewTab";
import { AccountsTab } from "@/pages/review/AccountsTab";
import { ExceptionsTab } from "@/pages/review/ExceptionsTab";
import { DecisionsTab } from "@/pages/review/DecisionsTab";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "accounts", label: "Accounts" },
  { key: "exceptions", label: "Exceptions" },
  { key: "decisions", label: "Decisions" },
] as const;

export function BalanceSheetReview() {
  const [params, setParams] = useQueryParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";
  return (
    <div className="space-y-4">
      <PageHeader title="Balance Sheet Review" />
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
        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="exceptions">
          <ExceptionsTab />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

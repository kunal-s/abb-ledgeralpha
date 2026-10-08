import { PageHeader } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParams } from "@/lib/useQueryParams";
import { ResultsTab } from "@/pages/mgmt/ResultsTab";
import { ProjectsTab } from "@/pages/mgmt/ProjectsTab";

const TABS = [
  { key: "results", label: "Results" },
  { key: "projects", label: "Projects" },
] as const;

export function ManagementReporting() {
  const [params, setParams] = useQueryParams();
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "results";

  return (
    <div className="space-y-4">
      <PageHeader title="Management Reporting" />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "results" ? null : v }, { replace: false })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="results">
          <ResultsTab />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

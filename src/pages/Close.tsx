import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusChip } from "@/components/vocab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { WORLD } from "@/data";
import { CLOSE_WD_RANGE } from "@/data/workspace/close";
import { usePeriodStore } from "@/lib/stores";
import { useQueryParams } from "@/lib/useQueryParams";
import { useClose } from "@/state/closeHooks";
import { dateOfWd, wdLabel } from "@/lib/workdays";
import { fmtDate, fmtMonth } from "@/lib/dates";
import { OverviewTab } from "@/pages/close/OverviewTab";
import { ChecklistTab } from "@/pages/close/ChecklistTab";
import { TaskBody } from "@/pages/close/TaskSheet";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "checklist", label: "Checklist" },
] as const;

const DAYS = Array.from({ length: CLOSE_WD_RANGE.max - CLOSE_WD_RANGE.min + 1 }, (_, i) => CLOSE_WD_RANGE.min + i);

export function Close() {
  const [params, setParams] = useQueryParams();
  const periodEnd = usePeriodStore((s) => s.periodEnd);
  const setPeriodEnd = usePeriodStore((s) => s.setPeriodEnd);
  const tab = TABS.some((t) => t.key === params.get("tab")) ? params.get("tab")! : "overview";
  const wdParam = params.get("wd");
  const wd = wdParam !== null && /^-?\d+$/.test(wdParam) ? Number(wdParam) : undefined;
  const model = useClose(wd);
  const taskId = params.get("task");

  // the plan is evaluated for the loaded period only
  if (periodEnd !== WORLD.asOf) {
    return (
      <div className="space-y-4">
        <PageHeader title="Close Cockpit" />
        <Card className="flex items-center justify-between gap-4 p-5 text-sm">
          <span>
            The close is planned for {fmtMonth(WORLD.asOf)}. The selected period is {fmtMonth(periodEnd)}.
          </span>
          <Button size="sm" onClick={() => setPeriodEnd(WORLD.asOf)}>
            Switch to {fmtMonth(WORLD.asOf)}
          </Button>
        </Card>
      </div>
    );
  }

  const ev = model.evaluation;
  const slip = ev.projectedClose - model.targetWd;
  const openTask = taskId && ev.byId.has(taskId) ? taskId : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Close Cockpit"
        badge={
          <StatusChip
            status={ev.onTrack ? "on-track" : "behind"}
            label={`${wdLabel(model.currentWd)}${wd !== undefined ? " (read at)" : ""} · ${ev.onTrack ? "on track" : `${slip} ${slip === 1 ? "day" : "days"} behind`}`}
          />
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Read the plan at</span>
            <Select value={wd === undefined ? "today" : String(wd)} onValueChange={(v) => setParams({ wd: v === "today" ? null : v })}>
              <SelectTrigger className="h-8 w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">
                  Today ({wdLabel(model.realWd)}, {fmtDate(model.today)})
                </SelectItem>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {wdLabel(d)}, {fmtDate(dateOfWd(model.periodEnd, d))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "overview" ? null : v }, { replace: false })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab model={model} />
        </TabsContent>
        <TabsContent value="checklist">
          <ChecklistTab model={model} />
        </TabsContent>
      </Tabs>
      <Sheet open={!!openTask} onOpenChange={(o) => !o && setParams({ task: null })}>
        <SheetContent>{openTask && <TaskBody key={openTask} model={model} taskId={openTask} onOpen={(id) => setParams({ task: id })} />}</SheetContent>
      </Sheet>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { fmtDate, daysBetween } from "@/lib/dates";
import type { TimelineEvent } from "@/engine/reviewStory";

const DOT: Record<TimelineEvent["kind"], string> = {
  document: "bg-foreground",
  activity: "bg-muted-foreground",
  review: "bg-primary",
  asat: "border-2 border-primary bg-card",
};

/** A vertical rail of dated events with the days that passed between them: shows at a glance how long nothing happened. */
export function ItemTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="relative ml-1.5 border-l border-border pl-5">
      {events.map((e, i) => {
        const gap = i > 0 ? daysBetween(events[i - 1].date, e.date) : 0;
        return (
          <li key={`${e.date}-${e.label}-${i}`} className={cn("relative pb-3 last:pb-0", gap > 90 && "pt-2")}>
            <span className={cn("absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full", DOT[e.kind])} />
            {gap > 0 && <div className="-mt-1 mb-1 text-2xs text-muted-foreground tnum">{gap} days later{gap > 180 ? ", nothing recorded in between" : ""}</div>}
            <div className="flex items-baseline justify-between gap-3">
              <span className={cn("text-sm", e.kind === "asat" && "font-medium")}>{e.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tnum">{fmtDate(e.date)}</span>
            </div>
            {e.detail && <div className="text-xs text-muted-foreground">{e.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}

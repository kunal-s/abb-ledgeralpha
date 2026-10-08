import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildThreads } from "@/data/workspace/threads";
import { useStory } from "@/state/story";
import { useItemDrawer } from "@/state/drawer";
import { useRoleStore } from "@/lib/stores";
import { ROLES } from "@/config/roles";
import { cn } from "@/lib/utils";

/** The walkthrough bar: where the presenter is in a thread, and the way to the next screen. */
export function StoryBar() {
  const { threadId, step, go, exit } = useStory();
  const navigate = useNavigate();
  const location = useLocation();
  const threads = useMemo(() => buildThreads(), []);
  const thread = threads.find((t) => t.id === threadId);
  const current = thread?.steps[step];
  const role = useRoleStore((s) => s.role);
  const setRole = useRoleStore((s) => s.setRole);

  // arriving at a step: act as the right role, show the right screen, open the item
  useEffect(() => {
    if (!thread || !current) return;
    setRole(current.role ?? thread.role);
    const here = location.pathname + location.search;
    if (here !== current.to) navigate(current.to);
    if (current.item) useItemDrawer.getState().open(current.item);
    else useItemDrawer.getState().close();
    // only when the step changes, not on every navigation inside it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, step]);

  useEffect(() => {
    if (!thread) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" && step < thread.steps.length - 1) go(step + 1);
      if (e.key === "ArrowLeft" && step > 0) go(step - 1);
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thread, step, go, exit]);

  if (!thread || !current) return null;
  const last = step === thread.steps.length - 1;
  return (
    <div className="pointer-events-none fixed bottom-5 left-60 z-[60] px-4">
      <div className="anim-rise pointer-events-auto w-[560px] max-w-[calc(100vw-17rem)] rounded-md border border-border bg-card shadow-lg">
        <div className="flex items-center gap-1 px-4 pt-3">
          {thread.steps.map((s, i) => (
            <button key={s.title} type="button" aria-label={`Step ${i + 1}: ${s.title}`} onClick={() => go(i)} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-2.5">
          <div className="min-w-0">
            <div className="text-2xs font-medium uppercase tracking-[0.06em] text-muted-foreground tabular-nums">
              {thread.title} · {step + 1} of {thread.steps.length} · as {ROLES[role].label}
            </div>
            <div className="mt-0.5 text-sm font-semibold">{current.title}</div>
            <div className="text-xs text-muted-foreground">{current.hint}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={step === 0} onClick={() => go(step - 1)} aria-label="Previous step">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={() => (last ? exit() : go(step + 1))}>
              {last ? "Finish" : "Next"} {!last && <ChevronRight className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={exit} aria-label="End the walkthrough">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

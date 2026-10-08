import { useMemo } from "react";
import { Play } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { buildThreads } from "@/data/workspace/threads";
import { useStory } from "@/state/story";

/** The walkthroughs a presenter can start. Shown only in a demo or masked workspace. */
export function StoryMenu() {
  const threads = useMemo(() => buildThreads(), []);
  const { threadId, start } = useStory();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-8 items-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-2.5 text-sm font-medium transition-colors hover:border-primary/40">
          <Play className="h-3.5 w-3.5 text-primary" />
          <span className="hidden lg:inline">Walkthrough</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Walkthroughs</DropdownMenuLabel>
        {threads.map((t) => (
          <DropdownMenuItem key={t.id} onClick={() => start(t.id)} className="flex-col items-start gap-0.5 py-2">
            <span className="flex w-full items-center justify-between text-sm font-medium">
              {t.title}
              <span className="text-2xs font-normal text-muted-foreground tabular-nums">{threadId === t.id ? "in progress" : `${t.steps.length} steps`}</span>
            </span>
            <span className="text-xs text-muted-foreground">{t.summary}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

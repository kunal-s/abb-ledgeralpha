import { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/Toaster";
import { ItemDrawer } from "@/components/review/ItemDrawer";
import { ReviewProvider } from "@/state/ReviewContext";
import { setItemNavigator } from "@/state/drawer";
import { useStory } from "@/state/story";
import { cn } from "@/lib/utils";
import { StoryBar } from "@/components/shell/StoryBar";
import { TruncationTooltip } from "@/components/shell/TruncationTooltip";

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const storyOpen = useStory((s) => !!s.threadId);
  // the floating story bar never hides page content: leave room to scroll it clear
  const reserve = storyOpen ? "pb-36" : "";
  useEffect(() => {
    setItemNavigator((to) => navigate(to));
    return () => setItemNavigator(undefined);
  }, [navigate]);
  return (
    <TooltipProvider delayDuration={150}>
      <ReviewProvider>
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <ScrollArea className="flex-1">
              <main className={cn("mx-auto w-full max-w-[1600px] px-6 py-5", reserve)}>
                <div key={pathname} className="anim-rise">
                  <Outlet />
                </div>
              </main>
            </ScrollArea>
          </div>
          <ItemDrawer />
          <Toaster />
          <StoryBar />
          <TruncationTooltip />
        </div>
      </ReviewProvider>
    </TooltipProvider>
  );
}

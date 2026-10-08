import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/Toaster";
import { ItemDrawer } from "@/components/review/ItemDrawer";
import { ReviewProvider } from "@/state/ReviewContext";
import { StoryBar } from "@/components/shell/StoryBar";
import { TruncationTooltip } from "@/components/shell/TruncationTooltip";

export function AppShell() {
  const { pathname } = useLocation();
  return (
    <TooltipProvider delayDuration={150}>
      <ReviewProvider>
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <ScrollArea className="flex-1">
              <main className="mx-auto w-full max-w-[1600px] px-6 py-5">
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

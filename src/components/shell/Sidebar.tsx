import { NavLink } from "react-router-dom";
import { Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NAV_GROUPS, SCREENS, type ScreenDef } from "@/lib/screens";
import { DEMO } from "@/config/demo";

function NavRow({ screen }: { screen: ScreenDef }) {
  const Icon = screen.icon;
  return (
    <NavLink
      to={screen.path}
      end={screen.path === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : "text-slate-600 hover:bg-accent hover:text-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-primary" : "text-slate-400 group-hover:text-slate-600"
            )}
          />
          <span className="flex-1 truncate">{screen.navLabel}</span>
          {/* Scaffold-phase build marker; remove once every screen is built. */}
          {screen.status !== "built" && (
            <span
              title={screen.status === "blocked" ? `Waiting on ${screen.blockedBy}` : `Planned · ${screen.increment}`}
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                screen.status === "blocked" ? "bg-warn" : "bg-slate-300"
              )}
            />
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const inNav = SCREENS.filter((s) => s.navLabel);
  const top = inNav.filter((s) => s.group === null);
  const bottom = inNav.filter((s) => s.group === "bottom");

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Hexagon className="h-4 w-4" fill="currentColor" />
        </div>
        <div className="leading-none">
          <div className="text-sm font-semibold tracking-tight">{DEMO.product}</div>
          <div className="mt-0.5 text-2xs text-muted-foreground">ABB India · GL Scrutiny</div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-2.5">
          {top.map((s) => (
            <NavRow key={s.path} screen={s} />
          ))}
          {NAV_GROUPS.map((group) => (
            <div key={group} className="mt-3">
              <div className="px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-slate-400">
                {group}
              </div>
              <div className="flex flex-col gap-0.5">
                {inNav
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <NavRow key={s.path} screen={s} />
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className="flex flex-col gap-0.5 border-t border-border p-2.5">
        {bottom.map((s) => (
          <NavRow key={s.path} screen={s} />
        ))}
      </div>
    </aside>
  );
}

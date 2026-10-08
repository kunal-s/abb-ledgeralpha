import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ChevronDown, Hexagon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ENABLED_MODULES, NAV_GROUPS, type ModuleDef, type ModuleGroup } from "@/lib/modules";

function NavRow({ module }: { module: ModuleDef }) {
  const Icon = module.icon;
  return (
    <NavLink
      to={module.path}
      end={module.path === "/"}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground/75 hover:bg-accent hover:text-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0",
              isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          <span className="flex-1 truncate">{module.label}</span>
        </>
      )}
    </NavLink>
  );
}

function Group({ group, modules }: { group: ModuleGroup; modules: ModuleDef[] }) {
  const [open, setOpen] = useState(true);
  if (modules.length === 0) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2.5 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {group}
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="flex flex-col gap-0.5">
          {modules.map((m) => (
            <NavRow key={m.id} module={m} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const top = ENABLED_MODULES.filter((m) => m.group === null);
  const bottom = ENABLED_MODULES.filter((m) => m.group === "bottom");

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Hexagon className="h-4 w-4" fill="currentColor" />
        </div>
        <div className="text-sm font-semibold tracking-tight">LedgerAlpha</div>
      </div>

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-0.5 p-2.5">
          {top.map((m) => (
            <NavRow key={m.id} module={m} />
          ))}
          {NAV_GROUPS.map((g) => (
            <Group key={g} group={g} modules={ENABLED_MODULES.filter((m) => m.group === g)} />
          ))}
        </nav>
      </ScrollArea>

      <div className="flex flex-col gap-0.5 border-t border-border p-2.5">
        {bottom.map((m) => (
          <NavRow key={m.id} module={m} />
        ))}
      </div>
    </aside>
  );
}

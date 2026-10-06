import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface ActivityRowProps {
  icon?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  time?: string;
  right?: ReactNode;
  className?: string;
  onClick?: () => void;
}

/** A single dense activity / feed row. */
export function ActivityRow({
  icon,
  title,
  meta,
  time,
  right,
  className,
  onClick,
}: ActivityRowProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0",
        onClick && "cursor-pointer transition-colors hover:bg-accent/50",
        className
      )}
    >
      {icon && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm leading-tight text-foreground">
          {title}
        </div>
        {meta && (
          <div className="mt-0.5 truncate text-2xs text-muted-foreground">
            {meta}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {right}
        {time && (
          <span className="w-16 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
            {time}
          </span>
        )}
      </div>
    </div>
  );
}

import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ConfidenceChipProps {
  /** 0..1 confidence score */
  score: number;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "xs";
}

function tone(score: number) {
  if (score >= 0.95) return "ok";
  if (score >= 0.85) return "info";
  if (score >= 0.7) return "warn";
  return "danger";
}

/** Confidence chip — every agent-touched figure carries one (A4). */
export function ConfidenceChip({
  score,
  className,
  showIcon = true,
  size = "xs",
}: ConfidenceChipProps) {
  const t = tone(score);
  const toneCls = {
    ok: "bg-ok-subtle text-ok-foreground",
    info: "bg-info-subtle text-info-foreground",
    warn: "bg-warn-subtle text-warn-foreground",
    danger: "bg-danger-subtle text-danger-foreground",
  }[t];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium tnum",
            size === "xs" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs",
            toneCls,
            className
          )}
        >
          {showIcon && <Sparkles className="h-2.5 w-2.5" />}
          {(score * 100).toFixed(1)}%
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Confidence {(score * 100).toFixed(1)}% — derived from the evidence
        factors shown with this recommendation.
      </TooltipContent>
    </Tooltip>
  );
}

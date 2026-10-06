import { cn } from "@/lib/utils";
import { Binary, BrainCircuit } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { MethodKind } from "@/types";

/** How a figure was produced — the deterministic / judgement seam. */
export type { MethodKind };

interface MethodBadgeProps {
  method: MethodKind;
  /** 0..1 — shown only for judgement (never for deterministic). */
  confidence?: number;
  /** default true; set false to show the judgement marker without a score. */
  showConfidence?: boolean;
  size?: "xs" | "sm";
  className?: string;
}

/**
 * MethodBadge — the visible line between deterministic output (rules &
 * arithmetic, reproducible without model weights) and model judgement
 * (inferred; confidence shown). Placed wherever an agent-touched figure
 * appears. Confidence renders ONLY on judgement — that asymmetry is the
 * honesty marker. This is method, not status, so it uses a neutral vs. info
 * treatment rather than the status palette.
 */
export function MethodBadge({
  method,
  confidence,
  showConfidence = true,
  size = "xs",
  className,
}: MethodBadgeProps) {
  const det = method === "deterministic";
  const Icon = det ? Binary : BrainCircuit;
  const label = det ? "Deterministic" : "Judgement";
  const toneCls = det
    ? "bg-secondary text-muted-foreground border border-border"
    : "bg-info-subtle text-info-foreground";
  const tip = det
    ? "Deterministic — rules and arithmetic (ageing, thresholds, counter-item matching, 26AS lookup). Same input, same result, every time."
    : "Judgement — a recommendation weighed from evidence (proposed action, drafted commentary). Confidence is derived from the evidence factors shown with it.";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md font-medium",
            size === "xs" ? "px-1.5 py-0.5 text-2xs" : "px-2 py-0.5 text-xs",
            toneCls,
            className
          )}
        >
          <Icon className="h-2.5 w-2.5" />
          {label}
          {!det && showConfidence && confidence != null && (
            <span className="tnum opacity-80">
              {(confidence * 100).toFixed(1)}%
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

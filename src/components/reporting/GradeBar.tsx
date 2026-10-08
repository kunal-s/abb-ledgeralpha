// A measure graded against the policy: the value, a bar scaled to a maximum
// with a tick at the reference (the company), and the grade in words. The
// colour carries the state and the word repeats it.

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GRADE_LABEL, type Grade } from "@/engine/workingCapital";
import { cn } from "@/lib/utils";

const FILL: Record<Grade, string> = { ok: "bg-primary/45", watch: "bg-warn", act: "bg-danger" };
const CHIP: Record<Grade, "default" | "warn" | "danger"> = { ok: "default", watch: "warn", act: "danger" };

interface GradeBarProps {
  value: number;
  max: number;
  /** a reference on the same scale, drawn as a tick */
  mark?: number;
  grade: Grade;
  /** the value as text */
  text: string;
  /** the explanation on hover */
  hint: string;
}

export function GradeBar({ value, max, mark, grade, text, hint }: GradeBarProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-end gap-2.5">
          <span className="tnum w-14 whitespace-nowrap text-right text-sm font-medium">{text}</span>
          <div className="relative h-2 w-16 shrink-0 rounded-full bg-muted">
            <div className={cn("h-full rounded-full", FILL[grade])} style={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%` }} />
            {mark !== undefined && <div className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/70" style={{ left: `${Math.min(100, (mark / max) * 100)}%` }} />}
          </div>
          <Badge variant={CHIP[grade]} className="w-[4.25rem] justify-center">
            {GRADE_LABEL[grade]}
          </Badge>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{hint}</TooltipContent>
    </Tooltip>
  );
}

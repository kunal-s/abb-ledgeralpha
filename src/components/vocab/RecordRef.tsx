import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RecordRefProps {
  /** the full coded identifier, e.g. "REC-125000-CG-CMT-US-05" */
  refId: string;
  /** middle-truncate long refs to head…tail; full value on hover (default true) */
  truncate?: boolean;
  className?: string;
}

/** Middle-truncate a long identifier: keep the leading token and trailing suffix. */
function middleTruncate(id: string, head = 10, tail = 5): string {
  if (id.length <= head + tail + 1) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

/**
 * RecordRef — de-emphasised coded identifier for tabular and header use. Rows
 * lead with the business object; the coded reference sits here as a muted,
 * monospace secondary element with hover-to-see-full and click-to-copy. Kept
 * present for traceability and audit, never the visual anchor.
 */
export function RecordRef({ refId, truncate = true, className }: RecordRefProps) {
  const [copied, setCopied] = useState(false);
  const shown = truncate ? middleTruncate(refId) : refId;

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(refId).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {}
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${refId}`}
          className={cn(
            "group/ref inline-flex items-center gap-1 font-mono text-2xs text-muted-foreground/80 transition-colors hover:text-foreground",
            className
          )}
        >
          <span className="tracking-tight">{shown}</span>
          {copied ? (
            <Check className="h-2.5 w-2.5 text-ok-foreground" />
          ) : (
            <Copy className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/ref:opacity-60" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent className="font-mono text-2xs">
        {refId} · click to copy
      </TooltipContent>
    </Tooltip>
  );
}

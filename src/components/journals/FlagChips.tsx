import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JOURNAL_CHECKS, type JournalFlag } from "@/engine/journalReview";

/** The checks that flagged a journal; the reason is on hover. Neutral colour: a flag is a reason to look, not a state. */
export function FlagChips({ flags }: { flags: JournalFlag[] }) {
  if (!flags.length) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => {
        const check = JOURNAL_CHECKS.find((c) => c.id === f.checkId);
        return (
          <Tooltip key={f.checkId}>
            <TooltipTrigger asChild>
              <span className="cursor-default rounded-md bg-secondary px-1.5 py-0.5 font-mono text-2xs text-secondary-foreground">{f.checkId}</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-80">
              <div className="font-medium">{check?.name}</div>
              <div className="text-muted-foreground">{f.reason}</div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

/** Accessible on/off switch (button role="switch"). */
export function Switch({ checked, onCheckedChange, disabled, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input",
        className
      )}
    >
      <span className={cn("inline-block h-3 w-3 rounded-full bg-card shadow transition-transform", checked ? "translate-x-3.5" : "translate-x-0.5")} />
    </button>
  );
}

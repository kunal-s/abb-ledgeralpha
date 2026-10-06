import { useToastStore, type ToastTone } from "@/lib/toast";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const toneMap: Record<
  ToastTone,
  { icon: typeof Info; cls: string; accent: string }
> = {
  default: { icon: Info, cls: "text-foreground", accent: "bg-primary" },
  ok: { icon: CheckCircle2, cls: "text-ok-foreground", accent: "bg-ok" },
  warn: { icon: AlertTriangle, cls: "text-warn-foreground", accent: "bg-warn" },
  danger: { icon: XCircle, cls: "text-danger-foreground", accent: "bg-danger" },
  info: { icon: Info, cls: "text-info-foreground", accent: "bg-info" },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const { icon: Icon, cls, accent } = toneMap[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-in slide-in-from-bottom-2 fade-in overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            <div className={cn("w-1 shrink-0", accent)} />
            <div className="flex flex-1 items-start gap-2.5 p-3">
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} />
              <div className="flex-1">
                <div className="text-sm font-medium leading-tight">
                  {t.title}
                </div>
                {t.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

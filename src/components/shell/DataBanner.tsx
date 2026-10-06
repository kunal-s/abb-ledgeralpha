import { FlaskConical } from "lucide-react";
import { DEMO } from "@/config/demo";
import { fmtDate } from "@/lib/dates";

/**
 * DataBanner — always-visible statement of what data is on screen (FRD
 * FR-PLT-04). Synthetic data must never be mistaken for ABB's books.
 */
export function DataBanner() {
  const synthetic = DEMO.dataMode === "synthetic";
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 whitespace-nowrap border-b border-border bg-info-subtle/60 px-4 text-2xs text-info-foreground">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium">
        {synthetic ? "Synthetic data" : "Masked ABB extract"}
      </span>
      <span className="min-w-0 truncate text-info-foreground/80">
        {synthetic
          ? "· built on the SAP Central Finance line-item layout (FBL3N) · no ABB values"
          : "· names and identifiers masked, amounts scaled"}
        {" · amounts in ₹ · as at "}
        {fmtDate(DEMO.period.asOf)}
      </span>
      <span className="ml-auto hidden text-info-foreground/70 lg:inline">Dataset loads in increment I1</span>
    </div>
  );
}

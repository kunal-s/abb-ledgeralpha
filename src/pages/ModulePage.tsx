import { useLocation, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/vocab";
import { resolvePath } from "@/lib/modules";

function Block({ className }: { className: string }) {
  return <div className={`rounded-md bg-muted ${className}`} />;
}

/**
 * Scaffold page for a module that is not built yet: the module's title and
 * the standard page anatomy (KPI row → lead visual → detail table), empty.
 * Replaced module by module as each is built (docs/FRD.md §13).
 */
export function ModulePage() {
  const { pathname } = useLocation();
  const params = useParams();
  const resolved = resolvePath(pathname);
  if (!resolved) return null;
  const { module, detail } = resolved;
  const paramValue = Object.values(params)[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title={detail ? `${detail.title} ${paramValue ?? ""}`.trim() : module.label}
        breadcrumbs={detail ? [{ label: module.label, to: module.path }, { label: paramValue ?? "" }] : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="space-y-2 p-4">
            <Block className="h-3 w-24" />
            <Block className="h-6 w-32" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <Block className="h-3 w-40" />
          <Block className="mt-4 h-56 w-full" />
        </Card>
        <Card className="space-y-3 p-4">
          <Block className="h-3 w-32" />
          {[0, 1, 2, 3, 4].map((i) => (
            <Block key={i} className="h-8 w-full" />
          ))}
        </Card>
      </div>

      <Card className="space-y-2 p-4">
        <Block className="h-3 w-48" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Block key={i} className="h-7 w-full" />
        ))}
      </Card>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/vocab";

export function NotFound() {
  return (
    <div className="space-y-5">
      <PageHeader title="Page not found" description="This route is not part of the prototype." />
      <Card className="p-5 text-sm">
        <Link to="/" className="font-medium text-primary hover:underline">
          Back to Review Overview
        </Link>
      </Card>
    </div>
  );
}

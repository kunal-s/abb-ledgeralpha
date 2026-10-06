import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/vocab";

export function NotFound() {
  return (
    <div className="space-y-4">
      <PageHeader title="Page not found" />
      <Card className="p-5 text-sm">
        <Link to="/" className="font-medium text-primary hover:underline">
          Go to Home
        </Link>
      </Card>
    </div>
  );
}

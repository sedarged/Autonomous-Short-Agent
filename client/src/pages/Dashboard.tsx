import { QuickCreate } from "@/components/QuickCreate";
import { JobsTable } from "@/components/JobsTable";

export default function Dashboard() {
  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto" data-testid="dashboard-page">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Create AI-generated short videos across multiple content types
        </p>
      </div>

      {/* Quick Create Section */}
      <QuickCreate />

      {/* Recent Jobs Section */}
      <JobsTable />
    </div>
  );
}

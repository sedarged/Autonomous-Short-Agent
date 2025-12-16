import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Grid3X3, List, Filter } from "lucide-react";
import { JobCard, JobCardSkeleton } from "./JobCard";
import type { Job, JobStep, ContentType, JobStatus } from "@shared/schema";
import { contentTypes, contentTypeInfo, jobStatuses } from "@shared/schema";

interface JobsTableProps {
  limit?: number;
}

export function JobsTable({ limit }: JobsTableProps) {
  const [filterContentType, setFilterContentType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const queryParams = new URLSearchParams();
  if (filterContentType !== "all") queryParams.set("contentType", filterContentType);
  if (filterStatus !== "all") queryParams.set("status", filterStatus);
  if (limit) queryParams.set("limit", limit.toString());
  const queryString = queryParams.toString();
  const apiUrl = queryString ? `/api/jobs?${queryString}` : "/api/jobs";

  const { data: jobs, isLoading, refetch, isFetching } = useQuery<(Job & { steps: JobStep[] })[]>({
    queryKey: [apiUrl],
    refetchInterval: 15000, // Poll every 15 seconds
  });

  const hasFilters = filterContentType !== "all" || filterStatus !== "all";

  return (
    <Card data-testid="jobs-table">
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            Recent Videos
            {isFetching && !isLoading && (
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </CardTitle>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* Content Type Filter */}
            <Select value={filterContentType} onValueChange={setFilterContentType}>
              <SelectTrigger className="w-40" data-testid="filter-content-type">
                <Filter className="w-4 h-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {contentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {contentTypeInfo[type].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-36" data-testid="filter-status">
                <SelectValue placeholder="All status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {jobStatuses.map((status) => (
                  <SelectItem key={status} value={status} className="capitalize">
                    {status.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-lg p-0.5">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("grid")}
                data-testid="button-view-grid"
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>

            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className={`grid gap-4 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"}`}>
            {[...Array(8)].map((_, i) => (
              <JobCardSkeleton key={i} />
            ))}
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className={`grid gap-4 ${viewMode === "grid" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"}`}>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <EmptyState hasFilters={hasFilters} onClearFilters={() => {
            setFilterContentType("all");
            setFilterStatus("all");
          }} />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasFilters, onClearFilters }: { hasFilters: boolean; onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="empty-state">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Grid3X3 className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">
        {hasFilters ? "No matching videos" : "No videos yet"}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-4">
        {hasFilters 
          ? "Try adjusting your filters to find what you're looking for."
          : "Create your first video using the Quick Create panel above."}
      </p>
      {hasFilters && (
        <Button variant="outline" onClick={onClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

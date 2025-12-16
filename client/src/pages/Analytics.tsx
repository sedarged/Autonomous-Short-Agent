import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Video, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp,
  Zap,
  BarChart3,
  Calendar,
  DollarSign
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

interface AnalyticsData {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  processingJobs: number;
  successRate: number;
  avgDurationSeconds: number;
  avgProcessingTimeMinutes: number;
  contentTypeBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  last7Days: { date: string; count: number }[];
  totalVideoDurationMinutes: number;
  totalEstimatedCost: number;
  avgCostPerVideo: number;
}

const contentTypeLabels: Record<string, string> = {
  reddit_story: "Reddit Story",
  aita_story: "AITA Story",
  two_sentence_horror: "2-Sentence Horror",
  short_story_generic: "Short Story",
  would_you_rather: "Would You Rather",
  this_or_that: "This or That",
  quiz_trivia: "Quiz/Trivia",
  riddles: "Riddles",
  guessing_game: "Guessing Game",
  facts: "Facts",
  top_list: "Top List",
  motivation: "Motivation",
  affirmations: "Affirmations",
  language_mini_lesson: "Language Lesson",
  mini_history: "Mini History",
  science_mini_fact: "Science Fact",
};

function StatCard({ 
  title, 
  value, 
  description, 
  icon: Icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  description?: string; 
  icon: typeof Video;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card data-testid={`stat-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function Analytics() {
  const { data: analytics, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error || !analytics) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">Failed to load analytics data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const successRateColor = analytics.successRate >= 80 
    ? "text-green-600 dark:text-green-400" 
    : analytics.successRate >= 50 
    ? "text-yellow-600 dark:text-yellow-400" 
    : "text-red-600 dark:text-red-400";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="analytics-title">Analytics</h1>
        <p className="text-muted-foreground">Track your video generation performance and usage</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Videos"
          value={analytics.totalJobs}
          description="All-time generated videos"
          icon={Video}
        />
        <StatCard
          title="Success Rate"
          value={`${analytics.successRate.toFixed(1)}%`}
          description={`${analytics.completedJobs} completed, ${analytics.failedJobs} failed`}
          icon={CheckCircle}
        />
        <StatCard
          title="Avg. Processing"
          value={`${analytics.avgProcessingTimeMinutes.toFixed(1)}m`}
          description="Average time per video"
          icon={Clock}
        />
        <StatCard
          title="Estimated Cost"
          value={`$${analytics.totalEstimatedCost.toFixed(2)}`}
          description={`~$${analytics.avgCostPerVideo.toFixed(3)} per video`}
          icon={DollarSign}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Content Types
            </CardTitle>
            <CardDescription>Videos by content category</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(analytics.contentTypeBreakdown).length === 0 ? (
              <p className="text-sm text-muted-foreground">No videos created yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(analytics.contentTypeBreakdown)
                  .sort(([,a], [,b]) => b - a)
                  .slice(0, 8)
                  .map(([type, count]) => {
                    const percentage = (count / analytics.totalJobs) * 100;
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span>{contentTypeLabels[type] || type}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Status Overview
            </CardTitle>
            <CardDescription>Current job distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(analytics.statusBreakdown)
                .filter(([_, count]) => count > 0)
                .map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                      {!["completed", "failed"].includes(status) && (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-sm capitalize">{status.replace(/_/g, " ")}</span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              {Object.keys(analytics.statusBreakdown).length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Last 7 Days
          </CardTitle>
          <CardDescription>Daily video generation activity</CardDescription>
        </CardHeader>
        <CardContent>
          {analytics.last7Days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <div className="flex items-end gap-2 h-32">
              {analytics.last7Days.map((day) => {
                const maxCount = Math.max(...analytics.last7Days.map(d => d.count), 1);
                const heightPercent = (day.count / maxCount) * 100;
                const dateObj = new Date(day.date + 'T12:00:00');
                const isValidDate = !isNaN(dateObj.getTime());
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-24">
                      <span className="text-xs font-medium mb-1">{day.count}</span>
                      <div 
                        className="w-full bg-primary rounded-t-sm transition-all"
                        style={{ height: `${Math.max(heightPercent, 4)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {isValidDate ? format(dateObj, "EEE") : "?"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

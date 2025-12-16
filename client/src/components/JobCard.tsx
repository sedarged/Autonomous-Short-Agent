import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { ContentTypeIcon } from "./ContentTypeIcon";
import { ProgressBar, ETADisplay } from "./ProgressBar";
import { CompactPipeline } from "./PipelineVisualization";
import { Play, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Job, JobStep, ContentType, JobStatus } from "@shared/schema";
import { contentTypeInfo } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

interface JobCardProps {
  job: Job & { steps?: JobStep[] };
}

export function JobCard({ job }: JobCardProps) {
  const contentInfo = contentTypeInfo[job.contentType as ContentType];
  const isActive = ['running', 'generating_script', 'generating_assets', 'rendering_video', 'generating_caption'].includes(job.status);
  const isCompleted = job.status === 'completed';

  return (
    <Link href={`/jobs/${job.id}`}>
      <Card 
        className="group hover:shadow-md transition-all duration-200 cursor-pointer border hover:border-primary/20"
        data-testid={`job-card-${job.id}`}
      >
        <CardContent className="p-0">
          {/* Thumbnail */}
          <div className="relative aspect-video bg-muted rounded-t-lg overflow-hidden">
            {job.thumbnailUrl ? (
              <img 
                src={job.thumbnailUrl} 
                alt={job.title}
                className="w-full h-full object-cover"
                data-testid={`job-thumbnail-${job.id}`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <ContentTypeIcon 
                  contentType={job.contentType as ContentType} 
                  className="w-12 h-12 text-muted-foreground/40"
                />
              </div>
            )}
            
            {/* Status Badge Overlay */}
            <div className="absolute top-2 right-2">
              <StatusBadge status={job.status as JobStatus} size="sm" />
            </div>

            {/* Play button overlay for completed videos */}
            {isCompleted && job.videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                  <Play className="w-5 h-5 text-foreground ml-0.5" />
                </div>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Title & Content Type */}
            <div>
              <h3 className="font-medium text-sm line-clamp-2 group-hover:text-primary transition-colors" data-testid={`job-title-${job.id}`}>
                {job.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                <ContentTypeIcon contentType={job.contentType as ContentType} className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{contentInfo?.label}</span>
              </div>
            </div>

            {/* Progress (if active) */}
            {isActive && (
              <div className="space-y-1.5">
                <ProgressBar value={job.progressPercent} size="sm" showLabel />
                <ETADisplay seconds={job.etaSeconds} />
                {job.steps && <CompactPipeline steps={job.steps} />}
              </div>
            )}

            {/* Duration (if completed) */}
            {isCompleted && job.durationSeconds && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.floor(job.durationSeconds / 60)}:{(job.durationSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}

            {/* Timestamp */}
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Skeleton loader for job cards
export function JobCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="aspect-video bg-muted animate-pulse rounded-t-lg" />
        <div className="p-4 space-y-3">
          <div className="space-y-2">
            <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
            <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
          </div>
          <div className="h-2 bg-muted animate-pulse rounded" />
          <div className="flex justify-between pt-1 border-t border-border/50">
            <div className="h-3 bg-muted animate-pulse rounded w-20" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

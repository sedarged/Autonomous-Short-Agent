import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ChevronLeft, 
  RefreshCw, 
  Copy, 
  Download, 
  Play,
  ExternalLink,
  AlertCircle,
  Hash
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { ContentTypeIcon } from "@/components/ContentTypeIcon";
import { ProgressBar, ETADisplay } from "@/components/ProgressBar";
import { PipelineVisualization } from "@/components/PipelineVisualization";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JobWithSteps, ContentType, JobStatus, JobSettings } from "@shared/schema";
import { contentTypeInfo } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: job, isLoading, refetch, isFetching } = useQuery<JobWithSteps>({
    queryKey: ["/api/jobs", id],
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return 5000;
      if (['completed', 'failed'].includes(job.status)) return false;
      return 3000;
    }
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/jobs/${id}/regenerate`, {});
    },
    onSuccess: async (response) => {
      const newJob = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Regeneration started",
        description: "A new video with the same settings is being created."
      });
      window.location.href = `/jobs/${newJob.id}`;
    },
    onError: (error) => {
      toast({
        title: "Failed to regenerate",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const copyCaption = () => {
    if (job?.caption) {
      navigator.clipboard.writeText(
        `${job.caption}\n\n${job.hashtags?.map(h => `#${h}`).join(' ') || ''}`
      );
      toast({ title: "Caption copied to clipboard" });
    }
  };

  if (isLoading) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="text-center py-16">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Job not found</h2>
          <p className="text-muted-foreground mb-4">
            This video job doesn't exist or has been deleted.
          </p>
          <Link href="/">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const contentInfo = contentTypeInfo[job.contentType as ContentType];
  const isActive = ['running', 'generating_script', 'generating_assets', 'rendering_video', 'generating_caption'].includes(job.status);
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const settings = job.settings as JobSettings;

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto" data-testid="job-detail-page">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <Link href="/">
            <Button variant="ghost" size="sm" className="mb-2" data-testid="button-back">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight" data-testid="job-title">
            {job.title}
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <StatusBadge status={job.status as JobStatus} />
            <Badge variant="outline" className="gap-1.5">
              <ContentTypeIcon contentType={job.contentType as ContentType} className="w-3 h-3" />
              {contentInfo?.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
            data-testid="button-regenerate"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Regenerate
          </Button>
        </div>
      </div>

      {/* Progress Section (for active jobs) */}
      {isActive && (
        <Card className="mb-6" data-testid="progress-section">
          <CardContent className="py-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Progress</span>
                <ETADisplay seconds={job.etaSeconds} />
              </div>
              <ProgressBar value={job.progressPercent} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline Visualization */}
      {job.steps && job.steps.length > 0 && (
        <Card className="mb-6" data-testid="pipeline-section">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pipeline Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineVisualization steps={job.steps} />
          </CardContent>
        </Card>
      )}

      {/* Error Message */}
      {isFailed && job.errorMessage && (
        <Card className="mb-6 border-destructive/50" data-testid="error-section">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Generation Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{job.errorMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column - Video & Script */}
        <div className="space-y-6">
          {/* Video Player */}
          {isCompleted && job.videoUrl && (
            <Card data-testid="video-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Video</span>
                  <a href={job.videoUrl} download>
                    <Button variant="outline" size="sm" data-testid="button-download">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                  </a>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-[9/16] max-h-[500px] bg-black rounded-lg overflow-hidden mx-auto">
                  <video 
                    src={job.videoUrl} 
                    controls 
                    className="w-full h-full object-contain"
                    poster={job.thumbnailUrl || undefined}
                    data-testid="video-player"
                  />
                </div>
                {job.durationSeconds && (
                  <p className="text-sm text-muted-foreground text-center mt-2 font-mono">
                    Duration: {Math.floor(job.durationSeconds / 60)}:{(job.durationSeconds % 60).toString().padStart(2, '0')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Thumbnail placeholder for non-completed jobs */}
          {!isCompleted && (
            <Card data-testid="thumbnail-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-[9/16] max-h-[400px] bg-muted rounded-lg flex items-center justify-center mx-auto">
                  {job.thumbnailUrl ? (
                    <img 
                      src={job.thumbnailUrl} 
                      alt="Thumbnail" 
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="text-center p-8">
                      <ContentTypeIcon 
                        contentType={job.contentType as ContentType} 
                        className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" 
                      />
                      <p className="text-muted-foreground text-sm">
                        {isActive ? "Video is being generated..." : "Preview not available"}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Script */}
          {job.scriptText && (
            <Card data-testid="script-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Script</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted rounded-lg p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{job.scriptText}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Details & Caption */}
        <div className="space-y-6">
          {/* Caption & Hashtags */}
          {isCompleted && (job.caption || job.hashtags) && (
            <Card data-testid="caption-section">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Caption & Hashtags</span>
                  <Button variant="outline" size="sm" onClick={copyCaption} data-testid="button-copy-caption">
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {job.caption && (
                  <div>
                    <p className="text-sm">{job.caption}</p>
                  </div>
                )}
                {job.hashtags && job.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {job.hashtags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        <Hash className="w-3 h-3" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Settings Summary */}
          <Card data-testid="settings-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Content Type</dt>
                  <dd className="font-medium flex items-center gap-1.5">
                    <ContentTypeIcon contentType={job.contentType as ContentType} className="w-3.5 h-3.5" />
                    {contentInfo?.label}
                  </dd>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Voice</dt>
                  <dd className="font-medium capitalize">{settings?.audio?.voiceModel || 'alloy'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Language</dt>
                  <dd className="font-medium uppercase">{settings?.audio?.language || 'en'}</dd>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Scenes/Minute</dt>
                  <dd className="font-medium">{settings?.visual?.scenesPerMinute || 6}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Visual Style</dt>
                  <dd className="font-medium capitalize">{settings?.visual?.generatorType?.replace(/_/g, ' ') || 'Image Sequence'}</dd>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtitles</dt>
                  <dd className="font-medium">
                    {settings?.subtitles?.enabled 
                      ? `${settings.subtitles.style} (${settings.subtitles.position})`
                      : 'Disabled'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Music</dt>
                  <dd className="font-medium capitalize">{settings?.audio?.musicMode?.replace(/_/g, ' ') || 'None'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Timestamps */}
          <Card data-testid="timestamps-section">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-mono text-xs">
                    {format(new Date(job.createdAt), 'MMM d, yyyy HH:mm:ss')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Last Updated</dt>
                  <dd className="font-mono text-xs">
                    {format(new Date(job.updatedAt), 'MMM d, yyyy HH:mm:ss')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Job ID</dt>
                  <dd className="font-mono text-xs truncate max-w-[200px]" title={job.id}>
                    {job.id}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-10 w-64 mb-3" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <div className="space-y-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </div>
  );
}

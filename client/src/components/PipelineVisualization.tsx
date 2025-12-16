import { FileText, Image, Music, Video, MessageSquare, Check, AlertCircle, Loader2 } from "lucide-react";
import type { JobStep, StepStatus } from "@shared/schema";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const stepConfig: Record<string, {
  label: string;
  icon: typeof FileText;
}> = {
  script: { label: "Script", icon: FileText },
  assets_visual: { label: "Visuals", icon: Image },
  assets_audio: { label: "Audio", icon: Music },
  video: { label: "Render", icon: Video },
  caption: { label: "Caption", icon: MessageSquare }
};

interface PipelineVisualizationProps {
  steps: JobStep[];
  className?: string;
}

export function PipelineVisualization({ steps, className = "" }: PipelineVisualizationProps) {
  const orderedStepTypes = ['script', 'assets_visual', 'assets_audio', 'video', 'caption'];
  
  const getStepByType = (type: string) => steps.find(s => s.stepType === type);

  const getStatusStyles = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return {
          node: "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
          line: "bg-green-500"
        };
      case 'running':
        return {
          node: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
          line: "bg-blue-500"
        };
      case 'failed':
        return {
          node: "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
          line: "bg-red-500"
        };
      default:
        return {
          node: "bg-muted border-border text-muted-foreground",
          line: "bg-border"
        };
    }
  };

  const getStatusIcon = (status: StepStatus, Icon: typeof FileText) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4" />;
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Icon className="w-4 h-4" />;
    }
  };

  const formatDuration = (step: JobStep) => {
    if (!step.startedAt) return null;
    const start = new Date(step.startedAt).getTime();
    const end = step.finishedAt ? new Date(step.finishedAt).getTime() : Date.now();
    const duration = Math.round((end - start) / 1000);
    if (duration < 60) return `${duration}s`;
    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  };

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`} data-testid="pipeline-visualization">
      {orderedStepTypes.map((stepType, index) => {
        const step = getStepByType(stepType);
        const config = stepConfig[stepType];
        const status: StepStatus = step?.status as StepStatus || 'queued';
        const styles = getStatusStyles(status);
        const duration = step ? formatDuration(step) : null;

        return (
          <div key={stepType} className="flex items-center flex-1">
            {/* Step Node */}
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className={`
                    flex flex-col items-center gap-1.5 cursor-default
                  `}
                  data-testid={`pipeline-step-${stepType}`}
                >
                  <div 
                    className={`
                      w-10 h-10 rounded-full border-2 flex items-center justify-center
                      transition-all duration-300
                      ${styles.node}
                    `}
                  >
                    {getStatusIcon(status, config.icon)}
                  </div>
                  <span className="text-xs font-medium text-center whitespace-nowrap">
                    {config.label}
                  </span>
                  {status === 'running' && (
                    <span className="text-[10px] text-muted-foreground">
                      {duration || 'Starting...'}
                    </span>
                  )}
                  {status === 'completed' && duration && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {duration}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{config.label}</p>
                  <p className="text-muted-foreground capitalize">{status}</p>
                  {step?.message && (
                    <p className="text-xs mt-1 max-w-xs">{step.message}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Connecting Line */}
            {index < orderedStepTypes.length - 1 && (
              <div 
                className={`
                  flex-1 h-0.5 mx-2 rounded-full transition-all duration-300
                  ${status === 'completed' ? 'bg-green-500' : 'bg-border'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Compact version for job cards
interface CompactPipelineProps {
  steps: JobStep[];
}

export function CompactPipeline({ steps }: CompactPipelineProps) {
  const orderedStepTypes = ['script', 'assets_visual', 'assets_audio', 'video', 'caption'];

  return (
    <div className="flex items-center gap-1" data-testid="compact-pipeline">
      {orderedStepTypes.map((stepType) => {
        const step = steps.find(s => s.stepType === stepType);
        const status: StepStatus = step?.status as StepStatus || 'queued';
        
        let bgColor = 'bg-muted';
        if (status === 'completed') bgColor = 'bg-green-500';
        else if (status === 'running') bgColor = 'bg-blue-500 animate-pulse';
        else if (status === 'failed') bgColor = 'bg-red-500';

        return (
          <div 
            key={stepType}
            className={`w-2 h-2 rounded-full ${bgColor}`}
          />
        );
      })}
    </div>
  );
}

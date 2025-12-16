import { Badge } from "@/components/ui/badge";
import { 
  Clock, 
  Play, 
  FileText, 
  Image, 
  Video, 
  MessageSquare, 
  Check, 
  AlertCircle,
  Loader2
} from "lucide-react";
import type { JobStatus, StepStatus } from "@shared/schema";

const statusConfig: Record<JobStatus, { 
  label: string; 
  variant: "default" | "secondary" | "destructive" | "outline";
  icon: typeof Clock;
  className?: string;
}> = {
  queued: { 
    label: "Queued", 
    variant: "secondary", 
    icon: Clock,
    className: "bg-muted text-muted-foreground"
  },
  running: { 
    label: "Running", 
    variant: "default", 
    icon: Play,
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
  },
  generating_script: { 
    label: "Writing Script", 
    variant: "default", 
    icon: FileText,
    className: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
  },
  generating_assets: { 
    label: "Creating Assets", 
    variant: "default", 
    icon: Image,
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
  },
  rendering_video: { 
    label: "Rendering", 
    variant: "default", 
    icon: Video,
    className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
  },
  generating_caption: { 
    label: "Captioning", 
    variant: "default", 
    icon: MessageSquare,
    className: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20"
  },
  completed: { 
    label: "Completed", 
    variant: "default", 
    icon: Check,
    className: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
  },
  failed: { 
    label: "Failed", 
    variant: "destructive", 
    icon: AlertCircle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
  }
};

interface StatusBadgeProps {
  status: JobStatus;
  showIcon?: boolean;
  size?: "sm" | "default";
}

export function StatusBadge({ status, showIcon = true, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  const isAnimating = ['running', 'generating_script', 'generating_assets', 'rendering_video', 'generating_caption'].includes(status);

  return (
    <Badge 
      variant="outline" 
      className={`gap-1.5 ${config.className} ${size === "sm" ? "text-xs px-2 py-0.5" : ""}`}
      data-testid={`status-badge-${status}`}
    >
      {showIcon && (
        isAnimating ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Icon className="w-3 h-3" />
        )
      )}
      <span>{config.label}</span>
    </Badge>
  );
}

// Step status badge (simpler)
const stepStatusConfig: Record<StepStatus, {
  label: string;
  className: string;
  icon: typeof Clock;
}> = {
  queued: { label: "Pending", className: "text-muted-foreground", icon: Clock },
  running: { label: "In Progress", className: "text-blue-600 dark:text-blue-400", icon: Play },
  completed: { label: "Done", className: "text-green-600 dark:text-green-400", icon: Check },
  failed: { label: "Failed", className: "text-red-600 dark:text-red-400", icon: AlertCircle }
};

interface StepStatusBadgeProps {
  status: StepStatus;
}

export function StepStatusBadge({ status }: StepStatusBadgeProps) {
  const config = stepStatusConfig[status];
  const Icon = config.icon;
  const isAnimating = status === 'running';

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.className}`}>
      {isAnimating ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Icon className="w-3 h-3" />
      )}
      <span>{config.label}</span>
    </span>
  );
}

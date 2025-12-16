import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  size?: "sm" | "default";
  className?: string;
}

export function ProgressBar({ 
  value, 
  showLabel = true, 
  size = "default",
  className = ""
}: ProgressBarProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Progress 
        value={value} 
        className={`flex-1 ${size === "sm" ? "h-1.5" : "h-2"}`}
        data-testid="progress-bar"
      />
      {showLabel && (
        <span 
          className={`font-medium tabular-nums ${size === "sm" ? "text-xs" : "text-sm"} text-muted-foreground min-w-[40px] text-right`}
          data-testid="progress-value"
        >
          {value}%
        </span>
      )}
    </div>
  );
}

interface ETADisplayProps {
  seconds?: number | null;
  className?: string;
}

export function ETADisplay({ seconds, className = "" }: ETADisplayProps) {
  if (!seconds || seconds <= 0) return null;

  const formatETA = (secs: number): string => {
    if (secs < 60) return `~${secs}s remaining`;
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    if (mins < 60) {
      return remainingSecs > 0 
        ? `~${mins}m ${remainingSecs}s remaining`
        : `~${mins}m remaining`;
    }
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `~${hours}h ${remainingMins}m remaining`;
  };

  return (
    <span 
      className={`text-xs text-muted-foreground font-mono ${className}`}
      data-testid="eta-display"
    >
      {formatETA(seconds)}
    </span>
  );
}

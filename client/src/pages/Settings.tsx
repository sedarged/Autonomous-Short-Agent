import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, RotateCcw, Cog, Zap, DollarSign, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const settingsSchema = z.object({
  defaultVoice: z.string().default("alloy"),
  defaultLanguage: z.enum(["en", "pl", "mixed"]).default("en"),
  defaultScenesPerMinute: z.number().min(2).max(12).default(6),
  defaultSubtitlesEnabled: z.boolean().default(true),
  defaultSubtitleStyle: z.enum(["clean", "karaoke", "bold_outline"]).default("clean"),
  autoPollingInterval: z.number().min(5).max(60).default(15),
  maxConcurrentJobs: z.number().min(1).max(5).default(2),
  budgetMode: z.boolean().default(true),
  isMonetized: z.boolean().default(false),
});

type SettingsFormValues = z.infer<typeof settingsSchema>;

const defaultSettings: SettingsFormValues = {
  defaultVoice: "alloy",
  defaultLanguage: "en",
  defaultScenesPerMinute: 6,
  defaultSubtitlesEnabled: true,
  defaultSubtitleStyle: "clean",
  autoPollingInterval: 15,
  maxConcurrentJobs: 2,
  budgetMode: true,
  isMonetized: false,
};

export default function Settings() {
  const { toast } = useToast();

  const { data: settings, isLoading } = useQuery<SettingsFormValues>({
    queryKey: ["/api/settings"],
  });

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings || defaultSettings,
    values: settings || defaultSettings,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SettingsFormValues) => {
      return apiRequest("PUT", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved successfully" });
    },
    onError: (error) => {
      toast({
        title: "Failed to save settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (data: SettingsFormValues) => {
    updateMutation.mutate(data);
  };

  const resetToDefaults = () => {
    form.reset(defaultSettings);
    toast({ title: "Settings reset to defaults", description: "Click Save to apply changes." });
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto" data-testid="settings-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure global defaults for video generation
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          {/* Budget & Monetization Mode */}
          <Card data-testid="budget-settings" className="border-2 border-primary/20">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-primary" />
                Cost Management
                {form.watch("budgetMode") && (
                  <Badge variant="secondary" className="ml-2">Budget Mode Active</Badge>
                )}
              </CardTitle>
              <CardDescription>
                Optimize video generation costs while building your audience
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="budgetMode"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Budget Mode
                      </FormLabel>
                      <FormDescription>
                        Optimized settings for lower cost (~$0.15-0.20/video instead of ~$0.40-0.50)
                        <br />
                        <span className="text-xs">Uses 45s max duration, 4 scenes/min - perfect for building your channel</span>
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-budget-mode"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isMonetized"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Channel Monetized
                      </FormLabel>
                      <FormDescription>
                        Enable when you start earning from TikTok/YouTube
                        <br />
                        <span className="text-xs">Unlocks longer videos (60s+) and premium features</span>
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          field.onChange(checked);
                          if (checked) {
                            form.setValue("budgetMode", false);
                          }
                        }}
                        data-testid="switch-monetized"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {form.watch("budgetMode") && (
                <div className="rounded-lg bg-primary/5 p-4 text-sm">
                  <p className="font-medium mb-2">Budget Mode applies these optimizations:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Max 45 second videos (TikTok sweet spot)</li>
                    <li>4 scenes per minute (fewer AI images)</li>
                    <li>Estimated cost: $0.15-0.20 per video</li>
                  </ul>
                </div>
              )}

              {form.watch("isMonetized") && !form.watch("budgetMode") && (
                <div className="rounded-lg bg-green-500/10 p-4 text-sm">
                  <p className="font-medium mb-2 text-green-700 dark:text-green-400">Full Mode Unlocked</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Videos up to 3 minutes</li>
                    <li>Up to 8 scenes per minute</li>
                    <li>Premium visual styles</li>
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audio Defaults */}
          <Card data-testid="audio-settings">
            <CardHeader>
              <CardTitle className="text-lg">Audio Defaults</CardTitle>
              <CardDescription>
                Default audio settings for new videos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="defaultVoice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Voice</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-default-voice">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                        <SelectItem value="echo">Echo (Male)</SelectItem>
                        <SelectItem value="fable">Fable (British)</SelectItem>
                        <SelectItem value="onyx">Onyx (Deep Male)</SelectItem>
                        <SelectItem value="nova">Nova (Female)</SelectItem>
                        <SelectItem value="shimmer">Shimmer (Soft Female)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The voice used for text-to-speech narration
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Language</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-default-language">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="pl">Polish</SelectItem>
                        <SelectItem value="mixed">Mixed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Primary language for generated content
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Visual Defaults */}
          <Card data-testid="visual-settings">
            <CardHeader>
              <CardTitle className="text-lg">Visual Defaults</CardTitle>
              <CardDescription>
                Default visual settings for new videos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="defaultScenesPerMinute"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Scenes Per Minute</FormLabel>
                      <span className="text-sm font-medium">{field.value}</span>
                    </div>
                    <FormControl>
                      <Slider
                        min={2}
                        max={12}
                        step={1}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        className="mt-2"
                        data-testid="slider-default-scenes"
                      />
                    </FormControl>
                    <FormDescription>
                      Higher values create more dynamic videos but increase generation cost
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Subtitle Defaults */}
          <Card data-testid="subtitle-settings">
            <CardHeader>
              <CardTitle className="text-lg">Subtitle Defaults</CardTitle>
              <CardDescription>
                Default subtitle settings for new videos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="defaultSubtitlesEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>Enable Subtitles by Default</FormLabel>
                      <FormDescription>
                        Automatically enable subtitles for new videos
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-default-subtitles"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultSubtitleStyle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Subtitle Style</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-default-subtitle-style">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="clean">Clean</SelectItem>
                        <SelectItem value="karaoke">Karaoke</SelectItem>
                        <SelectItem value="bold_outline">Bold Outline</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Visual style for subtitle text overlays
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* System Settings */}
          <Card data-testid="system-settings">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Cog className="w-4 h-4" />
                System Settings
              </CardTitle>
              <CardDescription>
                Application behavior settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="autoPollingInterval"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Auto-refresh Interval</FormLabel>
                      <span className="text-sm font-medium">{field.value}s</span>
                    </div>
                    <FormControl>
                      <Slider
                        min={5}
                        max={60}
                        step={5}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        className="mt-2"
                        data-testid="slider-polling-interval"
                      />
                    </FormControl>
                    <FormDescription>
                      How often to refresh job status on the dashboard
                    </FormDescription>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxConcurrentJobs"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Max Concurrent Jobs</FormLabel>
                      <span className="text-sm font-medium">{field.value}</span>
                    </div>
                    <FormControl>
                      <Slider
                        min={1}
                        max={5}
                        step={1}
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        className="mt-2"
                        data-testid="slider-max-jobs"
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum number of videos to process simultaneously
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={resetToDefaults}
              data-testid="button-reset-settings"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              data-testid="button-save-settings"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

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
import { Save, RotateCcw, Cog } from "lucide-react";
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

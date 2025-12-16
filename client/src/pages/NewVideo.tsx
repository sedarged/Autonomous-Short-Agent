import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Image, 
  Music, 
  Subtitles,
  Save,
  Check,
  Lightbulb,
  Loader2,
  TrendingUp
} from "lucide-react";
import { Link } from "wouter";
import { ContentTypeIcon } from "@/components/ContentTypeIcon";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ContentType, Preset, JobSettings, TargetPlatform, CaptionStyle } from "@shared/schema";
import { 
  contentTypes, 
  contentTypeInfo, 
  jobSettingsSchema,
  visualSettingsSchema,
  audioSettingsSchema,
  subtitleSettingsSchema,
  targetPlatforms,
  platformInfo,
  captionStyles,
  captionStyleInfo,
  durationPresets
} from "@shared/schema";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  contentType: z.enum(contentTypes),
  targetDurationSeconds: z.number().int().min(15).max(300).default(90),
  targetPlatform: z.enum(targetPlatforms).default('both'),
  contentConfig: z.object({
    prompt: z.string().default(""),
    mode: z.enum(["ai_generated", "url", "raw_text"]).default("ai_generated"),
    url: z.string().optional(),
    rawText: z.string().optional(),
    topic: z.string().optional(),
    count: z.number().optional(),
    genre: z.string().optional(),
  }),
  visual: visualSettingsSchema,
  audio: audioSettingsSchema,
  subtitles: subtitleSettingsSchema,
  viralOptimization: z.object({
    hookStrength: z.enum(['subtle', 'medium', 'strong']).default('strong'),
    pacingStyle: z.enum(['slow', 'medium', 'fast']).default('fast'),
    ctaEnabled: z.boolean().default(true)
  }).default({})
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  title: "",
  contentType: "reddit_story",
  targetDurationSeconds: 90,
  targetPlatform: "both",
  contentConfig: {
    prompt: "",
    mode: "ai_generated",
  },
  visual: {
    generatorType: "image_sequence",
    aspectRatio: "9:16",
    fps: 30,
    scenesPerMinute: 6,
    allowCharacterCloseups: true,
  },
  audio: {
    voiceModel: "alloy",
    language: "en",
    musicMode: "none",
    duckMusicUnderVoice: true,
  },
  subtitles: {
    enabled: true,
    style: "minimal",
    position: "bottom",
    fontSize: "medium",
    animation: "pop",
  },
  viralOptimization: {
    hookStrength: "strong",
    pacingStyle: "fast",
    ctaEnabled: true,
  },
};

export default function NewVideo() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const { data: presets } = useQuery<Preset[]>({
    queryKey: ["/api/presets"],
  });

  // Fetch trending topic suggestions
  const fetchSuggestions = async (contentType: ContentType) => {
    setSuggestionLoading(true);
    try {
      const response = await fetch(`/api/suggestions/topics/${contentType}`);
      if (response.ok) {
        const data = await response.json();
        setTopicSuggestions(data.topics || []);
      }
    } catch (error) {
      console.error("Failed to fetch suggestions:", error);
    } finally {
      setSuggestionLoading(false);
    }
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const contentType = form.watch("contentType");
  const filteredPresets = presets?.filter(p => p.contentType === contentType) || [];

  const createJobMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      return apiRequest("POST", "/api/jobs", {
        title: data.title,
        settings: {
          contentType: data.contentType,
          targetDurationSeconds: data.targetDurationSeconds,
          targetPlatform: data.targetPlatform,
          contentConfig: data.contentConfig,
          visual: data.visual,
          audio: data.audio,
          subtitles: data.subtitles,
          viralOptimization: data.viralOptimization,
        }
      });
    },
    onSuccess: async (response) => {
      const job = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Video generation started",
        description: "Your video is being created."
      });
      navigate(`/jobs/${job.id}`);
    },
    onError: (error) => {
      toast({
        title: "Failed to create video",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    }
  });

  const applyPreset = (presetId: string) => {
    const preset = presets?.find(p => p.id === presetId);
    if (preset) {
      const settings = preset.settings as JobSettings;
      form.setValue("visual", settings.visual);
      form.setValue("audio", settings.audio);
      form.setValue("subtitles", settings.subtitles);
      if (preset.defaultTitleTemplate) {
        form.setValue("title", preset.defaultTitleTemplate);
      }
      toast({ title: "Preset applied", description: preset.name });
    }
  };

  const onSubmit = (data: FormValues) => {
    createJobMutation.mutate(data);
  };

  const steps = [
    { number: 1, title: "Content Type" },
    { number: 2, title: "Content Config" },
    { number: 3, title: "Visual & Audio" },
    { number: 4, title: "Review" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto" data-testid="new-video-page">
      {/* Header */}
      <div className="mb-8">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate("/")}
          className="mb-4"
          data-testid="button-back"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Dashboard
        </Button>
        <h1 className="text-3xl font-semibold tracking-tight">Create New Video</h1>
        <p className="text-muted-foreground mt-1">
          Configure your AI-generated short video
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, index) => (
            <div key={s.number} className="flex items-center flex-1">
              <button
                onClick={() => setStep(s.number)}
                className={`
                  flex items-center gap-2 transition-colors
                  ${step >= s.number ? 'text-foreground' : 'text-muted-foreground'}
                `}
                data-testid={`step-${s.number}`}
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step > s.number 
                    ? 'bg-green-500 text-white' 
                    : step === s.number 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'}
                `}>
                  {step > s.number ? <Check className="w-4 h-4" /> : s.number}
                </div>
                <span className="hidden sm:inline text-sm font-medium">{s.title}</span>
              </button>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-4 ${step > s.number ? 'bg-green-500' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Content Type */}
          {step === 1 && (
            <Card data-testid="step-content-type">
              <CardHeader>
                <CardTitle>Select Content Type</CardTitle>
                <CardDescription>
                  Choose the type of video content you want to create
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {contentTypes.map((type) => {
                    const info = contentTypeInfo[type];
                    const isSelected = form.watch("contentType") === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => form.setValue("contentType", type)}
                        className={`
                          p-4 rounded-lg border-2 text-left transition-all
                          ${isSelected 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/30'}
                        `}
                        data-testid={`content-type-${type}`}
                      >
                        <ContentTypeIcon contentType={type} className="w-6 h-6 mb-2" />
                        <p className="font-medium text-sm">{info.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {info.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Content Configuration */}
          {step === 2 && (
            <Card data-testid="step-content-config">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ContentTypeIcon contentType={contentType} />
                  {contentTypeInfo[contentType].label} Configuration
                </CardTitle>
                <CardDescription>
                  {contentTypeInfo[contentType].description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Video Title</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Enter a title for your video" 
                          {...field} 
                          data-testid="input-title"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="contentConfig.prompt"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <FormLabel>Content Prompt</FormLabel>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fetchSuggestions(contentType)}
                          disabled={suggestionLoading}
                          data-testid="button-suggest-topics"
                        >
                          {suggestionLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Lightbulb className="h-4 w-4 mr-2" />
                          )}
                          Suggest Topics
                        </Button>
                      </div>
                      
                      {topicSuggestions.length > 0 && (
                        <div className="flex flex-wrap gap-2 py-2">
                          {topicSuggestions.map((topic, idx) => (
                            <Button
                              key={idx}
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                field.onChange(topic);
                                setTopicSuggestions([]);
                              }}
                              data-testid={`button-suggestion-${idx}`}
                            >
                              {topic}
                            </Button>
                          ))}
                        </div>
                      )}
                      
                      <FormControl>
                        <Textarea 
                          placeholder="Describe what you want the video to be about, or paste content directly..."
                          className="min-h-32"
                          {...field}
                          data-testid="input-content-prompt"
                        />
                      </FormControl>
                      <FormDescription className="flex items-center justify-between gap-2 flex-wrap">
                        <span>The AI will use this to generate the script and structure</span>
                        <Link 
                          href="/research"
                          className="text-xs text-primary flex items-center gap-1 hover:underline"
                          data-testid="link-research"
                        >
                          <TrendingUp className="h-3 w-3" />
                          Deep Trend Research
                        </Link>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* URL input for Reddit types */}
                {(contentType === 'reddit_story' || contentType === 'aita_story') && (
                  <FormField
                    control={form.control}
                    name="contentConfig.url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reddit URL (Optional)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="https://reddit.com/r/..." 
                            {...field}
                            data-testid="input-reddit-url"
                          />
                        </FormControl>
                        <FormDescription>
                          Paste a Reddit post URL to use that content
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Count for list-based content */}
                {['would_you_rather', 'this_or_that', 'quiz_trivia', 'riddles', 'facts', 'top_list'].includes(contentType) && (
                  <FormField
                    control={form.control}
                    name="contentConfig.count"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Items</FormLabel>
                        <FormControl>
                          <Select
                            value={field.value?.toString() || "5"}
                            onValueChange={(v) => field.onChange(parseInt(v))}
                          >
                            <SelectTrigger data-testid="select-item-count">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[3, 5, 7, 10].map(n => (
                                <SelectItem key={n} value={n.toString()}>{n} items</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Duration & Platform Settings */}
                <div className="border-t pt-6 space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground">Video Settings</h3>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="targetDurationSeconds"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Video Duration</FormLabel>
                          <Select 
                            value={field.value?.toString()} 
                            onValueChange={(v) => field.onChange(parseInt(v))}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-duration">
                                <SelectValue placeholder="Select duration" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {durationPresets.map(preset => (
                                <SelectItem key={preset.value} value={preset.value.toString()}>
                                  {preset.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Longer videos (60s+) perform better on TikTok
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="targetPlatform"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Target Platform</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-platform">
                                <SelectValue placeholder="Select platform" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {targetPlatforms.map(platform => (
                                <SelectItem key={platform} value={platform}>
                                  <div className="flex flex-col">
                                    <span>{platformInfo[platform].label}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {platformInfo[platform].description}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Viral Optimization Settings */}
                <div className="border-t pt-6 space-y-4">
                  <h3 className="font-medium text-sm text-muted-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Viral Optimization
                  </h3>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="viralOptimization.hookStrength"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opening Hook</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-hook">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="subtle">Subtle - Calm opener</SelectItem>
                              <SelectItem value="medium">Medium - Engaging opener</SelectItem>
                              <SelectItem value="strong">Strong - Attention-grabbing</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            How attention-grabbing the first 3 seconds are
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="viralOptimization.pacingStyle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pacing Style</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-pacing">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="slow">Slow - Relaxed, meditative</SelectItem>
                              <SelectItem value="medium">Medium - Natural flow</SelectItem>
                              <SelectItem value="fast">Fast - High energy, quick cuts</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="viralOptimization.ctaEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Call-to-Action</FormLabel>
                          <FormDescription>
                            Add engagement prompts at the end
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-cta"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Visual & Audio Settings */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Preset Selector */}
              {filteredPresets.length > 0 && (
                <Card data-testid="preset-selector">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      Apply Preset
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select onValueChange={applyPreset}>
                      <SelectTrigger data-testid="select-preset">
                        <SelectValue placeholder="Select a preset to apply..." />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredPresets.map(preset => (
                          <SelectItem key={preset.id} value={preset.id}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              <Accordion type="multiple" defaultValue={["visual", "audio", "subtitles"]} className="space-y-4">
                {/* Visual Settings */}
                <AccordionItem value="visual" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline" data-testid="accordion-visual">
                    <div className="flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      <span>Visual Settings</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2 pb-4">
                    <FormField
                      control={form.control}
                      name="visual.stylePrompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Visual Style</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., cinematic, vibrant colors, dark mood..."
                              {...field}
                              data-testid="input-style-prompt"
                            />
                          </FormControl>
                          <FormDescription>
                            Describe the visual style for AI-generated images
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="visual.scenesPerMinute"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Scenes Per Minute: {field.value}</FormLabel>
                          <FormControl>
                            <Slider
                              min={2}
                              max={12}
                              step={1}
                              value={[field.value]}
                              onValueChange={([v]) => field.onChange(v)}
                              className="mt-2"
                              data-testid="slider-scenes"
                            />
                          </FormControl>
                          <FormDescription>
                            More scenes = more dynamic, but higher cost
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="visual.allowCharacterCloseups"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Character Close-ups</FormLabel>
                            <FormDescription>
                              Include AI-generated character faces
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-closeups"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Audio Settings */}
                <AccordionItem value="audio" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline" data-testid="accordion-audio">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4" />
                      <span>Audio Settings</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2 pb-4">
                    <FormField
                      control={form.control}
                      name="audio.voiceModel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Voice</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-voice">
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
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="audio.language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Language</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-language">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="pl">Polish</SelectItem>
                              <SelectItem value="mixed">Mixed</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="audio.musicMode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Background Music</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-music">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">No Music</SelectItem>
                              <SelectItem value="ai_music">AI Generated</SelectItem>
                              <SelectItem value="loop_from_library">From Library</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Subtitle Settings */}
                <AccordionItem value="subtitles" className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline" data-testid="accordion-subtitles">
                    <div className="flex items-center gap-2">
                      <Subtitles className="w-4 h-4" />
                      <span>Subtitle Settings</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-2 pb-4">
                    <FormField
                      control={form.control}
                      name="subtitles.enabled"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Enable Subtitles</FormLabel>
                            <FormDescription>
                              Show text overlays synced with voice
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-subtitles"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {form.watch("subtitles.enabled") && (
                      <>
                        <FormField
                          control={form.control}
                          name="subtitles.style"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Caption Style</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-subtitle-style">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {captionStyles.map(style => (
                                    <SelectItem key={style} value={style}>
                                      <div className="flex flex-col">
                                        <span>{captionStyleInfo[style].label}</span>
                                        <span className="text-xs text-muted-foreground">{captionStyleInfo[style].description}</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                Choose a style that matches your content vibe
                              </FormDescription>
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="subtitles.position"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Position</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-subtitle-position">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="bottom">Bottom</SelectItem>
                                    <SelectItem value="center">Center</SelectItem>
                                    <SelectItem value="top">Top</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="subtitles.fontSize"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Font Size</FormLabel>
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-subtitle-size">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="small">Small</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="large">Large</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="subtitles.animation"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Animation</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-subtitle-animation">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="fade">Fade In</SelectItem>
                                  <SelectItem value="pop">Pop</SelectItem>
                                  <SelectItem value="slide">Slide Up</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <Card data-testid="step-review">
              <CardHeader>
                <CardTitle>Review & Generate</CardTitle>
                <CardDescription>
                  Review your settings before generating the video
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Title</Label>
                    <p className="font-medium">{form.watch("title") || "Untitled"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Content Type</Label>
                    <p className="font-medium flex items-center gap-2">
                      <ContentTypeIcon contentType={contentType} className="w-4 h-4" />
                      {contentTypeInfo[contentType].label}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Duration</Label>
                    <p className="font-medium">
                      {durationPresets.find(p => p.value === form.watch("targetDurationSeconds"))?.label || `${form.watch("targetDurationSeconds")}s`}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Platform</Label>
                    <p className="font-medium">{platformInfo[form.watch("targetPlatform")]?.label || form.watch("targetPlatform")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Voice</Label>
                    <p className="font-medium capitalize">{form.watch("audio.voiceModel")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Scenes/Minute</Label>
                    <p className="font-medium">{form.watch("visual.scenesPerMinute")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Caption Style</Label>
                    <p className="font-medium">
                      {form.watch("subtitles.enabled") 
                        ? `${captionStyleInfo[form.watch("subtitles.style") as CaptionStyle]?.label || form.watch("subtitles.style")} (${form.watch("subtitles.position")})`
                        : "Disabled"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Hook Strength</Label>
                    <p className="font-medium capitalize">{form.watch("viralOptimization.hookStrength")}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Pacing</Label>
                    <p className="font-medium capitalize">{form.watch("viralOptimization.pacingStyle")}</p>
                  </div>
                </div>

                {form.watch("contentConfig.prompt") && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Content Prompt</Label>
                    <p className="text-sm bg-muted p-3 rounded-lg">
                      {form.watch("contentConfig.prompt")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
              data-testid="button-prev"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            {step < 4 ? (
              <Button
                type="button"
                onClick={() => setStep(Math.min(4, step + 1))}
                data-testid="button-next"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={createJobMutation.isPending}
                data-testid="button-generate"
              >
                {createJobMutation.isPending ? (
                  <>
                    <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Video
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Zap, ChevronRight } from "lucide-react";
import { ContentTypeIcon } from "./ContentTypeIcon";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ContentType, Preset } from "@shared/schema";
import { contentTypes, contentTypeInfo } from "@shared/schema";

const placeholdersByType: Partial<Record<ContentType, string>> = {
  reddit_story: "Paste Reddit URL, story text, or describe a theme...",
  aita_story: "Describe the AITA scenario or paste text...",
  two_sentence_horror: "Describe the horror theme or leave blank for AI...",
  short_story_generic: "Genre and theme (e.g., 'sci-fi about time loops')...",
  would_you_rather: "Topic for questions (e.g., 'superpowers', 'food')...",
  this_or_that: "Topic for choices (e.g., 'movies', 'travel destinations')...",
  quiz_trivia: "Quiz topic (e.g., 'space facts', 'world capitals')...",
  riddles: "Topic for riddles (e.g., 'nature', 'objects')...",
  guessing_game: "Category to guess (e.g., 'countries', 'animals')...",
  facts: "Fact category (e.g., 'creepy facts', 'space')...",
  top_list: "Topic for top list (e.g., 'scariest movies', 'best foods')...",
  motivation: "Theme or leave blank for AI (e.g., 'success', 'perseverance')...",
  affirmations: "Theme for affirmations (e.g., 'self-love', 'confidence')...",
  language_mini_lesson: "Language and topic (e.g., 'Spanish greetings')...",
  mini_history: "Historical topic or date (e.g., 'on this day')...",
  science_mini_fact: "Science topic (e.g., 'physics', 'biology')..."
};

export function QuickCreate() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [contentType, setContentType] = useState<ContentType>("reddit_story");
  const [prompt, setPrompt] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");

  const { data: presets } = useQuery<Preset[]>({
    queryKey: ["/api/presets"],
  });

  const filteredPresets = presets?.filter(p => p.contentType === contentType) || [];

  const createJobMutation = useMutation({
    mutationFn: async (data: { contentType: ContentType; prompt: string; presetId?: string }) => {
      return apiRequest("POST", "/api/jobs", {
        title: data.prompt.slice(0, 50) || `New ${contentTypeInfo[data.contentType].label} Video`,
        settings: {
          contentType: data.contentType,
          presetId: data.presetId || undefined,
          contentConfig: {
            prompt: data.prompt,
            mode: "ai_generated"
          },
          visual: { generatorType: "image_sequence" },
          audio: { voiceModel: "alloy" },
          subtitles: { enabled: true }
        }
      });
    },
    onSuccess: async (response) => {
      const job = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Video generation started",
        description: "Your video is being created. This may take a few minutes."
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createJobMutation.mutate({
      contentType,
      prompt,
      presetId: selectedPresetId || undefined
    });
  };

  return (
    <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent" data-testid="quick-create-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="w-5 h-5 text-primary" />
          Quick Create
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Content Type Selector */}
            <div className="flex-shrink-0 w-full lg:w-56">
              <Label htmlFor="content-type" className="text-sm font-medium mb-2 block">
                Content Type
              </Label>
              <Select 
                value={contentType} 
                onValueChange={(v) => {
                  setContentType(v as ContentType);
                  setSelectedPresetId("");
                }}
              >
                <SelectTrigger id="content-type" data-testid="select-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contentTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <ContentTypeIcon contentType={type} className="w-4 h-4" />
                        <span>{contentTypeInfo[type].label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prompt Input */}
            <div className="flex-1">
              <Label htmlFor="prompt" className="text-sm font-medium mb-2 block">
                Content Prompt
              </Label>
              <Input
                id="prompt"
                placeholder={placeholdersByType[contentType] || "Enter your prompt..."}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="h-10"
                data-testid="input-prompt"
              />
            </div>

            {/* Preset Selector */}
            {filteredPresets.length > 0 && (
              <div className="flex-shrink-0 w-full lg:w-44">
                <Label htmlFor="preset" className="text-sm font-medium mb-2 block">
                  Preset
                </Label>
                <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
                  <SelectTrigger id="preset" data-testid="select-preset">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {filteredPresets.map((preset) => (
                      <SelectItem key={preset.id} value={preset.id}>
                        {preset.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button 
              type="button" 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/new")}
              data-testid="button-advanced"
            >
              Advanced options
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <Button 
              type="submit" 
              disabled={createJobMutation.isPending}
              data-testid="button-generate"
            >
              {createJobMutation.isPending ? (
                <>
                  <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Video
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

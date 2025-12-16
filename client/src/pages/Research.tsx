import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  TrendingUp, 
  Search, 
  Users, 
  Lightbulb, 
  Hash,
  Zap,
  Target,
  ExternalLink,
  Loader2,
  Sparkles
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TrendResult {
  topic: string;
  description: string;
  viralScore: number;
  suggestedAngle: string;
  hashtags: string[];
}

interface TrendResearchResponse {
  trends: TrendResult[];
  insights: string;
}

interface CompetitorTopic {
  topic: string;
  estimatedViews: string;
  whyItWorks: string;
  howToAdapt: string;
}

interface CompetitorAnalysisResponse {
  channelName: string;
  topPerformingTopics: CompetitorTopic[];
  contentPatterns: string[];
  recommendations: string[];
}

export default function Research() {
  const { toast } = useToast();
  const [niche, setNiche] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "youtube_shorts" | "both">("both");
  const [competitorHandle, setCompetitorHandle] = useState("");
  const [competitorPlatform, setCompetitorPlatform] = useState<"tiktok" | "youtube">("youtube");

  const trendsMutation = useMutation({
    mutationFn: async (data: { niche: string; platform: string }) => {
      const response = await apiRequest("POST", "/api/trends/research", data);
      return response.json() as Promise<TrendResearchResponse>;
    },
    onError: (error) => {
      toast({
        title: "Research failed",
        description: error instanceof Error ? error.message : "Failed to research trends",
        variant: "destructive"
      });
    }
  });

  const competitorMutation = useMutation({
    mutationFn: async (data: { channelIdentifier: string; platform: string }) => {
      const response = await apiRequest("POST", "/api/trends/competitor", data);
      return response.json() as Promise<CompetitorAnalysisResponse>;
    },
    onError: (error) => {
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze competitor",
        variant: "destructive"
      });
    }
  });

  const handleTrendResearch = () => {
    if (!niche.trim()) {
      toast({ title: "Enter a niche", description: "Please enter a niche to research", variant: "destructive" });
      return;
    }
    trendsMutation.mutate({ niche: niche.trim(), platform });
  };

  const handleCompetitorAnalysis = () => {
    if (!competitorHandle.trim()) {
      toast({ title: "Enter a channel", description: "Please enter a channel name or URL", variant: "destructive" });
      return;
    }
    competitorMutation.mutate({ channelIdentifier: competitorHandle.trim(), platform: competitorPlatform });
  };

  const getViralScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500/20 text-green-700 dark:text-green-400";
    if (score >= 60) return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    return "bg-red-500/20 text-red-700 dark:text-red-400";
  };

  return (
    <div className="p-6 space-y-6" data-testid="research-page">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          Trend Research
        </h1>
        <p className="text-muted-foreground">
          Find viral content ideas and analyze competitor strategies
        </p>
      </div>

      <Tabs defaultValue="trends" className="space-y-6">
        <TabsList>
          <TabsTrigger value="trends" className="flex items-center gap-2" data-testid="tab-trends">
            <TrendingUp className="w-4 h-4" />
            Viral Trends
          </TabsTrigger>
          <TabsTrigger value="competitors" className="flex items-center gap-2" data-testid="tab-competitors">
            <Users className="w-4 h-4" />
            Competitor Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-5 h-5" />
                Research Viral Topics
              </CardTitle>
              <CardDescription>
                Find trending topics in your niche with viral potential scores
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Enter your niche (e.g., 'scary facts', 'psychology', 'history')"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className="flex-1"
                  data-testid="input-niche"
                />
                <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
                  <SelectTrigger className="w-[180px]" data-testid="select-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">All Platforms</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube_shorts">YouTube Shorts</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleTrendResearch} 
                  disabled={trendsMutation.isPending}
                  data-testid="button-research"
                >
                  {trendsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Research
                </Button>
              </div>

              {trendsMutation.data && (
                <div className="space-y-4 mt-6">
                  {trendsMutation.data.insights && (
                    <div className="rounded-lg bg-primary/5 p-4">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-sm">Insights</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {trendsMutation.data.insights}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {trendsMutation.data.trends.map((trend, index) => (
                      <Card key={index} className="overflow-visible">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-semibold">{trend.topic}</h3>
                                <Badge className={getViralScoreColor(trend.viralScore)}>
                                  <Zap className="w-3 h-3 mr-1" />
                                  {trend.viralScore}% Viral
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{trend.description}</p>
                              <div className="flex items-start gap-2 mt-2">
                                <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                <p className="text-sm"><span className="font-medium">Suggested Angle:</span> {trend.suggestedAngle}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap mt-2">
                                <Hash className="w-4 h-4 text-muted-foreground" />
                                {trend.hashtags.map((tag, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="competitors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5" />
                Analyze Competitor
              </CardTitle>
              <CardDescription>
                Learn from successful creators - see what content performs best
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  placeholder="Channel name or handle (e.g., '@username' or channel name)"
                  value={competitorHandle}
                  onChange={(e) => setCompetitorHandle(e.target.value)}
                  className="flex-1"
                  data-testid="input-competitor"
                />
                <Select value={competitorPlatform} onValueChange={(v) => setCompetitorPlatform(v as typeof competitorPlatform)}>
                  <SelectTrigger className="w-[140px]" data-testid="select-competitor-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleCompetitorAnalysis} 
                  disabled={competitorMutation.isPending}
                  data-testid="button-analyze"
                >
                  {competitorMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 mr-2" />
                  )}
                  Analyze
                </Button>
              </div>

              {competitorMutation.data && (
                <div className="space-y-6 mt-6">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{competitorMutation.data.channelName}</h3>
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </div>

                  {competitorMutation.data.topPerformingTopics.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="font-medium flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        Top Performing Content
                      </h4>
                      {competitorMutation.data.topPerformingTopics.map((topic, index) => (
                        <Card key={index}>
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <h5 className="font-medium">{topic.topic}</h5>
                              <Badge variant="secondary">{topic.estimatedViews} views</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium">Why it works:</span> {topic.whyItWorks}
                            </p>
                            <div className="flex items-start gap-2 mt-2 rounded-lg bg-primary/5 p-3">
                              <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                              <p className="text-sm">
                                <span className="font-medium">How to adapt:</span> {topic.howToAdapt}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {competitorMutation.data.contentPatterns.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Content Patterns</h4>
                      <ul className="space-y-1">
                        {competitorMutation.data.contentPatterns.map((pattern, index) => (
                          <li key={index} className="text-sm text-muted-foreground flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {pattern}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {competitorMutation.data.recommendations.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Strategic Recommendations
                      </h4>
                      <ul className="space-y-2">
                        {competitorMutation.data.recommendations.map((rec, index) => (
                          <li key={index} className="text-sm flex items-start gap-2 rounded-lg border p-3">
                            <span className="font-bold text-primary">{index + 1}.</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

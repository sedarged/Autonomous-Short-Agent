// AI Service using Replit AI Integrations for OpenAI access
// This does not require your own API key - charges are billed to your Replit credits

import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import type { ContentType, JobSettings, Scene } from "@shared/schema";
import { contentTypeInfo, premiumContentTypes } from "@shared/schema";

// Dummy mode for testing without AI costs
export const DUMMY_MODE = process.env.DUMMY_MODE === 'true';

// Tiered model strategy for cost optimization
// Premium model for creative content that requires high quality
const PREMIUM_MODEL = "gpt-5";
// Economy model for simple, structured tasks (prompts, captions)
const ECONOMY_MODEL = "gpt-4o-mini";

// Get appropriate model based on task complexity and content type
function getModelForScript(contentType: ContentType): string {
  return premiumContentTypes.includes(contentType) ? PREMIUM_MODEL : ECONOMY_MODEL;
}

// This is using Replit's AI Integrations service
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

// Helper function to check if error is rate limit or quota violation
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

// Rate limiter for concurrent API calls
const limit = pLimit(2);

// Generate script based on content type, configuration, and full job settings
export async function generateScript(
  contentType: ContentType,
  config: Record<string, any>,
  settings?: {
    targetDurationSeconds?: number;
    targetPlatform?: string;
    viralOptimization?: {
      hookStrength?: string;
      pacingStyle?: string;
      ctaEnabled?: boolean;
    };
  }
): Promise<{ script: string; scenes: Scene[] }> {
  const targetDuration = settings?.targetDurationSeconds || 90;
  const hookStrength = settings?.viralOptimization?.hookStrength || 'strong';
  const pacingStyle = settings?.viralOptimization?.pacingStyle || 'fast';
  const ctaEnabled = settings?.viralOptimization?.ctaEnabled !== false;
  
  // Dummy mode: return deterministic content
  if (DUMMY_MODE) {
    return getDummyScript(contentType, config, targetDuration);
  }

  const info = contentTypeInfo[contentType];
  const prompt = config.prompt || "";
  const targetPlatform = settings?.targetPlatform;
  
  const systemPrompt = buildSystemPrompt(contentType, { hookStrength, pacingStyle, ctaEnabled }, targetPlatform);
  const userPrompt = buildUserPrompt(contentType, config, targetDuration);

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: getModelForScript(contentType),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 4096,
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) {
          throw error;
        }
        throw new AbortError(error);
      }
    },
    {
      retries: 5,
      minTimeout: 2000,
      maxTimeout: 32000,
      factor: 2,
    }
  );

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  
  return {
    script: parsed.script || parsed.fullScript || "",
    scenes: buildScenes(parsed, contentType)
  };
}

// Generate background image prompt for a scene
export async function generateImagePrompt(
  scene: Scene,
  stylePrompt?: string,
  contentType?: ContentType
): Promise<string> {
  // Dummy mode: return deterministic prompt
  if (DUMMY_MODE) {
    return `Test image for: ${(scene.textOverlay || scene.voiceSegmentText || 'scene').slice(0, 50)}`;
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: ECONOMY_MODEL,
          messages: [
            { 
              role: "system", 
              content: `You are a visual prompt engineer. Create concise, detailed prompts for AI image generation.
                       Style: ${stylePrompt || "cinematic, high quality, dramatic lighting"}
                       Focus on: backgrounds, environments, abstract representations
                       Avoid: text, words, letters, faces (unless requested)`
            },
            { 
              role: "user", 
              content: `Create an image prompt for this video scene text: "${scene.textOverlay || scene.voiceSegmentText}"
                       Return JSON: { "prompt": "your detailed image prompt" }`
            }
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 256,
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 1000 }
  );

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return parsed.prompt || "abstract background, cinematic lighting";
}

// Generate image using DALL-E/gpt-image-1
export async function generateImage(prompt: string): Promise<Buffer> {
  // Dummy mode: return a small placeholder image (1x1 pixel PNG)
  if (DUMMY_MODE) {
    // Simple 100x100 solid color PNG (minimal valid PNG)
    const canvas = Buffer.alloc(100 * 100 * 4);
    for (let i = 0; i < 100 * 100; i++) {
      canvas[i * 4] = 30;     // R
      canvas[i * 4 + 1] = 30; // G
      canvas[i * 4 + 2] = 50; // B
      canvas[i * 4 + 3] = 255; // A
    }
    // Return minimal placeholder - renderer will create proper placeholder
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.images.generate({
          model: "gpt-image-1",
          prompt,
          size: "1024x1024",
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 2000 }
  );

  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

// Text-to-Speech voices available in OpenAI
export const TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type TTSVoice = typeof TTS_VOICES[number];

// Generate speech from text using OpenAI TTS
export async function generateSpeech(
  text: string,
  voice: TTSVoice = 'nova'
): Promise<Buffer> {
  // Dummy mode: return minimal MP3 (silence)
  if (DUMMY_MODE) {
    // Minimal valid MP3 file (silence)
    return Buffer.from('//uQxAAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV', 'base64');
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.audio.speech.create({
          model: "tts-1",
          voice,
          input: text,
          response_format: "mp3"
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 2000 }
  );

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Generate caption and hashtags
export async function generateCaptionAndHashtags(
  contentType: ContentType,
  script: string
): Promise<{ caption: string; hashtags: string[] }> {
  // Dummy mode: return deterministic caption
  if (DUMMY_MODE) {
    return {
      caption: `Test ${contentTypeInfo[contentType].label} video - Check this out!`,
      hashtags: ['test', 'video', contentType.replace(/_/g, ''), 'shorts', 'viral']
    };
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: ECONOMY_MODEL,
          messages: [
            { 
              role: "system", 
              content: `You are a social media expert. Create engaging TikTok/YouTube Shorts captions.
                       Keep captions short, punchy, and attention-grabbing.
                       Include 5-8 relevant hashtags (without the # symbol).`
            },
            { 
              role: "user", 
              content: `Create a caption and hashtags for this ${contentTypeInfo[contentType].label} video:
                       "${script.slice(0, 500)}..."
                       Return JSON: { "caption": "...", "hashtags": ["tag1", "tag2", ...] }`
            }
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 256,
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 1000 }
  );

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    caption: parsed.caption || "",
    hashtags: parsed.hashtags || []
  };
}

// Generate trending topic suggestions for a content type
export async function suggestTrendingTopics(
  contentType: ContentType
): Promise<{ topics: string[]; inspiration: string }> {
  // Dummy mode: return mock suggestions
  if (DUMMY_MODE) {
    const mockTopics: Record<string, string[]> = {
      reddit_story: ["Workplace revenge story", "Entitled neighbor encounter", "Wedding disaster story"],
      aita_story: ["Family inheritance drama", "Friend wedding seating controversy", "Roommate boundary dispute"],
      facts: ["Mind-blowing space facts", "Psychology tricks you didn't know", "Historical facts that seem fake"],
      would_you_rather: ["Impossible food choices", "Superpower dilemmas", "Time travel paradoxes"],
      quiz_trivia: ["Pop culture 2024 quiz", "Geography brain teasers", "Science myths debunked"],
      motivation: ["Morning routine success", "Overcoming imposter syndrome", "Financial freedom mindset"]
    };
    
    return {
      topics: mockTopics[contentType] || ["Trending topic 1", "Trending topic 2", "Trending topic 3"],
      inspiration: "These topics are currently performing well on social media based on engagement patterns."
    };
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: ECONOMY_MODEL,
          messages: [
            { 
              role: "system", 
              content: `You are a viral content strategist who tracks trending topics on TikTok, YouTube Shorts, and Instagram Reels.
                       Suggest 5 highly engaging topic ideas that would perform well right now.
                       Focus on topics with high share potential and strong emotional resonance.`
            },
            { 
              role: "user", 
              content: `Suggest 5 trending topic ideas for ${contentTypeInfo[contentType].label} content.
                       These should be topics that are currently performing well or have viral potential.
                       Return JSON: { "topics": ["topic1", "topic2", ...], "inspiration": "brief explanation of why these are trending" }`
            }
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 512,
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 1000 }
  );

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    topics: parsed.topics || [],
    inspiration: parsed.inspiration || "Suggested based on current social media trends."
  };
}

// Edit command types for conversational editing
export interface EditCommand {
  action: 'regenerate_caption' | 'update_caption' | 'regenerate_script' | 'adjust_pacing' | 'change_hook' | 'other';
  targetStage: 'script' | 'caption' | 'full' | null;
  parameters: Record<string, any>;
  explanation: string;
}

// Process natural language edit requests
export async function processEditCommand(
  message: string,
  jobContext: {
    scriptText?: string;
    caption?: string;
    hashtags?: string[];
    contentType: string;
  }
): Promise<{ response: string; commands: EditCommand[] }> {
  // Dummy mode: return simple responses
  if (DUMMY_MODE) {
    if (message.toLowerCase().includes('caption')) {
      return {
        response: "I'll regenerate the caption with your suggestions in mind. The new caption has been updated.",
        commands: [{ action: 'regenerate_caption', targetStage: 'caption', parameters: { prompt: message }, explanation: 'Regenerate caption' }]
      };
    }
    if (message.toLowerCase().includes('hook') || message.toLowerCase().includes('opening')) {
      return {
        response: "I'll strengthen the hook in your script to make it more attention-grabbing.",
        commands: [{ action: 'change_hook', targetStage: 'script', parameters: { strength: 'strong' }, explanation: 'Adjust hook strength' }]
      };
    }
    return {
      response: "I understand your feedback. For major script changes, you may want to regenerate the video with updated settings.",
      commands: []
    };
  }

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: ECONOMY_MODEL,
          messages: [
            { 
              role: "system", 
              content: `You are a video editing assistant that helps users refine their short-form video content.
                       You can help with: caption updates, hashtag changes, script suggestions, hook improvements.
                       
                       For caption/hashtag updates, you can make changes directly.
                       For script changes, explain what would need to change but note it requires regeneration.
                       
                       Be helpful, concise, and constructive in your responses.
                       Return JSON: { "response": "your helpful response", "commands": [{ "action": "...", "targetStage": "...", "parameters": {...}, "explanation": "..." }] }
                       
                       Actions: regenerate_caption, update_caption, regenerate_script, adjust_pacing, change_hook, other
                       Target stages: script, caption, full, null`
            },
            { 
              role: "user", 
              content: `The user wants to edit their ${jobContext.contentType} video.
                       
Current caption: ${jobContext.caption || "(none)"}
Current hashtags: ${jobContext.hashtags?.join(', ') || "(none)"}
Script excerpt: ${(jobContext.scriptText || "").slice(0, 500)}

User request: "${message}"

Provide a helpful response and any applicable edit commands.`
            }
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: 512,
        });
        return result;
      } catch (error: any) {
        if (isRateLimitError(error)) throw error;
        throw new AbortError(error);
      }
    },
    { retries: 3, minTimeout: 1000 }
  );

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    response: parsed.response || "I'll help you with that request.",
    commands: parsed.commands || []
  };
}

// Build system prompt based on content type and viral optimization settings
function buildSystemPrompt(
  contentType: ContentType,
  viralSettings?: {
    hookStrength?: string;
    pacingStyle?: string;
    ctaEnabled?: boolean;
  },
  targetPlatform?: string
): string {
  const hookStrength = viralSettings?.hookStrength || 'strong';
  const pacingStyle = viralSettings?.pacingStyle || 'fast';
  const ctaEnabled = viralSettings?.ctaEnabled !== false;
  
  // Platform-specific guidance (supports multiple platforms)
  const platforms = (targetPlatform || 'tiktok').split(',').map(p => p.trim().toLowerCase());
  const platformGuides: string[] = [];
  
  if (platforms.includes('tiktok')) {
    platformGuides.push("TikTok: Raw authenticity and trend-awareness. Rewards creativity, humor, and relatable moments.");
  }
  if (platforms.includes('youtube_shorts')) {
    platformGuides.push("YouTube Shorts: Clear value proposition upfront. Viewers expect polished, educational content.");
  }
  if (platforms.includes('instagram_reels')) {
    platformGuides.push("Instagram Reels: Visually striking content. Audiences respond to aesthetic appeal and lifestyle content.");
  }
  
  // Default to TikTok if no platforms specified
  if (platformGuides.length === 0) {
    platformGuides.push("TikTok: Raw authenticity and trend-awareness. Rewards creativity, humor, and relatable moments.");
  }
  
  const platformGuidance = platformGuides.length === 1 
    ? `Optimize for ${platformGuides[0]}`
    : `Multi-platform content. Balance these platform requirements:\n    ${platformGuides.join('\n    ')}`;
  
  // Hook guidance based on strength setting
  const hookMap: Record<string, string> = {
    subtle: "Start with a gentle, intriguing opener that draws viewers in naturally",
    medium: "Start with an engaging hook that captures attention within the first 2 seconds",
    strong: "Start with an EXPLOSIVE hook in the first 1-2 seconds - use pattern interrupts, shocking statements, or immediate value promises"
  };
  const hookGuidance = hookMap[hookStrength] || hookMap.strong;
  
  // Pacing guidance
  const pacingMap: Record<string, string> = {
    slow: "Use a relaxed, meditative pace with longer pauses. Each segment can be 8-12 seconds.",
    medium: "Use a natural, conversational pace. Each segment should be 5-8 seconds.",
    fast: "Use rapid-fire delivery with quick cuts. Each segment should be 2-5 seconds maximum. Keep momentum HIGH."
  };
  const pacingGuidance = pacingMap[pacingStyle] || pacingMap.fast;
  
  const ctaGuidance = ctaEnabled 
    ? "End with a strong call-to-action (like, follow, comment, share)"
    : "End naturally without a direct call-to-action";

  const basePrompt = `You are an elite viral content scriptwriter who has studied the psychology of what makes TikTok and YouTube Shorts go viral.
    
    PLATFORM FOCUS: ${platformGuidance}
    
    Your content MUST be optimized for maximum engagement and watch time.
    Always structure your response as JSON with the following fields:
    - script: The full narration text
    - segments: Array of text segments for scenes
    
    VIRAL OPTIMIZATION RULES:
    - ${hookGuidance}
    - ${pacingGuidance}
    - ${ctaGuidance}
    - Use conversational, relatable language that feels authentic
    - Create curiosity gaps that keep viewers watching
    - Use open loops (hint at something coming without revealing it)
    - End segments on mini-cliffhangers to prevent scroll-away
    - Punctuate for natural, energetic speech pacing`;

  const typeSpecificPrompts: Partial<Record<ContentType, string>> = {
    reddit_story: `${basePrompt}
      For Reddit stories:
      - Use first-person perspective
      - Build suspense and emotional engagement
      - Include dialogue where appropriate`,
    aita_story: `${basePrompt}
      For AITA stories:
      - Present a moral dilemma situation
      - Include multiple perspectives
      - Build tension and ask for viewer judgment`,
    two_sentence_horror: `${basePrompt}
      For Two-Sentence Horror:
      - Build dread in the first sentence
      - Deliver a shocking twist in the second
      - Keep the terror visceral and unexpected`,
    short_story_generic: `${basePrompt}
      For Short Stories:
      - Create compelling characters quickly
      - Build a clear narrative arc
      - End with impact or a twist`,
    would_you_rather: `${basePrompt}
      For Would You Rather:
      - Present 2 difficult choices
      - Build anticipation before revealing options
      - Ask viewers to comment their choice`,
    this_or_that: `${basePrompt}
      For This or That:
      - Present clear binary choices
      - Make options equally appealing or challenging
      - Encourage viewer engagement`,
    quiz_trivia: `${basePrompt}
      For Quiz/Trivia:
      - Present questions clearly
      - Give viewers time to think
      - Reveal answer with interesting context`,
    riddles: `${basePrompt}
      For Riddles:
      - Present the riddle with dramatic flair
      - Give viewers time to think
      - Reveal the answer with explanation`,
    guessing_game: `${basePrompt}
      For Guessing Games:
      - Build suspense with clues
      - Encourage viewer participation
      - Reveal the answer satisfyingly`,
    facts: `${basePrompt}
      For Facts content:
      - Lead with the most surprising fact
      - Keep each fact punchy and memorable
      - Connect facts with smooth transitions`,
    top_list: `${basePrompt}
      For Top Lists:
      - Build anticipation through ranking
      - Save the best for last
      - Make each item memorable`,
    motivation: `${basePrompt}
      For Motivational content:
      - Open with a powerful statement
      - Build emotional momentum
      - End with an empowering call-to-action`,
    affirmations: `${basePrompt}
      For Affirmations:
      - Use positive, present-tense language
      - Make each affirmation personal
      - Build confidence and self-love`,
    language_mini_lesson: `${basePrompt}
      For Language Lessons:
      - Introduce one word or phrase clearly
      - Provide pronunciation guidance
      - Give memorable usage examples`,
    mini_history: `${basePrompt}
      For Mini History:
      - Start with a surprising hook
      - Tell the story dramatically
      - Connect history to present day`,
    science_mini_fact: `${basePrompt}
      For Science Facts:
      - Make complex concepts accessible
      - Use vivid comparisons
      - End with a mind-blowing implication`,
  };

  return typeSpecificPrompts[contentType] || basePrompt;
}

// Build user prompt based on content type, config, and target duration
function buildUserPrompt(contentType: ContentType, config: Record<string, any>, targetDurationSeconds?: number): string {
  const prompt = config.prompt || "";
  const count = config.count || 5;
  const topic = config.topic || prompt;
  const duration = targetDurationSeconds || 90;
  
  // Duration guidance for the AI
  const durationGuide = duration >= 120 
    ? `Create content for a ${Math.floor(duration / 60)}-${Math.ceil(duration / 60)} minute video. Include more detail and development.`
    : duration >= 60 
    ? `Create content for a ${duration} second video. Standard TikTok length with good pacing.`
    : `Create content for a ${duration} second SHORT video. Be concise and punchy.`;
  
  const typeSpecificPrompts: Partial<Record<ContentType, string>> = {
    reddit_story: `${durationGuide}\n\nCreate a Reddit-style story about: "${prompt || 'an interesting personal experience'}"`,
    aita_story: `${durationGuide}\n\nCreate an AITA (Am I The A**hole) story about: "${prompt || 'a moral dilemma situation'}"`,
    two_sentence_horror: `${durationGuide}\n\nCreate a two-sentence horror story about: "${prompt || 'something terrifying'}"`,
    short_story_generic: `${durationGuide}\n\nCreate a short fictional story about: "${prompt || 'an unexpected adventure'}"`,
    would_you_rather: `${durationGuide}\n\nCreate ${count} Would You Rather questions about: "${topic || 'interesting dilemmas'}"`,
    this_or_that: `${durationGuide}\n\nCreate ${count} This or That choices about: "${topic || 'popular comparisons'}"`,
    quiz_trivia: `${durationGuide}\n\nCreate ${count} trivia questions about: "${topic || 'interesting facts'}"`,
    riddles: `${durationGuide}\n\nCreate ${count} clever riddles about: "${topic || 'everyday objects and concepts'}"`,
    guessing_game: `${durationGuide}\n\nCreate a guessing game with ${count} clues about: "${topic || 'a famous person or thing'}"`,
    facts: `${durationGuide}\n\nCreate ${count} fascinating facts about: "${topic || 'interesting topics'}"`,
    top_list: `${durationGuide}\n\nCreate a Top ${count} list about: "${topic || 'interesting things'}"`,
    motivation: `${durationGuide}\n\nCreate a motivational piece about: "${prompt || 'success and perseverance'}"`,
    affirmations: `${durationGuide}\n\nCreate ${count} positive affirmations about: "${topic || 'self-love and confidence'}"`,
    language_mini_lesson: `${durationGuide}\n\nCreate a mini language lesson teaching ${count} words/phrases in "${topic || 'Spanish'}"`,
    mini_history: `${durationGuide}\n\nCreate a mini history lesson about: "${topic || 'an interesting historical event'}"`,
    science_mini_fact: `${durationGuide}\n\nCreate ${count} mind-blowing science facts about: "${topic || 'the universe'}"`,
  };

  return typeSpecificPrompts[contentType] || 
    `${durationGuide}\n\nCreate engaging content for ${contentTypeInfo[contentType].label}: "${prompt}"`;
}

// Build scenes from parsed script
function buildScenes(parsed: any, contentType: ContentType): Scene[] {
  const segments = parsed.segments || parsed.scenes || [];
  const scenes: Scene[] = [];
  
  let currentTime = 0;
  const avgDuration = 5; // seconds per segment

  if (segments.length === 0 && parsed.script) {
    // Split script into sentences if no segments provided
    const sentences = parsed.script.split(/[.!?]+/).filter((s: string) => s.trim());
    const chunkSize = Math.ceil(sentences.length / 6); // ~6 scenes
    
    for (let i = 0; i < sentences.length; i += chunkSize) {
      const text = sentences.slice(i, i + chunkSize).join('. ').trim();
      if (text) {
        scenes.push({
          id: `scene-${scenes.length + 1}`,
          index: scenes.length,
          startTime: currentTime,
          endTime: currentTime + avgDuration,
          textOverlay: text.slice(0, 100), // Short overlay
          voiceSegmentText: text,
        });
        currentTime += avgDuration;
      }
    }
  } else {
    for (const segment of segments) {
      const text = typeof segment === 'string' ? segment : segment.text;
      scenes.push({
        id: `scene-${scenes.length + 1}`,
        index: scenes.length,
        startTime: currentTime,
        endTime: currentTime + avgDuration,
        textOverlay: text?.slice(0, 100) || "",
        voiceSegmentText: text || "",
      });
      currentTime += avgDuration;
    }
  }

  return scenes;
}

// Dummy script generator for testing
function getDummyScript(
  contentType: ContentType, 
  config: Record<string, any>,
  targetDurationSeconds?: number
): { script: string; scenes: Scene[] } {
  const count = config.count || 5;
  const duration = targetDurationSeconds || 90;
  const segments: string[] = [];
  
  // Calculate number of scenes based on target duration (roughly 5-8 seconds per scene)
  const avgSceneDuration = 6;
  const targetScenes = Math.max(3, Math.ceil(duration / avgSceneDuration));
  
  switch (contentType) {
    case 'facts':
      for (let i = 1; i <= Math.min(count, targetScenes); i++) {
        segments.push(`Fact ${i}: This is an interesting test fact about the world.`);
      }
      break;
    case 'would_you_rather':
      for (let i = 1; i <= Math.min(count, targetScenes); i++) {
        segments.push(`Would you rather have option A or option B? Question ${i}.`);
      }
      break;
    case 'short_story_generic':
    case 'reddit_story':
      const storyParts = [
        "This is the beginning of a test story.",
        "Something interesting happens in the middle.",
        "The story reaches its climax here.",
        "And this is how it all ends."
      ];
      // Add more segments for longer videos
      for (let i = 0; i < Math.min(targetScenes, storyParts.length + Math.floor(targetScenes / 4)); i++) {
        segments.push(storyParts[i % storyParts.length]);
      }
      break;
    default:
      for (let i = 1; i <= Math.min(count, targetScenes); i++) {
        segments.push(`Test segment ${i} for ${contentTypeInfo[contentType].label} content.`);
      }
  }
  
  const script = segments.join(' ');
  const sceneDuration = duration / segments.length;
  const scenes: Scene[] = segments.map((text, i) => ({
    id: `scene-${i + 1}`,
    index: i,
    startTime: i * sceneDuration,
    endTime: (i + 1) * sceneDuration,
    textOverlay: text.slice(0, 100),
    voiceSegmentText: text
  }));
  
  return { script, scenes };
}

export { openai };

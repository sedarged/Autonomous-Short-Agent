// AI Service using Replit AI Integrations for OpenAI access
// This does not require your own API key - charges are billed to your Replit credits

import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry from "p-retry";
import type { ContentType, JobSettings, Scene } from "@shared/schema";
import { contentTypeInfo } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const DEFAULT_MODEL = "gpt-5";

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

// Generate script based on content type and configuration
export async function generateScript(
  contentType: ContentType,
  config: Record<string, any>
): Promise<{ script: string; scenes: Scene[] }> {
  const info = contentTypeInfo[contentType];
  const prompt = config.prompt || "";
  
  const systemPrompt = buildSystemPrompt(contentType);
  const userPrompt = buildUserPrompt(contentType, config);

  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
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
        throw new pRetry.AbortError(error);
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
  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
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
        throw new pRetry.AbortError(error);
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
        throw new pRetry.AbortError(error);
      }
    },
    { retries: 3, minTimeout: 2000 }
  );

  const base64 = response.data[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

// Generate caption and hashtags
export async function generateCaptionAndHashtags(
  contentType: ContentType,
  script: string
): Promise<{ caption: string; hashtags: string[] }> {
  const response = await pRetry(
    async () => {
      try {
        const result = await openai.chat.completions.create({
          model: DEFAULT_MODEL,
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
        throw new pRetry.AbortError(error);
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

// Build system prompt based on content type
function buildSystemPrompt(contentType: ContentType): string {
  const basePrompt = `You are a professional short-form video scriptwriter. 
    Create engaging content optimized for TikTok and YouTube Shorts (30-90 seconds).
    Always structure your response as JSON with the following fields:
    - script: The full narration text
    - segments: Array of text segments for scenes (each 3-8 seconds of speaking)
    
    Rules:
    - Start with a strong hook (first 2 lines must grab attention)
    - Use conversational, natural language
    - Include a call-to-action at the end
    - Punctuate for natural speech pacing`;

  const typeSpecificPrompts: Partial<Record<ContentType, string>> = {
    reddit_story: `${basePrompt}
      For Reddit stories:
      - Use first-person perspective
      - Build suspense and emotional engagement
      - Include dialogue where appropriate`,
    would_you_rather: `${basePrompt}
      For Would You Rather:
      - Present 2 difficult choices
      - Build anticipation before revealing options
      - Ask viewers to comment their choice`,
    quiz_trivia: `${basePrompt}
      For Quiz/Trivia:
      - Present questions clearly
      - Give viewers time to think
      - Reveal answer with interesting context`,
    facts: `${basePrompt}
      For Facts content:
      - Lead with the most surprising fact
      - Keep each fact punchy and memorable
      - Connect facts with smooth transitions`,
    motivation: `${basePrompt}
      For Motivational content:
      - Open with a powerful statement
      - Build emotional momentum
      - End with an empowering call-to-action`,
  };

  return typeSpecificPrompts[contentType] || basePrompt;
}

// Build user prompt based on content type and config
function buildUserPrompt(contentType: ContentType, config: Record<string, any>): string {
  const prompt = config.prompt || "";
  const count = config.count || 5;
  const topic = config.topic || prompt;
  
  const typeSpecificPrompts: Partial<Record<ContentType, string>> = {
    reddit_story: `Create a Reddit-style story about: "${prompt || 'an interesting personal experience'}"`,
    aita_story: `Create an AITA (Am I The A**hole) story about: "${prompt || 'a moral dilemma situation'}"`,
    two_sentence_horror: `Create a two-sentence horror story about: "${prompt || 'something terrifying'}"`,
    would_you_rather: `Create ${count} Would You Rather questions about: "${topic || 'interesting dilemmas'}"`,
    this_or_that: `Create ${count} This or That choices about: "${topic || 'popular comparisons'}"`,
    quiz_trivia: `Create ${count} trivia questions about: "${topic || 'interesting facts'}"`,
    facts: `Create ${count} fascinating facts about: "${topic || 'interesting topics'}"`,
    top_list: `Create a Top ${count} list about: "${topic || 'interesting things'}"`,
    motivation: `Create a motivational piece about: "${prompt || 'success and perseverance'}"`,
    affirmations: `Create ${count} positive affirmations about: "${topic || 'self-love and confidence'}"`,
  };

  return typeSpecificPrompts[contentType] || 
    `Create engaging content for ${contentTypeInfo[contentType].label}: "${prompt}"`;
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

export { openai };

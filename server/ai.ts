// AI Service using Replit AI Integrations for OpenAI access
// This does not require your own API key - charges are billed to your Replit credits

import OpenAI from "openai";
import pLimit from "p-limit";
import pRetry, { AbortError } from "p-retry";
import type { ContentType, JobSettings, Scene } from "@shared/schema";
import { contentTypeInfo, premiumContentTypes } from "@shared/schema";

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

  const base64 = response.data[0]?.b64_json ?? "";
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

// Build user prompt based on content type and config
function buildUserPrompt(contentType: ContentType, config: Record<string, any>): string {
  const prompt = config.prompt || "";
  const count = config.count || 5;
  const topic = config.topic || prompt;
  
  const typeSpecificPrompts: Partial<Record<ContentType, string>> = {
    reddit_story: `Create a Reddit-style story about: "${prompt || 'an interesting personal experience'}"`,
    aita_story: `Create an AITA (Am I The A**hole) story about: "${prompt || 'a moral dilemma situation'}"`,
    two_sentence_horror: `Create a two-sentence horror story about: "${prompt || 'something terrifying'}"`,
    short_story_generic: `Create a short fictional story about: "${prompt || 'an unexpected adventure'}"`,
    would_you_rather: `Create ${count} Would You Rather questions about: "${topic || 'interesting dilemmas'}"`,
    this_or_that: `Create ${count} This or That choices about: "${topic || 'popular comparisons'}"`,
    quiz_trivia: `Create ${count} trivia questions about: "${topic || 'interesting facts'}"`,
    riddles: `Create ${count} clever riddles about: "${topic || 'everyday objects and concepts'}"`,
    guessing_game: `Create a guessing game with ${count} clues about: "${topic || 'a famous person or thing'}"`,
    facts: `Create ${count} fascinating facts about: "${topic || 'interesting topics'}"`,
    top_list: `Create a Top ${count} list about: "${topic || 'interesting things'}"`,
    motivation: `Create a motivational piece about: "${prompt || 'success and perseverance'}"`,
    affirmations: `Create ${count} positive affirmations about: "${topic || 'self-love and confidence'}"`,
    language_mini_lesson: `Create a mini language lesson teaching ${count} words/phrases in "${topic || 'Spanish'}"`,
    mini_history: `Create a mini history lesson about: "${topic || 'an interesting historical event'}"`,
    science_mini_fact: `Create ${count} mind-blowing science facts about: "${topic || 'the universe'}"`,
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

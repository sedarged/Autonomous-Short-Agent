// Video Renderer using ffmpeg for composing final videos
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { objectStorageService, objectStorageClient } from './objectStorage';
import type { Scene, JobSettings, VisualSettings, SubtitleSettings } from '@shared/schema';

const TEMP_DIR = '/tmp/video-render';
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FPS = 30;

interface RenderOptions {
  jobId: string;
  scenes: Scene[];
  settings: JobSettings;
  outputWidth?: number;
  outputHeight?: number;
}

interface IntegrityCheck {
  valid: boolean;
  error?: string;
  duration?: number;
  hasAudio?: boolean;
  width?: number;
  height?: number;
}

interface RenderResult {
  videoUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
  integrityCheck: IntegrityCheck;
}

// Get audio duration using ffprobe with retry logic
export async function getAudioDuration(audioPath: string, retries = 3): Promise<number> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const proc = spawn('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'json',
          audioPath
        ]);
        
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        
        proc.on('close', code => {
          if (code !== 0) {
            return reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(0, 200)}`));
          }
          
          try {
            const data = JSON.parse(stdout);
            const dur = parseFloat(data.format?.duration || '0');
            if (dur > 0) {
              resolve(dur);
            } else {
              reject(new Error('Invalid duration: 0 or negative'));
            }
          } catch (e) {
            reject(new Error(`Failed to parse ffprobe output: ${e}`));
          }
        });
        
        proc.on('error', (err) => {
          reject(new Error(`ffprobe spawn error: ${err.message}`));
        });
      });
      
      return duration;
    } catch (err) {
      console.error(`[Renderer] Audio duration detection attempt ${attempt}/${retries} failed:`, err);
      if (attempt === retries) {
        throw new Error(`Failed to detect audio duration after ${retries} attempts: ${err}`);
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 500 * attempt));
    }
  }
  
  throw new Error('Audio duration detection failed');
}

// Check video integrity using ffprobe
export async function checkVideoIntegrity(videoPath: string): Promise<IntegrityCheck> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type,width,height',
      '-of', 'json',
      videoPath
    ]);
    
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    
    proc.on('close', code => {
      if (code !== 0) {
        return resolve({ valid: false, error: `ffprobe failed: ${stderr.slice(0, 200)}` });
      }
      
      try {
        const data = JSON.parse(stdout);
        const duration = parseFloat(data.format?.duration || '0');
        const streams = data.streams || [];
        const hasAudio = streams.some((s: any) => s.codec_type === 'audio');
        const videoStream = streams.find((s: any) => s.codec_type === 'video');
        
        if (duration <= 0) {
          return resolve({ valid: false, error: 'No duration detected' });
        }
        
        // Check file size (must be > 10KB to be valid)
        fs.stat(videoPath).then(stats => {
          if (stats.size < 10000) {
            return resolve({ valid: false, error: 'File too small' });
          }
          
          resolve({ 
            valid: true, 
            duration,
            hasAudio,
            width: videoStream?.width,
            height: videoStream?.height
          });
        }).catch(() => {
          resolve({ valid: false, error: 'Cannot stat file' });
        });
        
      } catch (e) {
        resolve({ valid: false, error: 'Failed to parse ffprobe output' });
      }
    });
    
    proc.on('error', (err) => {
      resolve({ valid: false, error: `ffprobe error: ${err.message}` });
    });
  });
}

async function ensureTempDir(jobId: string): Promise<string> {
  const jobDir = path.join(TEMP_DIR, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  return jobDir;
}

async function cleanupTempDir(jobId: string): Promise<void> {
  const jobDir = path.join(TEMP_DIR, jobId);
  try {
    await fs.rm(jobDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`[Renderer] Failed to cleanup temp dir for ${jobId}:`, err);
  }
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  if (url.startsWith('/objects/')) {
    const file = await objectStorageService.getObjectEntityFile(url);
    const [contents] = await file.download();
    await fs.writeFile(destPath, contents);
  } else if (url.startsWith('http')) {
    const response = await fetch(url);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[Renderer] Running: ffmpeg ${args.join(' ')}`);
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
    
    let stderr = '';
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(err);
    });
  });
}

export async function renderVideo(options: RenderOptions): Promise<RenderResult> {
  const { jobId, scenes, settings } = options;
  const outputWidth = options.outputWidth || DEFAULT_WIDTH;
  const outputHeight = options.outputHeight || DEFAULT_HEIGHT;
  const fps = DEFAULT_FPS;
  
  const tempDir = await ensureTempDir(jobId);
  console.log(`[Renderer] Starting render for job ${jobId} with ${scenes.length} scenes at ${fps}fps`);
  
  try {
    // Use scene-specific durations based on audio length, fallback to 5s
    const sceneDurations: number[] = scenes.map(scene => scene.audioDurationSeconds || 5);
    const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
    
    const imageFiles: string[] = [];
    const audioFiles: string[] = [];
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      
      if (scene.backgroundAssetUrl) {
        const imagePath = path.join(tempDir, `scene_${i}.png`);
        try {
          await downloadFile(scene.backgroundAssetUrl, imagePath);
          imageFiles.push(imagePath);
        } catch (err) {
          console.error(`[Renderer] Failed to download image for scene ${i}:`, err);
          const placeholderPath = path.join(tempDir, `scene_${i}.png`);
          await createPlaceholderImage(placeholderPath, outputWidth, outputHeight);
          imageFiles.push(placeholderPath);
        }
      } else {
        const placeholderPath = path.join(tempDir, `scene_${i}.png`);
        await createPlaceholderImage(placeholderPath, outputWidth, outputHeight);
        imageFiles.push(placeholderPath);
      }
      
      if (scene.audioAssetUrl) {
        const audioPath = path.join(tempDir, `audio_${i}.mp3`);
        try {
          await downloadFile(scene.audioAssetUrl, audioPath);
          audioFiles.push(audioPath);
        } catch (err) {
          console.error(`[Renderer] Failed to download audio for scene ${i}:`, err);
        }
      }
    }
    
    const inputListPath = path.join(tempDir, 'inputs.txt');
    const inputListContent = imageFiles.map((f, i) => {
      return `file '${f}'\nduration ${sceneDurations[i]}`;
    }).join('\n') + `\nfile '${imageFiles[imageFiles.length - 1]}'\n`;
    await fs.writeFile(inputListPath, inputListContent);
    
    const silentVideoPath = path.join(tempDir, 'silent_video.mp4');
    
    // Ken Burns zoom effect - reduced scale from 2x to 1.5x for faster processing
    const UPSCALE_FACTOR = 1.5; // 1.5x is sufficient for smooth zoompan, 2x was overkill
    const kenBurnsFilter = scenes.map((_, i) => {
      const dur = sceneDurations[i];
      const zoomIn = i % 2 === 0;
      const zoomStart = zoomIn ? 1.0 : 1.15;
      const zoomEnd = zoomIn ? 1.15 : 1.0;
      const scaledWidth = Math.round(outputWidth * UPSCALE_FACTOR);
      const scaledHeight = Math.round(outputHeight * UPSCALE_FACTOR);
      return `[${i}:v]scale=${scaledWidth}:${scaledHeight},zoompan=z='${zoomStart}+(${zoomEnd}-${zoomStart})*on/${dur * fps}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${dur * fps}:s=${outputWidth}x${outputHeight}:fps=${fps}[v${i}]`;
    }).join(';');
    
    const concatInputs = scenes.map((_, i) => `[v${i}]`).join('');
    const complexFilter = `${kenBurnsFilter};${concatInputs}concat=n=${scenes.length}:v=1:a=0[outv]`;
    
    console.log(`[Renderer] Building silent video with ${scenes.length} scenes (${UPSCALE_FACTOR}x upscale, veryfast preset), total duration: ${totalDuration.toFixed(1)}s`);
    
    const ffmpegArgs = [
      '-y',
      ...imageFiles.flatMap((f, i) => ['-loop', '1', '-t', String(sceneDurations[i]), '-i', f]),
      '-filter_complex', complexFilter,
      '-map', '[outv]',
      '-c:v', 'libx264',
      '-preset', 'veryfast', // Changed from 'fast' for 2-3x speedup
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-g', '60', // GOP size for better seeking
      '-bf', '2', // B-frames for compression
      '-movflags', '+faststart', // Move moov atom to start for web streaming
      '-r', String(fps),
      silentVideoPath
    ];
    
    await runFFmpeg(ffmpegArgs);
    
    let finalVideoPath = silentVideoPath;
    
    if (audioFiles.length > 0) {
      const audioListPath = path.join(tempDir, 'audio_list.txt');
      const audioListContent = audioFiles.map(f => `file '${f}'`).join('\n');
      await fs.writeFile(audioListPath, audioListContent);
      
      const concatenatedAudioPath = path.join(tempDir, 'combined_audio.mp3');
      await runFFmpeg([
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', audioListPath,
        '-c:a', 'libmp3lame',
        '-q:a', '2',
        concatenatedAudioPath
      ]);
      
      const withAudioPath = path.join(tempDir, 'video_with_audio.mp4');
      console.log(`[Renderer] Merging audio with video`);
      await runFFmpeg([
        '-y',
        '-i', silentVideoPath,
        '-i', concatenatedAudioPath,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart', // Web streaming support
        withAudioPath
      ]);
      
      finalVideoPath = withAudioPath;
    }
    
    const subtitleSettings = settings.subtitles;
    if (subtitleSettings?.enabled && scenes.some(s => s.textOverlay)) {
      const withSubtitlesPath = path.join(tempDir, 'final_with_subtitles.mp4');
      
      const assPath = path.join(tempDir, 'subtitles.ass');
      const assContent = generateAssSubtitles(scenes, sceneDurations, subtitleSettings, outputWidth, outputHeight);
      await fs.writeFile(assPath, assContent);
      
      console.log(`[Renderer] Burning subtitles into video`);
      await runFFmpeg([
        '-y',
        '-i', finalVideoPath,
        '-vf', `ass=${assPath}`,
        '-c:v', 'libx264',
        '-preset', 'veryfast', // Changed from 'fast' for faster encoding
        '-crf', '23',
        '-c:a', 'copy',
        '-movflags', '+faststart', // Web streaming support
        withSubtitlesPath
      ]);
      
      finalVideoPath = withSubtitlesPath;
    }
    
    const videoBuffer = await fs.readFile(finalVideoPath);
    const videoFilename = `${jobId}/final.mp4`;
    const videoUrl = await objectStorageService.uploadBuffer(videoBuffer, 'video/mp4', videoFilename);
    
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
    await runFFmpeg([
      '-y',
      '-i', finalVideoPath,
      '-ss', '1',
      '-vframes', '1',
      '-q:v', '2',
      thumbnailPath
    ]);
    
    const thumbnailBuffer = await fs.readFile(thumbnailPath);
    const thumbnailFilename = `${jobId}/thumbnail.jpg`;
    const thumbnailUrl = await objectStorageService.uploadBuffer(thumbnailBuffer, 'image/jpeg', thumbnailFilename);
    
    // Check video integrity before declaring success
    const integrityCheck = await checkVideoIntegrity(finalVideoPath);
    
    await cleanupTempDir(jobId);
    
    console.log(`[Renderer] Completed render for job ${jobId} - integrity: ${integrityCheck.valid}`);
    
    return {
      videoUrl,
      thumbnailUrl,
      durationSeconds: totalDuration,
      integrityCheck
    };
    
  } catch (error) {
    await cleanupTempDir(jobId);
    throw error;
  }
}

async function createPlaceholderImage(path: string, width: number, height: number): Promise<void> {
  await runFFmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x1a1a2e:s=${width}x${height}:d=1`,
    '-frames:v', '1',
    path
  ]);
}

function generateAssSubtitles(
  scenes: Scene[], 
  sceneDurations: number[], 
  settings: SubtitleSettings,
  width: number,
  height: number
): string {
  const fontSize = Math.round(height * 0.045);
  const outlineSize = Math.round(fontSize * 0.1);
  const marginV = Math.round(height * 0.15);
  
  const primaryColor = '&H00FFFFFF';
  const outlineColor = '&H00000000';
  const shadowColor = '&H80000000';
  
  let ass = `[Script Info]
Title: Video Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},1,0,0,0,100,100,0,0,1,${outlineSize},2,2,50,50,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let currentTime = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const text = scene.textOverlay || '';
    const dur = sceneDurations[i] || 5;
    
    if (text.trim()) {
      const startFormatted = formatAssTime(currentTime);
      const endFormatted = formatAssTime(currentTime + dur);
      const escapedText = text.replace(/\n/g, '\\N').replace(/,/g, '\\,');
      ass += `Dialogue: 0,${startFormatted},${endFormatted},Default,,0,0,0,,${escapedText}\n`;
    }
    
    currentTime += dur;
  }
  
  return ass;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

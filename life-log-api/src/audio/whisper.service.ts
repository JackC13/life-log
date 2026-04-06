import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toFile } from 'openai';
import { LifeLogEvent } from '../common/types';

@Injectable()
export class WhisperService {
  private readonly logger = new Logger(WhisperService.name);
  private openai: OpenAI;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.getOrThrow('OPENAI_API_KEY') });
  }

  /**
   * 呼叫 Whisper API，回傳含絕對時間戳的事件陣列。
   * @param audioBuffer - 音訊 buffer
   * @param chunkStartTime - 此 chunk 在全局時間軸的起始 ms
   */
  async transcribe(
    audioBuffer: Buffer,
    chunkStartTime: number,
    language?: string,
    mimeType = 'audio/webm',
  ): Promise<Omit<LifeLogEvent, 'id' | 'track_id' | 'audio_url' | 'embedding'>[]> {
    const ext = mimeType.includes('mp4') || mimeType.includes('aac') ? 'mp4' : 'webm';
    const file = await toFile(audioBuffer, `audio.${ext}`, { type: mimeType });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      ...(language && language !== 'auto' ? { language } : {}),
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    // Whisper segments 的 start/end 是「相對於該檔案」的秒數
    // 加上 chunkStartTime offset 換算成全局絕對時間 ms
    return (response.segments ?? [])
      .map((seg) => ({
        start_time: chunkStartTime + Math.round(seg.start * 1000),
        end_time: chunkStartTime + Math.round(seg.end * 1000),
        content: seg.text.trim(),
        tags: [],
      }))
      .filter((seg) => this.isValidContent(seg.content));
  }

  /** Whisper 在無聲或雜音時容易產生幻覺文字，過濾掉這些 */
  private isValidContent(text: string): boolean {
    if (!text || text.length < 2) return false;

    // 已知的 Whisper 幻覺片語
    const hallucinations = [
      '日常生活對話', 'daily life', 'shopping list',
      'thank you', 'thanks for watching', 'please subscribe',
      '謝謝', '謝謝觀看', '字幕', 'subtitle',
    ];

    const lower = text.toLowerCase();
    return !hallucinations.some((h) => lower.includes(h.toLowerCase()));
  }
}

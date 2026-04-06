import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { WhisperService } from './whisper.service';
import { EventsService } from '../events/events.service';
import { EmbeddingService } from '../common/embedding.service';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  constructor(
    private supabase: SupabaseService,
    private whisper: WhisperService,
    private events: EventsService,
    private embedding: EmbeddingService,
  ) {}

  async processChunk(
    file: Express.Multer.File,
    trackId: string,
    startTime: number,
    language?: string,
  ) {
    // track 名稱轉 UUID
    const resolvedTrackId = await this.events.resolveTrackId(trackId);

    // 1. 上傳音檔至 Supabase Storage
    const audioUrl = await this.uploadToStorage(file, resolvedTrackId, startTime);
    this.logger.log(`Uploaded chunk: ${audioUrl}`);

    // 2. 呼叫 Whisper 取得逐字稿（含時間戳）
    const segments = await this.whisper.transcribe(file.buffer, startTime, language, file.mimetype);
    this.logger.log(`Transcribed ${segments.length} segments`);

    if (!segments.length) return { success: true, segmentCount: 0 };

    // 3. 批次產生 Embedding（文字 → 向量）
    const texts = segments.map((s) => s.content);
    const embeddings = await this.embedding.embedBatch(texts);
    this.logger.log(`Embedded ${embeddings.length} segments`);

    // 4. 將 segments + embedding 寫入 events 資料表
    await this.events.insertMany(
      segments.map((s, i) => ({
        ...s,
        track_id: resolvedTrackId,
        audio_url: audioUrl,
        embedding: embeddings[i],
      })),
    );

    return { success: true, segmentCount: segments.length };
  }

  async getSignedUrl(path: string): Promise<{ url: string }> {
    const { data, error } = await this.supabase.db.storage
      .from('life-log-audio-chunks')
      .createSignedUrl(path, 3600); // 1 小時有效

    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`);
    return { url: data.signedUrl };
  }

  private async uploadToStorage(
    file: Express.Multer.File,
    trackId: string,
    startTime: number,
  ): Promise<string> {
    const ext = file.mimetype.includes('mp4') || file.mimetype.includes('aac') ? 'mp4' : 'webm';
    const path = `${trackId}/${startTime}.${ext}`;
    const { error } = await this.supabase.db.storage
      .from('life-log-audio-chunks')
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });

    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return path;
  }
}

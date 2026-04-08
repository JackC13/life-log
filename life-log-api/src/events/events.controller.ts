import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { EventsService } from './events.service';
import { EmbeddingService } from '../common/embedding.service';
import { TaggingService } from '../common/tagging.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly embedding: EmbeddingService,
    private readonly tagging: TaggingService,
  ) {}

  /**
   * GET /events?track_id=personal-life&limit=50&offset=0
   * 撈取對話事件列表（前端無限滾動用）
   */
  @Get()
  async list(
    @Query('track_id') trackId: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    try {
      return await this.eventsService.list(trackId, Number(limit), Number(offset));
    } catch (err) {
      return { error: true, message: err.message, stack: err.stack };
    }
  }

  /**
   * POST /events/text
   * 直接新增文字記事（不需錄音）
   */
  @Post('text')
  async createText(
    @Body() body: { content: string; track_id: string },
  ) {
    try {
      const { content, track_id } = body;
      const resolvedTrackId = await this.eventsService.resolveTrackId(track_id);
      const now = Date.now();

      // 產生 embedding + tags 同時進行
      const [[embeddingVector], [tags]] = await Promise.all([
        this.embedding.embedBatch([content]),
        this.tagging.tagBatch([content]),
      ]);

      await this.eventsService.insertMany([{
        track_id: resolvedTrackId,
        start_time: now,
        end_time: now,
        content,
        embedding: embeddingVector,
        tags: tags ?? [],
        audio_url: '',
      }]);

      return { success: true };
    } catch (err) {
      return { error: true, message: err.message };
    }
  }
}

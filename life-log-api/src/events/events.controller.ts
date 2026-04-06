import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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
      // 暫時回傳詳細錯誤，debug 用
      return { error: true, message: err.message, stack: err.stack };
    }
  }
}

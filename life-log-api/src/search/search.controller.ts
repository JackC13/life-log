import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * POST /search/ask
   * Body: { question: "我今天說要買什麼？", track_id: "personal-life" }
   * 回傳 AI 答案 + 來源事件片段
   */
  @Post('ask')
  async ask(
    @Body('question') question: string,
    @Body('track_id') trackId: string,
  ) {
    if (!question?.trim()) throw new BadRequestException('question is required');
    if (!trackId?.trim()) throw new BadRequestException('track_id is required');
    return this.searchService.ask(question.trim(), trackId.trim());
  }
}

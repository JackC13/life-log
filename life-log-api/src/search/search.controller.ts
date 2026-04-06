import { Controller, Post, Body } from '@nestjs/common';
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
    return this.searchService.ask(question, trackId);
  }
}

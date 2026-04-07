import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../common/supabase.service';
import { EventsService } from '../events/events.service';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SearchResult } from '../common/types';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;

  constructor(
    private config: ConfigService,
    private supabase: SupabaseService,
    private events: EventsService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.config.getOrThrow('OPENAI_API_KEY'),
    });
    this.gemini = new GoogleGenerativeAI(
      this.config.getOrThrow('GEMINI_API_KEY'),
    );
  }

  async ask(question: string, trackId: string) {
    // 0. track 名稱轉 UUID
    const resolvedTrackId = await this.events.resolveTrackId(trackId);

    // 1. 將問題向量化
    const embeddingRes = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: question,
    });
    const queryEmbedding = embeddingRes.data[0].embedding;

    // 2. 向量相似度搜尋（需在 Supabase 建立 match_events RPC function）
    const { data: matches, error } = await this.supabase.db.rpc(
      'match_events',
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 8,
        filter_track_id: resolvedTrackId,
      },
    );

    if (error) throw new Error(`Vector search failed: ${error.message}`);
    const sources: SearchResult[] = matches ?? [];
    this.logger.log(
      `Vector search returned ${sources.length} matches for: "${question}"`,
    );

    // 3. 組成 RAG context，送給 Gemini
    const context = sources
      .map(
        (s) =>
          `[${new Date(s.start_time).toLocaleTimeString('zh-TW')}] ${s.content}`,
      )
      .join('\n');

    const model = this.gemini.getGenerativeModel({
      model: this.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
    });
    const prompt = `你是使用者的個人記憶助理。以下是使用者今天說過的話（摘錄）：

${context || '（今天尚無錄音記錄）'}

根據上述內容，請用繁體中文回答：「${question}」
如果內容中找不到答案，請明確說明找不到相關記錄。`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    return { answer, sources };
  }
}

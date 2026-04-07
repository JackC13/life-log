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
    const vectorSources: SearchResult[] = matches ?? [];
    this.logger.log(
      `Vector search returned ${vectorSources.length} matches for: "${question}"`,
    );

    // 3. 同時撈今天的所有錄音（向量搜尋可能漏掉時間性問題如「今天有沒有錄音」）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayEvents } = await this.supabase.db
      .from('events')
      .select('id, content, start_time, audio_url')
      .eq('track_id', resolvedTrackId)
      .gte('start_time', todayStart.getTime())
      .order('start_time', { ascending: true })
      .limit(30);

    // 合併：向量結果優先，今天的事件補充
    const todaySources = (todayEvents ?? []) as SearchResult[];
    const allIds = new Set(vectorSources.map((s) => s.id));
    const combined = [
      ...vectorSources,
      ...todaySources.filter((s) => !allIds.has(s.id)),
    ];
    const sources = combined;

    // 4. 組成 RAG context，送給 Gemini
    const formatTs = (ms: number) =>
      new Date(ms).toLocaleString('zh-TW', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

    const vectorContext = vectorSources
      .map((s) => `[${formatTs(s.start_time)}] ${s.content}`)
      .join('\n');

    const todayContext = todaySources
      .map((s) => `[${formatTs(s.start_time)}] ${s.content}`)
      .join('\n');

    const model = this.gemini.getGenerativeModel({
      model: this.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
    });
    const prompt = `你是使用者的個人記憶助理。

【今天所有的錄音記錄】（共 ${todaySources.length} 筆）：
${todayContext || '（今天尚無錄音記錄）'}

【與問題最相關的片段】：
${vectorContext || '（無相關片段）'}

根據上述內容，請用繁體中文回答：「${question}」
如果找不到相關記錄，請明確說明。`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    return { answer, sources };
  }
}

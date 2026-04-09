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

    // 3. 依問題內容判斷時間範圍，針對性撈資料（不設筆數上限）
    //    - 有「今天/昨天/前天/這週」等時間詞 → 撈對應天數
    //    - 無時間詞 → 不撈近期流水帳，只靠向量搜尋結果
    const now = new Date();

    // 用 Asia/Taipei 計算今天 0:00（避免 Railway UTC +8 偏差）
    const toTaipeiMidnight = (d: Date, offsetDays = 0): Date => {
      const taipeiMs =
        d.getTime() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000;
      const taipeiDate = new Date(taipeiMs);
      taipeiDate.setUTCHours(0, 0, 0, 0);
      return new Date(taipeiDate.getTime() - 8 * 3600 * 1000); // 轉回 UTC 存 ms
    };

    // 偵測問題裡的時間詞，決定要撈幾天
    const dayRange = (() => {
      if (/今天|今日|今晚|今早|今午|上午|下午|早上|晚上|剛才|剛剛/.test(question))
        return { start: toTaipeiMidnight(now, 0), end: now };
      if (/昨天|昨日|昨晚|昨早/.test(question))
        return { start: toTaipeiMidnight(now, -1), end: toTaipeiMidnight(now, 0) };
      if (/前天/.test(question))
        return { start: toTaipeiMidnight(now, -2), end: toTaipeiMidnight(now, -1) };
      if (/這週|本週|這周|本周/.test(question))
        return { start: toTaipeiMidnight(now, -6), end: now };
      if (/最近|近期/.test(question))
        return { start: toTaipeiMidnight(now, -3), end: now };
      return null; // 無時間詞，不撈流水帳
    })();

    let recentEvents: SearchResult[] = [];
    if (dayRange) {
      const { data } = await this.supabase.db
        .from('events')
        .select('id, content, start_time, audio_url')
        .eq('track_id', resolvedTrackId)
        .gte('start_time', dayRange.start.getTime())
        .lte('start_time', dayRange.end.getTime())
        .order('start_time', { ascending: true }); // 不加 limit，撈完整時段
      recentEvents = (data ?? []) as SearchResult[];
      this.logger.log(
        `Time-range query: ${dayRange.start.toISOString()} ~ ${dayRange.end.toISOString()}, got ${recentEvents.length} events`,
      );
    }

    // 合併：向量結果優先，近期事件補充（去重）
    const recentSources = recentEvents;
    const allIds = new Set(vectorSources.map((s) => s.id));
    const combined = [
      ...vectorSources,
      ...recentSources.filter((s) => !allIds.has(s.id)),
    ];
    const sources = combined;

    // 4. 組成 RAG context，送給 Gemini
    // 明確指定 Asia/Taipei，避免 Railway 伺服器（UTC）造成 +8 小時偏差
    const formatTs = (ms: number) =>
      new Date(ms).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });

    const vectorContext = vectorSources
      .map((s) => `[${formatTs(s.start_time)}] ${s.content}`)
      .join('\n');

    // 近期記錄依日期分組，方便 Gemini 理解時間結構
    const recentContext = recentSources
      .map((s) => `[${formatTs(s.start_time)}] ${s.content}`)
      .join('\n');

    const todayStr = now.toLocaleDateString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
    });

    const model = this.gemini.getGenerativeModel({
      model: this.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
    });
    const timeLabel = dayRange ? '對應時段的錄音記錄' : '（無時間篩選）';
    const prompt = `你是使用者的個人記憶助理。今天日期是 ${todayStr}。

【${timeLabel}】（共 ${recentSources.length} 筆，依時間排序）：
${recentContext || '（該時段無錄音記錄）'}

【語意搜尋最相關的片段】：
${vectorContext || '（無相關片段）'}

根據上述內容，請用繁體中文回答：「${question}」
回答時請注意日期，「今天」是 ${todayStr}，請依此推算昨天、前天等相對日期。
如果找不到相關記錄，請明確說明。`;

    const result = await model.generateContent(prompt);
    const answer = result.response.text();

    return { answer, sources };
  }
}

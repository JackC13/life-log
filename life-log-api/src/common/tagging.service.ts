import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 預定義標籤清單（可依需求擴充）
const TAG_LIST = [
  '靈感', '購物', '工作', '家庭', '健康',
  '財務', '學習', '行程', '提醒', '重要',
];

@Injectable()
export class TaggingService {
  private readonly logger = new Logger(TaggingService.name);
  private gemini: GoogleGenerativeAI;

  constructor(private config: ConfigService) {
    this.gemini = new GoogleGenerativeAI(
      this.config.getOrThrow('GEMINI_API_KEY'),
    );
  }

  /**
   * 批次為多段文字產生標籤
   * 一次 Gemini 呼叫處理所有 segments，節省 API 費用
   * @returns 與 texts 等長的標籤陣列，每個元素是 string[]
   */
  async tagBatch(texts: string[]): Promise<string[][]> {
    if (!texts.length) return [];

    // 若全部內容太短（< 5 字），直接跳過不標籤
    if (texts.every((t) => t.trim().length < 5)) {
      return texts.map(() => []);
    }

    const model = this.gemini.getGenerativeModel({
      model: this.config.get('GEMINI_MODEL', 'gemini-2.5-flash'),
    });

    const numbered = texts
      .map((t, i) => `${i + 1}. ${t}`)
      .join('\n');

    const prompt = `以下是 ${texts.length} 段語音記錄。
請為每段內容從下列標籤中選出最相關的（可複選，無相關則回空）：
可用標籤：${TAG_LIST.join('、')}

${numbered}

請只回傳 JSON 陣列格式，每個元素是該段的標籤陣列。例如：
[["購物","提醒"],["工作"],[]，["靈感","重要"]]
不要有任何其他說明文字。`;

    try {
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();

      // 擷取 JSON 陣列部分（防止 Gemini 多輸出文字）
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return texts.map(() => []);

      const parsed: string[][] = JSON.parse(match[0]);

      // 確保長度一致、每個標籤都在白名單內
      return texts.map((_, i) => {
        const tags = parsed[i] ?? [];
        return tags.filter((t) => TAG_LIST.includes(t));
      });
    } catch (err) {
      this.logger.warn(`Tagging failed, skipping tags: ${err.message}`);
      return texts.map(() => []);
    }
  }
}

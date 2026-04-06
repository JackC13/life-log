import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: OpenAI;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({ apiKey: this.config.getOrThrow('OPENAI_API_KEY') });
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return res.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const res = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return res.data.map((d) => d.embedding);
  }
}

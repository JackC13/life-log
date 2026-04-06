import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { LifeLogEvent } from '../common/types';

type NewEvent = Omit<LifeLogEvent, 'id' | 'created_at'>;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private supabase: SupabaseService) {}

  async insertMany(events: NewEvent[]): Promise<void> {
    if (!events.length) return;

    const { error } = await this.supabase.db.from('events').insert(events);
    if (error) throw new Error(`Insert events failed: ${error.message}`);
    this.logger.log(`Inserted ${events.length} events`);
  }

  /** track 名稱轉 UUID（'personal-life' → actual UUID） */
  async resolveTrackId(trackName: string): Promise<string> {
    // 如果已經是 UUID 格式就直接回傳
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(trackName)) return trackName;

    const { data, error } = await this.supabase.db
      .from('tracks')
      .select('id')
      .eq('name', trackName)
      .single();

    if (error || !data) throw new Error(`Track not found: ${trackName}`);
    return data.id;
  }

  async list(trackId: string, limit = 50, offset = 0): Promise<LifeLogEvent[]> {
    const resolvedId = await this.resolveTrackId(trackId);

    const { data, error } = await this.supabase.db
      .from('events')
      .select('id, track_id, start_time, end_time, content, tags, audio_url, created_at')
      .eq('track_id', resolvedId)
      .order('start_time', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Fetch events failed: ${error.message}`);
    return data ?? [];
  }
}

import { Module } from '@nestjs/common';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { WhisperService } from './whisper.service';
import { SupabaseService } from '../common/supabase.service';
import { EmbeddingService } from '../common/embedding.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [AudioController],
  providers: [AudioService, WhisperService, SupabaseService, EmbeddingService],
})
export class AudioModule {}

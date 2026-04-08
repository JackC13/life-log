import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioController } from './audio.controller';
import { AudioService } from './audio.service';
import { WhisperService } from './whisper.service';
import { SupabaseService } from '../common/supabase.service';
import { EmbeddingService } from '../common/embedding.service';
import { TaggingService } from '../common/tagging.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule, ConfigModule],
  controllers: [AudioController],
  providers: [AudioService, WhisperService, SupabaseService, EmbeddingService, TaggingService],
})
export class AudioModule {}

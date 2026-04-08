import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SupabaseService } from '../common/supabase.service';
import { EmbeddingService } from '../common/embedding.service';
import { TaggingService } from '../common/tagging.service';

@Module({
  imports: [ConfigModule],
  controllers: [EventsController],
  providers: [EventsService, SupabaseService, EmbeddingService, TaggingService],
  exports: [EventsService],
})
export class EventsModule {}

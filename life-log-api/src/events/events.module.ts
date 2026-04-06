import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { SupabaseService } from '../common/supabase.service';

@Module({
  controllers: [EventsController],
  providers: [EventsService, SupabaseService],
  exports: [EventsService],
})
export class EventsModule {}

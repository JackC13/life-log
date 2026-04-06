import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SupabaseService } from '../common/supabase.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  controllers: [SearchController],
  providers: [SearchService, SupabaseService],
})
export class SearchModule {}

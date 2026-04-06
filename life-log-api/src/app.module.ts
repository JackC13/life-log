import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AudioModule } from './audio/audio.module';
import { EventsModule } from './events/events.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AudioModule,
    EventsModule,
    SearchModule,
  ],
})
export class AppModule {}

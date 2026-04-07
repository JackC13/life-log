import {
  Controller,
  Post,
  Get,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AudioService } from './audio.service';

@Controller('audio')
export class AudioController {
  constructor(private readonly audioService: AudioService) {}

  /**
   * GET /audio/signed-url?path=trackId/timestamp.webm
   * 回傳 Supabase Storage 的暫時播放網址（60 分鐘有效）
   */
  @Get('signed-url')
  async getSignedUrl(@Query('path') path: string) {
    return this.audioService.getSignedUrl(path);
  }

  /**
   * POST /audio/chunk
   * 接收前端每 60 秒打包的音訊 Blob，
   * 上傳至 Supabase Storage 後觸發 Whisper 轉譯。
   */
  @Post('chunk')
  @UseInterceptors(FileInterceptor('audio'))
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body('track_id') trackId: string,
    @Body('start_time') startTime: string,
    @Body('language') language?: string,
  ) {
    return this.audioService.processChunk(
      file,
      trackId,
      Number(startTime),
      language,
    );
  }
}

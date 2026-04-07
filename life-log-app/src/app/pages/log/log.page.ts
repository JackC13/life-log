import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AudioCaptureService } from '../../services/audio-capture.service';
import { EventsService, LifeLogEvent } from '../../services/events.service';
import { environment } from '../../../environments/environment';

interface PlayerState {
  event: LifeLogEvent;
  isPlaying: boolean;
}

@Component({
  selector: 'app-log-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="log-page">
      <!-- 頂部狀態列 -->
      <header class="header">
        <h1>🎙️ Life Log</h1>
        <a routerLink="/search" class="search-btn">🔍 問 AI</a>
      </header>

      <!-- 錄音控制 -->
      <div class="recorder">
        <div class="status">{{ audio.statusText() }}</div>
        <button
          class="record-btn"
          [class.recording]="audio.isRecording()"
          [disabled]="audio.isUploading() || audio.isStopping()"
          (click)="toggleRecording()"
        >
          {{ audio.isRecording() ? '■ 停止' : '● 開始錄音' }}
        </button>
        @if (audio.isRecording()) {
          <span class="timer">{{ audio.recordingTime() }}</span>
        }
        <div class="controls-row" [class.disabled]="audio.isRecording() || audio.isUploading()">
          <div class="toggle-group">
            <span class="toggle-label">語言</span>
            <div class="toggle">
              <button [class.active]="audio.language() === 'zh'" (click)="setLanguage('zh')">中文</button>
              <button [class.active]="audio.language() === 'en'" (click)="setLanguage('en')">EN</button>
              <button [class.active]="audio.language() === 'auto'" (click)="setLanguage('auto')">不區分</button>
            </div>
          </div>
          <div class="toggle-group">
            <span class="toggle-label">增益</span>
            <div class="toggle">
              <button [class.active]="audio.gain() === 1" (click)="setGain(1)">1x</button>
              <button [class.active]="audio.gain() === 2" (click)="setGain(2)">2x</button>
              <button [class.active]="audio.gain() === 3" (click)="setGain(3)">3x</button>
              <button [class.active]="audio.gain() === 5" (click)="setGain(5)">5x</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 對話事件列表（RPG Backlog 風格） -->
      <div class="events-list">
        <!-- 翻譯中佔位卡片 -->
        @if (audio.isUploading()) {
          <div class="event-card transcribing">
            <span class="timestamp">{{ formatTime(transcribeStartTime) }}</span>
            <p class="content">
              <span class="dot-animation">語音辨識中</span>
            </p>
          </div>
        }

        @for (event of events(); track event.id) {
          <div
            class="event-card"
            [class.active]="player()?.event?.id === event.id"
            (click)="playEvent(event)"
          >
            <span class="timestamp">
              {{ formatTime(event.start_time) }}
              <span class="play-icon">{{
                player()?.event?.id === event.id && player()?.isPlaying ? '⏸' : '▶'
              }}</span>
            </span>
            <p class="content">{{ event.content }}</p>
            @if (event.tags.length) {
              <div class="tags">
                @for (tag of event.tags; track tag) {
                  <span class="tag">#{{ tag }}</span>
                }
              </div>
            }
          </div>
        } @empty {
          @if (!audio.isUploading()) {
            <div class="empty">開始錄音，對話記錄會自動出現在這裡</div>
          }
        }
      </div>

      <!-- 底部迷你播放器 -->
      @if (player(); as p) {
        <div class="mini-player">
          <div class="mini-player-content">{{ p.event.content }}</div>
          <div class="mini-player-controls">
            <button class="ctrl-btn" (click)="togglePlay()">
              {{ p.isPlaying ? '⏸' : '▶' }}
            </button>
            <button class="ctrl-btn close-btn" (click)="stopPlayer()">✕</button>
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './log.page.scss',
})
export class LogPage implements OnInit, OnDestroy {
  audio = inject(AudioCaptureService);
  private eventsService = inject(EventsService);
  private http = inject(HttpClient);

  events = signal<LifeLogEvent[]>([]);
  player = signal<PlayerState | null>(null);
  transcribeStartTime = 0;
  private pollInterval?: ReturnType<typeof setInterval>;
  private audioEl: HTMLAudioElement | null = null;

  ngOnInit() {
    this.loadEvents();
    // 每 5 秒自動重新載入事件列表
    this.pollInterval = setInterval(() => this.loadEvents(), 5_000);
  }

  ngOnDestroy() {
    clearInterval(this.pollInterval);
    this.audioEl?.pause();
  }

  setLanguage(lang: 'zh' | 'en' | 'auto') {
    if (!this.audio.isRecording() && !this.audio.isUploading()) {
      this.audio.language.set(lang);
    }
  }

  setGain(gain: 1 | 2 | 3 | 5) {
    if (!this.audio.isRecording() && !this.audio.isUploading()) {
      this.audio.gain.set(gain);
    }
  }

  toggleRecording() {
    if (this.audio.isRecording()) {
      this.transcribeStartTime = Date.now();
      this.audio.stop();
    } else {
      this.audio.start().catch(console.error);
    }
  }

  loadEvents() {
    this.eventsService.list().subscribe({
      next: (data) => this.events.set(data),
      error: (err) => console.error('Failed to load events:', err),
    });
  }

  playEvent(event: LifeLogEvent) {
    // 如果點同一張卡片就 toggle 播放/暫停
    if (this.player()?.event.id === event.id) {
      this.togglePlay();
      return;
    }

    // 從 audio_url 解出 chunk 起始時間（格式：{trackId}/{timestamp}.mp4 或 .webm）
    const filename = event.audio_url.split('/').pop() ?? '';
    const chunkStartMs = parseInt(filename.replace(/\.[^.]+$/, ''), 10);
    const seekSec = isNaN(chunkStartMs) ? 0 : Math.max(0, (event.start_time - chunkStartMs) / 1000);

    this.http.get<{ url: string }>(`${environment.apiUrl}/audio/signed-url`, {
      params: { path: event.audio_url },
    }).subscribe({
      next: ({ url }) => {
        this.audioEl?.pause();
        const audio = new Audio(url);

        audio.onerror   = (e) => console.error('Audio load error:', e);
        audio.onended   = () => this.player.update(p => p ? { ...p, isPlaying: false } : null);
        audio.onpause   = () => this.player.update(p => p ? { ...p, isPlaying: false } : null);
        audio.onplay    = () => this.player.update(p => p ? { ...p, isPlaying: true  } : null);

        // iOS 必須等 canplay 後才能 seek，否則會 beep 報錯
        audio.addEventListener('canplay', () => {
          if (seekSec > 0) audio.currentTime = seekSec;
          audio.play().catch((err) => console.error('Audio play failed:', err));
        }, { once: true });

        audio.load();
        this.audioEl = audio;
        this.player.set({ event, isPlaying: false });
      },
      error: (err) => console.error('Failed to get signed URL', err),
    });
  }

  togglePlay() {
    if (!this.audioEl) return;
    if (this.audioEl.paused) {
      this.audioEl.play();
    } else {
      this.audioEl.pause();
    }
  }

  stopPlayer() {
    this.audioEl?.pause();
    this.audioEl = null;
    this.player.set(null);
  }

  formatTime(ms: number): string {
    return new Date(ms).toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}

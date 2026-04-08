import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SearchService, SearchResponse } from '../../services/search.service';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="search-page">
      <header class="header">
        <a routerLink="/log" class="back-btn">← 返回</a>
        <h1>🔍 問 AI</h1>
      </header>

      <!-- 輸入問題 -->
      <div class="input-area">
        <input
          [(ngModel)]="question"
          (keyup.enter)="ask()"
          placeholder="我今天說要買什麼？"
          class="question-input"
        />
        <button
          (click)="toggleVoiceInput()"
          class="mic-btn"
          [class.listening]="listening()"
          title="語音輸入"
        >{{ listening() ? '🔴' : '🎙️' }}</button>
        <button (click)="ask()" [disabled]="loading()" class="ask-btn">
          {{ loading() ? '查詢中...' : '送出' }}
        </button>
      </div>
      @if (listening()) {
        <div class="listening-hint">聆聽中，說完後自動送出...</div>
      }

      <!-- AI 回覆 -->
      @if (result()) {
        <div class="result">
          <div class="answer">{{ result()!.answer }}</div>
          @if (result()!.sources.length) {
            <div class="sources">
              <div class="sources-title">📎 來源片段</div>
              @for (src of result()!.sources; track src.id) {
                <div class="source-card" [class.text-note]="!src.audio_url">
                  <span class="src-time">
                    {{ src.audio_url ? '🎙️' : '✏️' }} {{ formatTime(src.start_time) }}
                  </span>
                  <span class="src-content">{{ src.content }}</span>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styleUrl: './search.page.scss',
})
export class SearchPage {
  private searchService = inject(SearchService);

  question = '';
  loading = signal(false);
  listening = signal(false);
  result = signal<SearchResponse | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;

  toggleVoiceInput() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('您的瀏覽器不支援語音輸入，請使用 Chrome 或 Safari');
      return;
    }

    if (this.listening()) {
      this.recognition?.stop();
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-TW';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => this.listening.set(true);
    this.recognition.onend = () => this.listening.set(false);
    this.recognition.onerror = () => this.listening.set(false);
    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      this.question = transcript;
      this.listening.set(false);
      // 說完後自動送出
      setTimeout(() => this.ask(), 300);
    };

    this.recognition.start();
  }

  ask() {
    if (!this.question.trim() || this.loading()) return;
    this.loading.set(true);
    this.result.set(null);

    this.searchService.ask(this.question).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.loading.set(false);
      },
    });
  }

  formatTime(ms: number): string {
    return new Date(ms).toLocaleString('zh-TW', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }
}

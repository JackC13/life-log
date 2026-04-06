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
        <button (click)="ask()" [disabled]="loading()" class="ask-btn">
          {{ loading() ? '查詢中...' : '送出' }}
        </button>
      </div>

      <!-- AI 回覆 -->
      @if (result()) {
        <div class="result">
          <div class="answer">{{ result()!.answer }}</div>
          @if (result()!.sources.length) {
            <div class="sources">
              <div class="sources-title">📎 來源片段</div>
              @for (src of result()!.sources; track src.id) {
                <div class="source-card">
                  <span class="src-time">{{ formatTime(src.start_time) }}</span>
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
  result = signal<SearchResponse | null>(null);

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
    return new Date(ms).toLocaleTimeString('zh-TW', {
      hour: '2-digit', minute: '2-digit',
    });
  }
}

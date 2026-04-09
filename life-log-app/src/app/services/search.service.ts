import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SearchResponse {
  answer: string;
  sources: { id: string; content: string; start_time: number; audio_url?: string; similarity?: number }[];
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  // 結果存在 Service，跨頁面保留，關 app 才清除
  readonly cachedResult = signal<SearchResponse | null>(null);
  readonly cachedQuestion = signal<string>('');

  constructor(private http: HttpClient) {}

  ask(question: string, trackId = 'personal-life'): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${environment.apiUrl}/search/ask`, {
      question,
      track_id: trackId,
    }).pipe(
      tap(res => {
        this.cachedResult.set(res);
        this.cachedQuestion.set(question);
      })
    );
  }
}

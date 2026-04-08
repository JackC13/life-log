import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SearchResponse {
  answer: string;
  sources: { id: string; content: string; start_time: number; audio_url?: string; similarity?: number }[];
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  constructor(private http: HttpClient) {}

  ask(question: string, trackId = 'personal-life'): Observable<SearchResponse> {
    return this.http.post<SearchResponse>(`${environment.apiUrl}/search/ask`, {
      question,
      track_id: trackId,
    });
  }
}

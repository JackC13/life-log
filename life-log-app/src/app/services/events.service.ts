import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LifeLogEvent {
  id: string;
  track_id: string;
  start_time: number;
  end_time: number;
  content: string;
  tags: string[];
  audio_url: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  constructor(private http: HttpClient) {}

  list(trackId = 'personal-life', limit = 50, offset = 0): Observable<LifeLogEvent[]> {
    return this.http.get<LifeLogEvent[]>(`${environment.apiUrl}/events`, {
      params: { track_id: trackId, limit: String(limit), offset: String(offset) },
    });
  }

  createText(content: string, trackId = 'personal-life'): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/events/text`, {
      content,
      track_id: trackId,
    });
  }
}

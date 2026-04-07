// 核心對話事件模型 (Events Table)
export interface LifeLogEvent {
  id: string;           // UUID
  track_id: string;     // 所屬錄音軌道 (e.g., 'personal-life')
  start_time: number;   // Unix Timestamp ms（全局絕對時間）
  end_time: number;     // 結束時間 ms
  content: string;      // Whisper 轉譯出的文字內容
  embedding?: number[]; // 1536 維度的向量資料
  tags: string[];       // 虛擬標籤 (e.g., ['grocery', 'task'])
  audio_url: string;    // 原始音檔在 Storage 的儲存路徑
  created_at?: string;
}

export interface AudioChunkMeta {
  track_id: string;
  start_time: number; // chunk 起始的 Unix Timestamp ms
}

export interface SearchResult {
  id: string;
  content: string;
  start_time: number;
  audio_url?: string;
  similarity?: number;
}

# Life-Log AI — 開發任務清單

> 最後更新：2026-04-05
> 狀態：⬜ 待辦 / 🔄 進行中 / ✅ 完成

---

## 第一階段：MVP 核心（預計 2 週）

### 🏗️ T1 — 專案初始化與架構建立

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T1-1 初始化 Angular 17+ 專案 | `ng new life-log-app --standalone`，啟用 Signals、routing | ⬜ |
| T1-2 設定 Capacitor | `npm i @capacitor/core @capacitor/cli`，初始化 iOS/Android 平台 | ⬜ |
| T1-3 初始化 NestJS 後端 | `nest new life-log-api`，建立基礎 module 結構（Audio、Events、Search） | ⬜ |
| T1-4 環境變數管理 | 前後端各建 `.env` / `.env.example`，NestJS 使用 `@nestjs/config` | ⬜ |
| T1-5 設定 CORS | NestJS `main.ts` 設定允許 Angular dev server 來源 | ⬜ |

**技術說明：** Angular 與 NestJS 分開兩個資料夾即可，不需要 Nx monorepo（MVP 階段保持簡單）。Capacitor 在這階段只需初始化，不用打包真機。

---

### 🗄️ T2 — Supabase 資料庫設定

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T2-1 建立 Supabase 專案 | 至 supabase.com 建立新專案，取得 `SUPABASE_URL` 與 `ANON_KEY` | ⬜ |
| T2-2 啟用 pgvector 擴充 | 在 SQL Editor 執行 `CREATE EXTENSION IF NOT EXISTS vector;` | ⬜ |
| T2-3 建立 `tracks` 資料表 | 欄位：`id UUID`、`name TEXT`、`created_at TIMESTAMPTZ` | ⬜ |
| T2-4 建立 `events` 資料表 | 依照 `LifeLogEvent` 介面建立，`embedding vector(1536)` | ⬜ |
| T2-5 建立 Storage Bucket | 新增 `audio-chunks` bucket，設定私有存取 | ⬜ |
| T2-6 設定 RLS 政策 | 暫時允許 service role 讀寫（MVP 階段跳過使用者驗證） | ⬜ |
| T2-7 產生 TypeScript 型別 | 執行 `supabase gen types typescript` 產生 `database.types.ts` | ⬜ |

**技術說明：** `events.embedding` 欄位要用 `vector(1536)`（OpenAI embedding 維度），之後若換 Gemini embedding 要確認維度是否一致（Gemini text-embedding-004 也是 768/1536 可選）。

```sql
-- events 資料表建立範例
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID REFERENCES tracks(id),
  start_time BIGINT NOT NULL,
  end_time BIGINT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  tags TEXT[] DEFAULT '{}',
  audio_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

### 🎙️ T3 — AudioCaptureService（前端錄音模組）

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T3-1 麥克風權限申請 | `navigator.mediaDevices.getUserMedia({ audio: true })`，處理拒絕情況 | ⬜ |
| T3-2 MediaRecorder 持續錄音 | 建立 `AudioCaptureService`，包裝 MediaRecorder start/stop | ⬜ |
| T3-3 RxJS bufferTime 切片 | 用 `Subject<Blob>` 搭配 `bufferTime(60000)` 每 60 秒打包上傳 | ⬜ |
| T3-4 切片上傳至後端 | 呼叫 NestJS `POST /audio/chunk`，帶上 `track_id` 與 `start_time` | ⬜ |
| T3-5 VAD 靜音偵測 | 用 `AudioContext` + `AnalyserNode` 計算 RMS 音量，低於閾值時暫停上傳 | ⬜ |
| T3-6 錄音狀態 Signal | 用 Angular Signal 暴露 `isRecording`、`chunkCount` 供 UI 使用 | ⬜ |

**技術說明（VAD 核心邏輯）：**
```typescript
// 簡易 RMS 靜音偵測
const analyser = audioCtx.createAnalyser();
const dataArray = new Float32Array(analyser.fftSize);
analyser.getFloatTimeDomainData(dataArray);
const rms = Math.sqrt(dataArray.reduce((s, v) => s + v * v, 0) / dataArray.length);
const isSilent = rms < 0.01; // 閾值可調整
```

---

### 📡 T4 — NestJS 上傳 API

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T4-1 建立 AudioModule | `nest g module audio`，`nest g controller audio`，`nest g service audio` | ⬜ |
| T4-2 `POST /audio/chunk` 端點 | 接收 multipart audio blob + `track_id` + `start_time` metadata | ⬜ |
| T4-3 上傳至 Supabase Storage | 用 Supabase SDK 的 `storage.from('audio-chunks').upload(...)` | ⬜ |
| T4-4 觸發 Whisper 轉譯 | 上傳完成後，直接呼叫 WhisperService（MVP 同步處理即可） | ⬜ |

---

### 🤖 T5 — Whisper API 轉譯整合

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T5-1 安裝 OpenAI SDK | `npm i openai`，在 NestJS 建立 `WhisperService` | ⬜ |
| T5-2 呼叫 Whisper API | 使用 `whisper-1` 模型，`response_format: 'verbose_json'` 取得時間戳 | ⬜ |
| T5-3 解析 segments | 將 Whisper 回傳的 `segments[]` 轉換為 `LifeLogEvent[]` | ⬜ |
| T5-4 寫入 Supabase | 將 events 批次寫入資料庫（`supabase.from('events').insert(...)`) | ⬜ |

**技術說明：** Whisper `verbose_json` 的 `segments` 陣列每筆包含 `{ start, end, text }`（秒為單位），需乘以 1000 轉為毫秒再加上 chunk 的 `start_time` offset。

---

### 📋 T6 — 前端基本對話列表

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T6-1 EventsService | 從 Supabase 撈取 `events`，按 `start_time` 排序 | ⬜ |
| T6-2 對話列表元件 | 無限滾動列表，每筆顯示時間（HH:mm:ss）+ 逐字稿文字 | ⬜ |
| T6-3 基礎 RPG 樣式 | 用 CSS 模擬遊戲對話框風格（黑底、白字、像素感邊框） | ⬜ |

---

## 第二階段：AI 檢索與回顧體驗（預計 2 週）

### 🧮 T7 — 文字向量化（Embedding Pipeline）

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T7-1 建立 EmbeddingService | 串接 OpenAI `text-embedding-3-small`（1536 維），或 Gemini embedding | ⬜ |
| T7-2 整合至 Whisper 流程 | 轉譯完成後自動產生 embedding 並回寫 `events.embedding` | ⬜ |
| T7-3 建立向量索引 | 在 Supabase 建立 IVFFlat 索引加速相似度搜尋 | ⬜ |

```sql
-- 建立向量索引
CREATE INDEX ON events USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 相似度搜尋 RPC Function
CREATE OR REPLACE FUNCTION match_events(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  filter_track_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, content text, start_time bigint, audio_url text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT id, content, start_time, audio_url,
    1 - (embedding <=> query_embedding) AS similarity
  FROM events
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
    AND (filter_track_id IS NULL OR track_id = filter_track_id)
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

---

### 🔍 T8 — AI 搜尋對話框（RAG）

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T8-1 建立 SearchModule | NestJS `nest g module search`，建立 SearchService | ⬜ |
| T8-2 `POST /search/ask` 端點 | 接收問題文字，回傳 AI 答案 + 來源片段 | ⬜ |
| T8-3 RAG 邏輯實作 | 問題向量化 → 向量搜尋 top-5 → 組成 context prompt → 送 Gemini | ⬜ |
| T8-4 Gemini API 整合 | `@google/generative-ai` SDK，使用 `gemini-1.5-pro`，設定 system prompt | ⬜ |
| T8-5 前端搜尋 UI | 底部搜尋框，送出後顯示 AI 回覆 + 來源時間戳連結 | ⬜ |

**Gemini Prompt 範例：**
```
你是使用者的個人記憶助理。以下是使用者今天說過的話（摘錄）：

[CONTEXT]
{{ top_k_segments }}

根據上述內容，請回答：「{{ user_question }}」
如果內容中找不到答案，請明確說明。
```

---

### 🎵 T9 — 音軌同步播放

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T9-1 AudioPlayerService | 管理 `<audio>` 元素，提供 `seekTo(seconds)` 方法 | ⬜ |
| T9-2 事件 ↔ 音軌對應 | 每個 event 記錄所屬 `audio_url` 與 chunk 內的 `offset_seconds` | ⬜ |
| T9-3 點擊跳轉播放 | 點擊逐字稿文字 → `seekTo(start_time)` → 自動播放 | ⬜ |
| T9-4 播放進度高亮 | 播放時自動 highlight 當前時間對應的 event 段落 | ⬜ |

---

## 第三階段：手機封裝與隱私優化（預計 2 週）

### 📱 T10 — Capacitor 真機封裝

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T10-1 安裝背景錄音插件 | 評估 `@capacitor-community/background-runner` 或 `cordova-plugin-background-mode` | ⬜ |
| T10-2 iOS 背景權限設定 | `Info.plist` 加入 `UIBackgroundModes: audio`，設定 AVAudioSession | ⬜ |
| T10-3 Android 前景服務 | 設定 Foreground Service + 通知列常駐圖示，避免系統殺掉背景 process | ⬜ |
| T10-4 音訊中斷處理 | 接聽電話、其他 App 播音樂時，自動暫停並於結束後恢復錄音 | ⬜ |
| T10-5 真機穩定度測試 | 連續錄音 30 分鐘，確認切片上傳無遺漏、音質正常 | ⬜ |

---

### 👆 T11 — Back Tap 快捷手勢

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T11-1 註冊 URL Scheme | iOS `Info.plist` 設定 `CFBundleURLSchemes: [lifelog]`，Android Intent Filter | ⬜ |
| T11-2 App URL 監聽 | Angular 用 `App.addListener('appUrlOpen', ...)` 解析 `lifelog://toggle-recording` | ⬜ |
| T11-3 iOS 捷徑設定教學 | 在 App 內提供引導：設定 → 輔助使用 → 觸控 → 背面輕點 → 捷徑 → 開關錄音 | ⬜ |

---

### 📳 T12 — 觸覺回饋

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T12-1 安裝 Haptics 插件 | `@capacitor/haptics` | ⬜ |
| T12-2 錄音開始震動 | `Haptics.impact({ style: ImpactStyle.Light })` × 2，間隔 200ms | ⬜ |
| T12-3 錄音結束震動 | `Haptics.vibrate({ duration: 500 })` × 1 長震 | ⬜ |

---

### ⏱️ T13 — 自動停止保護

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T13-1 設定頁面 | 讓使用者選擇自動停止時間：15 分 / 30 分 / 關閉 | ⬜ |
| T13-2 倒數計時器 | 錄音開始後啟動 countdown，剩 2 分鐘時發系統通知提醒 | ⬜ |
| T13-3 自動停止 | 時間到自動呼叫 `AudioCaptureService.stop()`，確保最後一個 chunk 上傳完成 | ⬜ |

---

### 🏷️ T14 — AI 自動標籤（加分功能）

| 子任務 | 說明 | 狀態 |
|--------|------|------|
| T14-1 標籤分類定義 | 定義標籤集：`#靈感 #購物 #小孩 #工作 #健康 #其他` | ⬜ |
| T14-2 批次標籤 Job | 每次上傳後，用 Gemini 對 event content 進行分類，回寫 `tags` 欄位 | ⬜ |
| T14-3 前端標籤篩選 | 在列表頁加入標籤 filter chip，可快速篩選特定類型對話 | ⬜ |

---

## 技術債 / 後續優先處理

| 項目 | 說明 |
|------|------|
| 使用者驗證 | Supabase Auth，目前 MVP 用 service key 跳過 |
| 錄音加密 | 音檔在雲端應加密，或提供本地 only 模式 |
| 費用控制 | Whisper + Gemini API 要設定 budget alert，VAD 可大幅降低成本 |
| 離線支援 | 離線時先存本地 queue，網路恢復後自動上傳 |
| 多軌道管理 | 目前假設單一 `personal-life` 軌道，後續可支援 `work`、`family` 等 |

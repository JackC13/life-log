import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AudioCaptureService {
  readonly isRecording = signal(false);
  readonly isUploading = signal(false);
  readonly isStopping = signal(false);
  readonly recordingSeconds = signal(0);
  readonly gain = signal<1 | 2 | 3 | 5>(3);
  readonly language = signal<'zh' | 'en' | 'auto'>('auto');
  readonly autoStop = signal(true);   // 自動停止（30 分鐘後停止），關閉則持續錄音
  readonly statusText = computed(() => {
    if (this.isUploading()) return '⏳ 辨識中...';
    if (this.isStopping()) return '🔶 收尾中...';
    if (this.isRecording()) return '🔴 錄音中';
    return '⚪ 未錄音';
  });
  readonly recordingTime = computed(() => {
    const s = this.recordingSeconds();
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });

  private mediaRecorder?: MediaRecorder;
  private stream?: MediaStream;
  private boostedStream?: MediaStream;    // GainNode 處理後的串流，保留供輪替用
  private collectedChunks: Blob[] = [];   // 當前 chunk 累積
  private pendingUploads = 0;             // 並發上傳計數，避免 race condition
  private trackId = 'personal-life';
  private sessionStartTime = 0;
  private chunkStartTime = 0;             // 當前 chunk 的起始時間
  private timerInterval?: ReturnType<typeof setInterval>;
  private chunkInterval?: ReturnType<typeof setInterval>;
  private autoStopTimeout?: ReturnType<typeof setTimeout>;
  private autoStopped = false;            // 標記是否由超時自動停止（非手動）
  private isRotating = false;             // 輪替中（非手動停止）
  private mimeType = '';                  // 動態偵測瀏覽器支援的格式

  /** 偵測當前平台支援的錄音格式，mp4 優先確保 iOS/WKWebView 相容 */
  private getSupportedMimeType(): string {
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', ''];
    return types.find((t) => !t || MediaRecorder.isTypeSupported(t)) ?? '';
  }

  private readonly CHUNK_INTERVAL = 30_000; // 每 30 秒自動辨識一次

  constructor(private http: HttpClient) {}

  async start(trackId = 'personal-life'): Promise<void> {
    if (this.isRecording()) return;

    this.trackId = trackId;
    this.sessionStartTime = Date.now();
    this.collectedChunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 取得麥克風後立刻顯示錄音中，不等後續設定
    this.recordingSeconds.set(0);
    this.timerInterval = setInterval(() => {
      this.recordingSeconds.update((s) => s + 1);
    }, 1_000);
    this.isRecording.set(true);

    // 用 GainNode 放大麥克風輸入，改善輕聲細語的辨識率
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(this.stream);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = this.gain();
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(gainNode);
    gainNode.connect(destination);
    const boostedStream = destination.stream;

    this.mimeType = this.getSupportedMimeType();
    this.boostedStream = boostedStream;
    this.chunkStartTime = this.sessionStartTime;
    this.startNewRecorder();

    // 每 30 秒輪替一次 MediaRecorder，確保每段 chunk 都有完整的音訊 header
    this.chunkInterval = setInterval(() => this.rotateRecorder(), this.CHUNK_INTERVAL);

    // 自動停止（30 分鐘）
    this.autoStopped = false;
    if (this.autoStop()) {
      this.autoStopTimeout = setTimeout(() => {
        this.autoStopped = true;
        this.stop();
      }, 30 * 60 * 1000);
    }
  }

  /** 建立新的 MediaRecorder（輪替或初次啟動用） */
  private startNewRecorder(): void {
    this.collectedChunks = [];
    this.chunkStartTime = Date.now();

    this.mediaRecorder = new MediaRecorder(
      this.boostedStream!,
      this.mimeType ? { mimeType: this.mimeType } : {},
    );

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.collectedChunks.push(e.data);
    };

    this.mediaRecorder.onstop = () => {
      this.flushChunks();
      // 輪替模式：flush 後立刻啟動新的 Recorder
      if (this.isRotating && this.isRecording()) {
        this.isRotating = false;
        this.startNewRecorder();
      }
    };

    this.mediaRecorder.start(1_000);
  }

  /** 停止當前 Recorder 並在 onstop 後自動啟動新的（輪替） */
  private rotateRecorder(): void {
    if (!this.mediaRecorder || !this.isRecording()) return;
    this.isRotating = true;
    this.mediaRecorder.stop();
  }

  stop(): void {
    if (!this.isRecording()) return;
    clearInterval(this.timerInterval);
    clearInterval(this.chunkInterval);
    clearTimeout(this.autoStopTimeout);
    this.isRotating = false;  // 確保手動停止不會觸發輪替重啟
    this.isRecording.set(false);
    this.isStopping.set(true);

    const wasAutoStopped = this.autoStopped;
    this.autoStopped = false;

    // 延遲 1.5 秒讓最後的話也被收進來
    setTimeout(() => {
      this.isStopping.set(false);
      this.mediaRecorder?.stop();
      this.stream?.getTracks().forEach((t) => t.stop());

      // autoStop 關閉時（持續錄音模式）：超時後自動重啟
      if (wasAutoStopped && !this.autoStop()) {
        setTimeout(() => this.start(this.trackId), 1000);
      }
    }, 1500);
  }

  /** 打包現有 chunks 上傳 */
  private flushChunks(): void {
    if (this.collectedChunks.length === 0) return;
    const chunks = [...this.collectedChunks];
    const startTime = this.chunkStartTime;

    const durationSec = (Date.now() - startTime) / 1000;
    if (durationSec < 3) return;

    const blob = new Blob(chunks, { type: this.mimeType || 'audio/mp4' });
    this.uploadAndTranscribe(blob, startTime);
  }

  private async uploadAndTranscribe(blob: Blob, startTime: number): Promise<void> {
    this.pendingUploads++;
    this.isUploading.set(true);
    const form = new FormData();
    const ext = this.mimeType.includes('mp4') || this.mimeType.includes('aac') ? 'mp4' : 'webm';
    form.append('audio', blob, `chunk.${ext}`);
    form.append('track_id', this.trackId);
    form.append('start_time', String(startTime));
    if (this.language() !== 'auto') {
      form.append('language', this.language());
    }

    try {
      await firstValueFrom(this.http.post(`${environment.apiUrl}/audio/chunk`, form));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      this.pendingUploads--;
      if (this.pendingUploads === 0) this.isUploading.set(false);
    }
  }
}

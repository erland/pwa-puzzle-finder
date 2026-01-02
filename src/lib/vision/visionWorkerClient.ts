export type VisionPipeline = 'segment' | 'extract' | 'classify';

export type VisionWorkerStatus = 'idle' | 'loading' | 'ready' | 'error';

export type VisionWorkerInitResult =
  | { ok: true }
  | { ok: false; error: string };

export interface VisionWorkerProcessRequest {
  pipeline: VisionPipeline;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scaleToSource: number;
  buffer: ArrayBuffer;
  segOptions?: unknown;
  extractOptions?: unknown;
  classifyOptions?: unknown;
}

export interface VisionWorkerProcessResult {
  segmentation: any;
  extracted?: any;
  classified?: any;
}

type WorkerMsg =
  | { type: 'inited' }
  | { type: 'result'; requestId: string; segmentation: any; extracted?: any; classified?: any }
  | { type: 'error'; requestId?: string; error: string };

export class VisionWorkerClient {
  private worker: Worker | null = null;
  private initPromise: Promise<VisionWorkerInitResult> | null = null;
  private pending = new Map<string, { resolve: (v: VisionWorkerProcessResult) => void; reject: (e: Error) => void }>();

  public status: VisionWorkerStatus = 'idle';
  public lastError: string = '';

  constructor(private baseUrl: string) {}

  public async init(): Promise<VisionWorkerInitResult> {
    if (this.initPromise) return this.initPromise;

    this.status = 'loading';

    this.initPromise = new Promise<VisionWorkerInitResult>((resolve) => {
      try {
        if (typeof Worker === 'undefined') {
          this.status = 'error';
          this.lastError = 'Web Workers are not available in this environment.';
          resolve({ ok: false, error: this.lastError });
          return;
        }

        // Classic worker from /public so we avoid bundling OpenCV into the main JS chunk.
        const url = `${this.baseUrl}workers/vision-worker.js`;
        this.worker = new Worker(url);
        this.worker.onmessage = (ev) => this.onMessage(ev.data as WorkerMsg);
        this.worker.onerror = (ev) => {
          this.status = 'error';
          this.lastError = String((ev as unknown as { message?: string }).message ?? 'Worker error');
          resolve({ ok: false, error: this.lastError });
        };
        this.worker.onmessageerror = () => {
          this.status = 'error';
          this.lastError = 'Worker message error.';
          resolve({ ok: false, error: this.lastError });
        };

        this.worker.postMessage({ type: 'init', requestId: 'init', baseUrl: this.baseUrl });

        // Resolve when we get inited (or timeout)
        const t = window.setTimeout(() => {
          if (this.status !== 'ready') {
            this.status = 'error';
            this.lastError = 'Worker init timeout.';
            resolve({ ok: false, error: this.lastError });
          }
        }, 60000);

        const onInited = () => {
          window.clearTimeout(t);
          this.status = 'ready';
          resolve({ ok: true });
        };

        // temporary hook
        const origOnMessage = this.onMessage.bind(this);
        this.onMessage = (msg: WorkerMsg) => {
          if (msg.type === 'inited') {
            // restore
            this.onMessage = origOnMessage;
            // also pass through
            origOnMessage(msg);
            onInited();
            return;
          }
          if (msg.type === 'error' && msg.requestId === 'init') {
            // Init failed inside the worker (e.g., importScripts/OpenCV load). Resolve init promise immediately.
            this.onMessage = origOnMessage;
            origOnMessage(msg);
            window.clearTimeout(t);
            this.status = 'error';
            this.lastError = msg.error;
            resolve({ ok: false, error: this.lastError });
            return;
          }
          origOnMessage(msg);
        };
      } catch (e) {
        this.status = 'error';
        this.lastError = e instanceof Error ? e.message : String(e);
        resolve({ ok: false, error: this.lastError });
      }
    });

    return this.initPromise;
  }

  public terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.status = 'idle';
    this.lastError = '';
    this.pending.forEach((p) => p.reject(new Error('Worker terminated.')));
    this.pending.clear();
    this.initPromise = null;
  }

  public async process(req: VisionWorkerProcessRequest): Promise<VisionWorkerProcessResult> {
    const init = await this.init();
    if (!init.ok) throw new Error(init.error);
    if (!this.worker) throw new Error('Worker not available.');

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise<VisionWorkerProcessResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        this.worker!.postMessage(
          {
            type: 'process',
            requestId,
            ...req
          },
          // Transfer the underlying buffer to avoid copying.
          [req.buffer]
        );
      } catch (e) {
        this.pending.delete(requestId);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private onMessage(msg: WorkerMsg) {
    if (msg.type === 'error') {
      if (msg.requestId && this.pending.has(msg.requestId)) {
        const p = this.pending.get(msg.requestId)!;
        this.pending.delete(msg.requestId);
        p.reject(new Error(msg.error));
      } else {
        this.status = 'error';
        this.lastError = msg.error;
      }
      return;
    }

    if (msg.type === 'result') {
      const p = this.pending.get(msg.requestId);
      if (!p) return;
      this.pending.delete(msg.requestId);
      p.resolve({ segmentation: msg.segmentation, extracted: msg.extracted, classified: msg.classified });
      return;
    }

    if (msg.type === 'inited') {
      // handled in init()
      return;
    }
  }
}
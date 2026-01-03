import { VisionWorkerClient } from '../visionWorkerClient';

class MockWorker {
  public url: string;
  public onmessage: ((ev: MessageEvent) => void) | null = null;
  public onerror: ((ev: ErrorEvent) => void) | null = null;
  public onmessageerror: ((ev: MessageEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  postMessage(msg: any) {
    // Simulate the worker handshake + a basic process response.
    if (msg?.type === 'init') {
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: 'inited', requestId: msg.requestId } } as any);
      });
      return;
    }

    if (msg?.type === 'process') {
      queueMicrotask(() => {
        this.onmessage?.({
          data: {
            type: 'result',
            requestId: msg.requestId,
            pipeline: msg.pipeline,
            segmentation: { pieces: [] }
          }
        } as any);
      });
      return;
    }
  }

  terminate() {
    // no-op
  }
}

describe('VisionWorkerClient', () => {
  const OriginalWorker = globalThis.Worker;

  beforeEach(() => {
    (globalThis as any).Worker = MockWorker as any;
  });

  afterEach(() => {
    globalThis.Worker = OriginalWorker as any;
  });

  it('initializes and becomes ready', async () => {
    const client = new VisionWorkerClient('/pwa-puzzle-finder/');
    expect(client.status).toBe('idle');

    const res = await client.init();
    expect(res.ok).toBe(true);
    expect(client.status).toBe('ready');
  });

  it('creates worker url relative to baseUrl', async () => {
    const client = new VisionWorkerClient('/pwa-puzzle-finder/');
    await client.init();
    // @ts-expect-error access for test: internal worker instance
    const w: MockWorker | undefined = client.worker;
    expect(w).toBeTruthy();
    expect(w!.url).toContain('/pwa-puzzle-finder/');
    expect(w!.url).toContain('workers/vision-worker.js');
  });

  it('process() resolves with result payload', async () => {
    const client = new VisionWorkerClient('/pwa-puzzle-finder/');
    await client.init();

    const out = await client.process({
      pipeline: 'segment',
      width: 10,
      height: 10,
      sourceWidth: 10,
      sourceHeight: 10,
      scaleToSource: 1,
      buffer: new ArrayBuffer(10 * 10 * 4)
    });

    expect(out.segmentation).toBeTruthy();
    expect(Array.isArray(out.segmentation!.pieces)).toBe(true);
  });
});

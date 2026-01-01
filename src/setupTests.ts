import '@testing-library/jest-dom';


// jsdom does not provide ResizeObserver by default.
// Some components may use it for layout synchronization.
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}


// jsdom does not implement 2D canvas; mock it so components can mount without console noise.
// This is a minimal stub that covers the methods used by our overlay.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value: function getContext(type: string) {
    if (type !== '2d') return null;

    const ctx: Partial<CanvasRenderingContext2D> = {
      // properties (can be set by code)
      globalAlpha: 1,
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      font: '10px sans-serif',

      // methods used by CameraPage overlay
      clearRect: jest.fn(),
      setTransform: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn((text: string) => ({ width: (text?.length ?? 0) * 7 } as TextMetrics)),
      // optional methods that might be used later
      drawImage: jest.fn()
    };

    return ctx as CanvasRenderingContext2D;
  }
});


if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number;
}
if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id as unknown as any);
}

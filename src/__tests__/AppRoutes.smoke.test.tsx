import { render, screen } from '@testing-library/react';
import App from '../App';

// A very small “smoke test” that ensures our main routes render.
// This is intentionally lightweight so it won’t break often when UI text changes.

describe('App routes (smoke)', () => {
  beforeEach(() => {
    // CameraPage includes <video>; jsdom needs play/pause mocked.
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: jest.fn()
    });
    // Allow setting srcObject in jsdom
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      configurable: true,
      get() {
        return (this as any)._srcObject;
      },
      set(v) {
        (this as any)._srcObject = v;
      }
    });
  });

  it('renders Home route', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByText(/mvp scope/i)).toBeInTheDocument();
  });

  it('renders Help route', () => {
    window.location.hash = '#/help';
    render(<App />);
    expect(screen.getByText(/how to use puzzle finder/i)).toBeInTheDocument();
  });

  it('renders Camera route', () => {
    window.location.hash = '#/camera';
    render(<App />);
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
  });
});

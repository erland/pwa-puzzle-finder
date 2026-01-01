import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CameraPage from '../CameraPage';

function makeMockStream() {
  const stop = jest.fn();
  const track: any = { stop, getSettings: () => ({ width: 1280, height: 720 }) };
  const stream: any = {
    getTracks: () => [track],
    getVideoTracks: () => [track]
  };
  return { stream, stop };
}

describe('CameraPage', () => {
  beforeEach(() => {
    // Mock play/pause for jsdom
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
      get() { return (this as any)._srcObject; },
      set(v) { (this as any)._srcObject = v; }
    });
  });

  it('renders controls', () => {
    render(<CameraPage />);
    expect(screen.getByRole('button', { name: /start camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capture frame/i })).toBeInTheDocument();
  });

  it('starts camera via getUserMedia', async () => {
    const { stream } = makeMockStream();
    const getUserMedia = jest.fn().mockResolvedValue(stream);

    (navigator as any).mediaDevices = { getUserMedia };

    render(<CameraPage />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());

    expect(screen.getByText(/status:/i, { selector: 'p' }).textContent).toMatch(/idle|starting|live|captured|error/i);
  });

  it('shows error if getUserMedia fails', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('Denied'));
    (navigator as any).mediaDevices = { getUserMedia };

    render(<CameraPage />);

    fireEvent.click(screen.getByRole('button', { name: /start camera/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert').textContent).toMatch(/denied/i);
  });
});

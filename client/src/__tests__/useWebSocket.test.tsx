import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';

// Minimal WebSocket mock
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send = vi.fn();
  close = vi.fn(() => {
    this.onclose?.();
  });

  constructor() {
    MockWebSocket.instances.push(this);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useWebSocket', () => {
  it('does not attempt to connect when token is null', () => {
    renderHook(() => useWebSocket(null, vi.fn()));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('attempts to connect when a token is provided', () => {
    renderHook(() => useWebSocket('my-token', vi.fn()));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('sends an auth message on open', () => {
    const { result } = renderHook(() => useWebSocket('my-token', vi.fn()));
    const ws = MockWebSocket.instances[0];

    // Simulate the socket opening
    ws.onopen?.();

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth', token: 'my-token' })
    );
  });
});

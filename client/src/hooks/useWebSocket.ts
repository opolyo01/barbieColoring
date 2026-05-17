import { useEffect, useRef, useCallback, useState } from 'react';
import { WsMessage } from '../types';

function deriveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;

  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl) {
    return apiUrl.replace(/^http/i, 'ws').replace(/\/$/, '') + '/ws';
  }

  return 'ws://localhost:4000/ws';
}

const WS_URL = deriveWsUrl();
const PING_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type MessageHandler = (msg: WsMessage) => void;

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebSocket(token: string | null, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const subscriptionsRef = useRef<Set<string>>(new Set());
  const authenticatedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  const [status, setStatus] = useState<WsStatus>('disconnected');

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const subscribe = useCallback((competitionId: string) => {
    subscriptionsRef.current.add(competitionId);
    if (authenticatedRef.current) {
      send({ type: 'subscribe', competitionId });
    }
  }, [send]);

  const unsubscribe = useCallback((competitionId: string) => {
    subscriptionsRef.current.delete(competitionId);
    if (authenticatedRef.current) {
      send({ type: 'unsubscribe', competitionId });
    }
  }, [send]);

  useEffect(() => {
    if (!token) return;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let pingTimer: ReturnType<typeof setInterval>;
    let ws: WebSocket;
    let unmounted = false;

    function connect() {
      setStatus('connecting');
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      authenticatedRef.current = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));

        // Heartbeat — detects stale connections that never fire onclose
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type === 'auth') {
            authenticatedRef.current = msg.ok;
            if (msg.ok) {
              reconnectAttemptRef.current = 0;
              setStatus('connected');
              for (const id of subscriptionsRef.current) {
                ws.send(JSON.stringify({ type: 'subscribe', competitionId: id }));
              }
            } else {
              ws.close();
            }
            return;
          }
          if (msg.type === 'pong') return;
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        clearInterval(pingTimer);
        authenticatedRef.current = false;
        setStatus('disconnected');
        if (!unmounted) {
          const attempt = reconnectAttemptRef.current++;
          const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
          reconnectTimer = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [token]);

  return { subscribe, unsubscribe, send, status };
}

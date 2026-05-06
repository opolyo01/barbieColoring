import { useEffect, useRef, useCallback } from 'react';
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

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket(token: string | null, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const subscriptionsRef = useRef<Set<string>>(new Set());
  const authenticatedRef = useRef(false);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
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
    let ws: WebSocket;
    let unmounted = false;

    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      authenticatedRef.current = false;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          if (msg.type === 'auth') {
            authenticatedRef.current = msg.ok;
            if (msg.ok) {
              for (const id of subscriptionsRef.current) {
                ws.send(JSON.stringify({ type: 'subscribe', competitionId: id }));
              }
            } else {
              ws.close();
            }
            return;
          }
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        authenticatedRef.current = false;
        if (!unmounted) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [token]);

  return { subscribe, unsubscribe, send };
}

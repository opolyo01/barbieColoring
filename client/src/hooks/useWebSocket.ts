import { useEffect, useRef, useCallback } from 'react';
import { WsMessage } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:4001';

type MessageHandler = (msg: WsMessage) => void;

export function useWebSocket(token: string | null, onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const subscriptionsRef = useRef<Set<string>>(new Set());

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((competitionId: string) => {
    subscriptionsRef.current.add(competitionId);
    send({ type: 'subscribe', competitionId });
  }, [send]);

  const unsubscribe = useCallback((competitionId: string) => {
    subscriptionsRef.current.delete(competitionId);
    send({ type: 'unsubscribe', competitionId });
  }, [send]);

  useEffect(() => {
    if (!token) return;

    let reconnectTimer: ReturnType<typeof setTimeout>;
    let ws: WebSocket;
    let unmounted = false;

    function connect() {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
        // Re-subscribe to all active competitions after reconnect
        for (const id of subscriptionsRef.current) {
          ws.send(JSON.stringify({ type: 'subscribe', competitionId: id }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as WsMessage;
          // Ignore empty error acks used for auth confirmation
          if (msg.type === 'error' && msg.message === '') return;
          onMessageRef.current(msg);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
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

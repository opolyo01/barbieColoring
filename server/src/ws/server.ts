import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { WsClientMessage, WsServerMessage, PriceTick } from '../types';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  subscriptions: Set<string>; // competition IDs
  isAlive: boolean;
}

let wss: WebSocketServer | null = null;

const clients = new Set<AuthenticatedSocket>();

export function initWebSocketServer(port: number): void {
  wss = new WebSocketServer({ port });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const socket = ws as AuthenticatedSocket;
    socket.subscriptions = new Set();
    socket.isAlive = true;

    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (data) => {
      try {
        const msg: WsClientMessage = JSON.parse(data.toString());
        handleClientMessage(socket, msg);
      } catch {
        sendToSocket(socket, { type: 'error', message: 'Invalid message format' });
      }
    });

    socket.on('close', () => { clients.delete(socket); });
    socket.on('error', () => { clients.delete(socket); });

    clients.add(socket);
  });

  // Heartbeat — drop dead connections every 30s
  setInterval(() => {
    for (const socket of clients) {
      if (!socket.isAlive) {
        clients.delete(socket);
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);

  console.log(`WebSocket server listening on ws://localhost:${port}`);
}

function handleClientMessage(socket: AuthenticatedSocket, msg: WsClientMessage): void {
  switch (msg.type) {
    case 'auth': {
      try {
        const secret = process.env.JWT_SECRET ?? 'secret';
        const payload = jwt.verify(msg.token, secret) as { userId: string };
        socket.userId = payload.userId;
        sendToSocket(socket, { type: 'error', message: '' }); // ack (reuse error shape, client ignores empty)
      } catch {
        sendToSocket(socket, { type: 'error', message: 'Invalid token' });
      }
      break;
    }
    case 'subscribe': {
      socket.subscriptions.add(msg.competitionId);
      break;
    }
    case 'unsubscribe': {
      socket.subscriptions.delete(msg.competitionId);
      break;
    }
  }
}

export function broadcastTick(tick: PriceTick): void {
  const msg: WsServerMessage = { type: 'tick', data: tick };
  const payload = JSON.stringify(msg);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }
}

export function broadcastLeaderboard(
  competitionId: string,
  rankings: WsServerMessage & { type: 'leaderboard' },
): void {
  const payload = JSON.stringify(rankings);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN && socket.subscriptions.has(competitionId)) {
      socket.send(payload);
    }
  }
}

export function sendToUser(userId: string, msg: WsServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN && socket.userId === userId) {
      socket.send(payload);
    }
  }
}

function sendToSocket(socket: AuthenticatedSocket, msg: WsServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function getActiveCompetitionIds(): string[] {
  const ids = new Set<string>();
  for (const socket of clients) {
    for (const id of socket.subscriptions) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

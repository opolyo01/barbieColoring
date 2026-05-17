import { WebSocket, WebSocketServer } from 'ws';
import { Server as HttpServer, IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { WsClientMessage, WsServerMessage, PriceTick } from '../types';
import { JWT_SECRET } from '../config';
import { getCompetition, getEnrollment } from '../db/queries/competitions';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  subscriptions: Set<string>; // competition IDs
  isAlive: boolean;
}

let wss: WebSocketServer | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

const clients = new Set<AuthenticatedSocket>();

export function initWebSocketServer(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    const socket = ws as AuthenticatedSocket;
    socket.subscriptions = new Set();
    socket.isAlive = true;

    socket.on('pong', () => { socket.isAlive = true; });

    socket.on('message', (data) => {
      try {
        const msg: WsClientMessage = JSON.parse(data.toString());
        void handleClientMessage(socket, msg).catch((err) => {
          console.error('WebSocket message handling error:', err);
          sendToSocket(socket, { type: 'error', message: 'WebSocket request failed' });
        });
      } catch {
        sendToSocket(socket, { type: 'error', message: 'Invalid message format' });
      }
    });

    socket.on('close', () => { clients.delete(socket); });
    socket.on('error', () => { clients.delete(socket); });

    clients.add(socket);
  });

  if (!heartbeatTimer) {
    // Heartbeat — drop dead connections every 30s
    heartbeatTimer = setInterval(() => {
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
  }

  console.log('WebSocket server attached on /ws');
}

export async function closeWebSocketServer(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  const current = wss;
  wss = null;

  for (const socket of clients) {
    try {
      socket.close();
    } catch {
      socket.terminate();
    }
  }
  clients.clear();

  if (!current) return;

  await new Promise<void>((resolve) => {
    current.close(() => resolve());
  });
}

async function canAccessCompetition(userId: string, competitionId: string): Promise<boolean> {
  const [competition, enrollment] = await Promise.all([
    getCompetition(competitionId),
    getEnrollment(userId, competitionId),
  ]);
  return !!competition && (competition.created_by === userId || !!enrollment);
}

async function handleClientMessage(socket: AuthenticatedSocket, msg: WsClientMessage): Promise<void> {
  switch (msg.type) {
    case 'auth': {
      try {
        const payload = jwt.verify(msg.token, JWT_SECRET) as { userId: string };
        socket.userId = payload.userId;
        sendToSocket(socket, { type: 'auth', ok: true });
      } catch {
        sendToSocket(socket, { type: 'auth', ok: false, message: 'Invalid token' });
        socket.close(4001, 'Invalid token');
      }
      break;
    }
    case 'subscribe': {
      if (!socket.userId) {
        sendToSocket(socket, { type: 'error', message: 'Authenticate before subscribing' });
        return;
      }
      if (!(await canAccessCompetition(socket.userId, msg.competitionId))) {
        sendToSocket(socket, { type: 'error', message: 'Not authorized for this competition' });
        return;
      }
      socket.subscriptions.add(msg.competitionId);
      break;
    }
    case 'unsubscribe': {
      socket.subscriptions.delete(msg.competitionId);
      break;
    }
    case 'ping': {
      sendToSocket(socket, { type: 'pong' });
      break;
    }
  }
}

export function broadcastTick(tick: PriceTick): void {
  const msg: WsServerMessage = { type: 'tick', data: tick };
  const payload = JSON.stringify(msg);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN && socket.userId && socket.subscriptions.size > 0) {
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

export function getConnectedClientCount(): number {
  return clients.size;
}

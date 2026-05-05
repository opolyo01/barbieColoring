const BASE = import.meta.env.VITE_API_URL ?? '';

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const data = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  auth: {
    me: (token: string) =>
      request<import('../types').User>('/auth/me', { token }),
  },

  competitions: {
    list: (token: string) =>
      request<import('../types').Competition[]>('/competitions', { token }),
    get: (id: string, token: string) =>
      request<import('../types').Competition>(`/competitions/${id}`, { token }),
    create: (
      token: string,
      body: { name: string; description?: string; startDate: string; endDate: string; startingBalance: number },
    ) =>
      request<import('../types').Competition>('/competitions', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      }),
    join: (id: string, inviteCode: string, token: string) =>
      request<{ ok: boolean }>(`/competitions/${id}/join`, {
        method: 'POST',
        token,
        body: JSON.stringify({ inviteCode }),
      }),
    joinByInvite: (inviteCode: string, token: string) =>
      request<{ ok: boolean; competitionId: string }>('/competitions/join-by-invite', {
        method: 'POST',
        token,
        body: JSON.stringify({ inviteCode }),
      }),
    admin: (id: string, token: string) =>
      request<import('../types').CompetitionAdminSnapshot>(`/competitions/${id}/admin`, { token }),
    unenroll: (competitionId: string, userId: string, token: string) =>
      request<{ ok: boolean }>(`/competitions/${competitionId}/enrollments/${userId}`, { method: 'DELETE', token }),
    delete: (id: string, token: string) =>
      request<{ ok: boolean }>(`/competitions/${id}`, { method: 'DELETE', token }),
    leaderboard: (id: string, token: string) =>
      request<import('../types').LeaderboardEntry[]>(`/competitions/${id}/leaderboard`, { token }),
  },

  orders: {
    place: (
      token: string,
      body: {
        competitionId: string;
        symbol: string;
        side: string;
        qty: number;
        orderType: string;
        limitPrice?: number;
      },
    ) =>
      request<import('../types').Order>('/orders', { method: 'POST', token, body: JSON.stringify(body) }),
    history: (competitionId: string, token: string) =>
      request<import('../types').Order[]>(`/orders/history/${competitionId}`, { token }),
    cancel: (orderId: string, token: string) =>
      request<{ cancelled: boolean }>(`/orders/${orderId}`, { method: 'DELETE', token }),
  },

  portfolio: {
    get: (competitionId: string, token: string) =>
      request<{
        portfolio: import('../types').Portfolio;
        holdings: import('../types').Holding[];
        prices: Record<string, number>;
      }>(`/portfolio/${competitionId}`, { token }),
  },

  symbols: {
    list: (token: string) =>
      request<import('../types').SymbolInfo[]>('/symbols', { token }),
    get: (symbol: string, token: string) =>
      request<import('../types').SymbolInfo>(`/symbols/${encodeURIComponent(symbol)}`, { token }),
  },
};

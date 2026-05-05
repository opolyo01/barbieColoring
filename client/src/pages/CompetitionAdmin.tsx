import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Competition, CompetitionAdminSnapshot } from '../types';

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusBadge(status: Competition['status']) {
  const map = {
    pending: 'bg-yellow-800 text-yellow-300',
    active: 'bg-green-800 text-green-300',
    closed: 'bg-gray-700 text-gray-400',
  };
  return map[status];
}

export default function CompetitionAdmin() {
  const { id: competitionId } = useParams<{ id: string }>();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<CompetitionAdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !competitionId) return;

    setLoading(true);
    setError('');
    api.competitions.admin(competitionId, token)
      .then(setSnapshot)
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load admin page';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [competitionId, token]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  async function handleUnenroll(userId: string, displayName: string) {
    if (!token || !competitionId) return;
    if (!window.confirm(`Unenroll ${displayName}? Pending orders will be cancelled and their portfolio will be removed.`)) return;

    setRemoving(userId);
    try {
      await api.competitions.unenroll(competitionId, userId, token);
      setSnapshot((prev) => prev ? {
        ...prev,
        participants: prev.participants.filter((participant) => participant.user_id !== userId),
      } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to unenroll user');
    } finally {
      setRemoving(null);
    }
  }

  function buildInviteLink(inviteCode: string) {
    return `${window.location.origin}/competitions?invite=${encodeURIComponent(inviteCode)}`;
  }

  async function copyInvite(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt(`Copy ${label}`, text);
    }
  }

  const competition = snapshot?.competition;

  return (
    <div className="min-h-screen bg-surface">
      <div className="border-b border-border bg-panel px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/competitions')}
            className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-border hover:border-gray-500"
          >
            ← Competitions
          </button>
          {competitionId && (
            <button
              onClick={() => navigate(`/competition/${competitionId}`)}
              className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-border hover:border-gray-500"
            >
              Open Room
            </button>
          )}
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Competition Admin</div>
            <div className="text-white font-semibold truncate">{competition?.name ?? 'Loading…'}</div>
          </div>
          {competition && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(competition.status)}`}>
              {competition.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {user && (
            <div className="flex items-center gap-2 border-l border-border pl-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-sm font-bold text-accent">
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-gray-300 text-sm hidden sm:block">{user.display_name}</span>
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded border border-border hover:border-gray-500"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {loading ? (
          <div className="text-sm text-gray-400">Loading admin data...</div>
        ) : error ? (
          <div className="bg-red-900/30 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        ) : snapshot ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Participants" value={String(snapshot.participants.length)} />
              <MetricCard label="Trades" value={String(snapshot.trades.length)} />
              <MetricCard label="Starting Balance" value={fmtMoney(Number(snapshot.competition.starting_balance))} />
            </div>

            <div className="bg-panel border border-border rounded-xl px-5 py-4">
              <div className="text-white font-semibold">Invite Access</div>
              <div className="text-xs text-gray-500 mt-1">This competition is invite-only. Share the code or link below.</div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-mono">
                <span className="px-3 py-2 rounded border border-border text-gray-100">{snapshot.competition.invite_code}</span>
                <button
                  onClick={() => copyInvite(snapshot.competition.invite_code, 'invite code')}
                  className="px-3 py-2 text-xs border border-border text-gray-400 hover:text-white hover:border-gray-500 rounded transition-colors"
                >
                  Copy Code
                </button>
                <button
                  onClick={() => copyInvite(buildInviteLink(snapshot.competition.invite_code), 'invite link')}
                  className="px-3 py-2 text-xs border border-border text-gray-400 hover:text-white hover:border-gray-500 rounded transition-colors"
                >
                  Copy Link
                </button>
              </div>
            </div>

            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-4">
                <div>
                  <div className="text-white font-semibold">Participants</div>
                  <div className="text-xs text-gray-500">Current enrolled users, live balances, and removal controls</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-panel border-b border-border">
                    <tr className="text-gray-500 uppercase tracking-wide">
                      <Th>User</Th>
                      <Th>Joined</Th>
                      <Th right>Cash</Th>
                      <Th right>Gross SEMV</Th>
                      <Th right>Net Liq</Th>
                      <Th right>P&L</Th>
                      <Th right>Pending</Th>
                      <Th right>Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.participants.map((participant) => (
                      <tr key={participant.user_id} className="border-b border-border/60 hover:bg-surface/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{participant.display_name}</span>
                            {participant.is_creator && (
                              <span className="text-[10px] uppercase tracking-wide bg-accent/15 text-accent px-1.5 py-0.5 rounded">
                                Owner
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-gray-500">{participant.email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{fmtDateTime(participant.joined_at)}</td>
                        <td className="px-4 py-3 text-right text-gray-200 font-mono">{fmtMoney(participant.cash_balance)}</td>
                        <td className="px-4 py-3 text-right text-gray-200 font-mono">{fmtMoney(participant.gross_semv)}</td>
                        <td className="px-4 py-3 text-right text-gray-100 font-mono">{fmtMoney(participant.portfolio_value)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${participant.pnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                          {fmtMoney(participant.pnl)} <span className="text-[11px]">({fmtPct(participant.pnl_pct)})</span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 font-mono">
                          {participant.pending_orders}
                          <span className="ml-2 text-[11px] text-gray-600">{participant.open_positions} pos</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {participant.is_creator ? (
                            <span className="text-gray-600 font-medium">Locked</span>
                          ) : (
                            <button
                              onClick={() => handleUnenroll(participant.user_id, participant.display_name)}
                              disabled={removing === participant.user_id}
                              className="px-3 py-1.5 text-xs border border-red-500/30 text-red-400 rounded hover:bg-red-500/10 transition-colors disabled:opacity-50"
                            >
                              {removing === participant.user_id ? 'Removing…' : 'Unenroll'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-panel border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <div className="text-white font-semibold">Trade Audit</div>
                <div className="text-xs text-gray-500">Historical fills are preserved even after a user is unenrolled</div>
              </div>
              <div className="overflow-x-auto max-h-[560px]">
                {snapshot.trades.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-gray-500 text-center">No trades yet</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-panel border-b border-border">
                      <tr className="text-gray-500 uppercase tracking-wide">
                        <Th>Time</Th>
                        <Th>User</Th>
                        <Th>Symbol</Th>
                        <Th>Side</Th>
                        <Th right>Qty</Th>
                        <Th right>Fill</Th>
                        <Th right>Value</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.trades.map((trade) => (
                        <tr key={trade.id} className="border-b border-border/60 hover:bg-surface/40 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono">{fmtDateTime(trade.filled_at)}</td>
                          <td className="px-4 py-3 text-white font-medium">{trade.display_name}</td>
                          <td className="px-4 py-3 text-white font-semibold">{trade.symbol}</td>
                          <td className={`px-4 py-3 font-bold ${trade.side === 'BUY' ? 'text-green-trade' : 'text-red-trade'}`}>
                            {trade.side}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-200 font-mono">
                            {Number(trade.qty).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-200 font-mono">{fmtMoney(trade.fill_price)}</td>
                          <td className="px-4 py-3 text-right text-gray-100 font-mono">{fmtMoney(trade.qty * trade.fill_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-panel border border-border rounded-xl px-5 py-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white font-mono">{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2 text-[10px] font-medium ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

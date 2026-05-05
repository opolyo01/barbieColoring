import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Competition } from '../types';

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function statusBadge(status: Competition['status']) {
  const map = { pending: 'bg-yellow-800 text-yellow-300', active: 'bg-green-800 text-green-300', closed: 'bg-gray-700 text-gray-400' };
  return map[status];
}

export default function Competitions() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joiningInvite, setJoiningInvite] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // Create form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    startingBalance: 1_000_000,
  });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.competitions.list(token).then(setCompetitions).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const invite = searchParams.get('invite')?.trim().toUpperCase();
    if (!invite) return;
    setJoinCode(invite);
    setJoinError('');
    setShowJoin(true);
  }, [searchParams]);

  async function handleDelete(id: string) {
    if (!token || !window.confirm('Delete this competition? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.competitions.delete(id, token);
      setCompetitions((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(null);
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

  async function handleJoinByInvite() {
    if (!token) return;
    const inviteCode = joinCode.trim().toUpperCase();
    if (!inviteCode) {
      setJoinError('Invite code is required');
      return;
    }
    setJoiningInvite(true);
    setJoinError('');
    try {
      const result = await api.competitions.joinByInvite(inviteCode, token);
      setShowJoin(false);
      setJoinCode('');
      setSearchParams({});
      navigate(`/competition/${result.competitionId}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoiningInvite(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreateError('');
    setCreating(true);
    try {
      const comp = await api.competitions.create(token, {
        name: form.name,
        description: form.description || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        startingBalance: form.startingBalance,
      });
      navigate(`/competition/${comp.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="border-b border-border bg-panel px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📈</span>
          <span className="font-bold text-white">TradeBattle</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setJoinError('');
              setShowJoin(true);
            }}
            className="border border-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Join with Invite
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            + New Competition
          </button>
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

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-white mb-6">Competitions</h1>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🏆</p>
            <p>No competitions yet. Create one or join with an invite code.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {competitions.map((c) => (
              <div key={c.id} className="bg-panel border border-border rounded-xl p-5 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{c.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  {c.description && <p className="text-sm text-gray-400 mb-2">{c.description}</p>}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Start: {new Date(c.start_date).toLocaleDateString()}</span>
                    <span>End: {new Date(c.end_date).toLocaleDateString()}</span>
                    <span>Book: {fmt(c.starting_balance)}</span>
                    <span>{c.participant_count ?? 0} players</span>
                  </div>
                  {c.created_by === user?.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-mono text-gray-500">
                      <span className="text-gray-600">Invite</span>
                      <span className="px-2 py-1 rounded border border-border text-gray-300">{c.invite_code}</span>
                      <button
                        onClick={() => copyInvite(c.invite_code, 'invite code')}
                        className="px-2 py-1 rounded border border-border hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
                      >
                        Copy Code
                      </button>
                      <button
                        onClick={() => copyInvite(buildInviteLink(c.invite_code), 'invite link')}
                        className="px-2 py-1 rounded border border-border hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
                      >
                        Copy Link
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  {c.created_by === user?.id && (
                    <button
                      onClick={() => navigate(`/competition/${c.id}/admin`)}
                      className="border border-border hover:border-gray-500 text-gray-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Admin
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/competition/${c.id}`)}
                    className="bg-green-900 hover:bg-green-800 text-green-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    Open
                  </button>
                  {c.created_by === user?.id && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      disabled={deleting === c.id}
                      className="text-gray-500 hover:text-red-400 disabled:opacity-50 text-sm px-2 py-2 rounded-lg border border-transparent hover:border-red-500/30 transition-colors"
                      title="Delete competition"
                    >
                      {deleting === c.id ? '…' : '🗑'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Join Invite Modal */}
      {showJoin && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Join by Invite</h2>

            {joinError && (
              <div className="bg-red-900/30 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2 mb-4">
                {joinError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Invite Code</label>
                <input
                  autoFocus
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm font-mono tracking-wide focus:outline-none focus:border-accent"
                  placeholder="AB12CD34EF56"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoin(false);
                    setJoinError('');
                    setSearchParams({});
                  }}
                  className="flex-1 border border-border text-gray-300 hover:text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleJoinByInvite}
                  disabled={joiningInvite}
                  className="flex-1 bg-accent hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                >
                  {joiningInvite ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Competition Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-panel border border-border rounded-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-white mb-4">Create Competition</h2>

            {createError && (
              <div className="bg-red-900/30 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2 mb-4">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                  placeholder="March Madness 2025"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                  placeholder="Optional"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Start Date *</label>
                  <input
                    required
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">End Date *</label>
                  <input
                    required
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Starting Balance *</label>
                <input
                  required
                  type="number"
                  min={1000}
                  step={1000}
                  value={form.startingBalance}
                  onChange={(e) => setForm((f) => ({ ...f, startingBalance: Number(e.target.value) }))}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 border border-border text-gray-300 hover:text-white text-sm font-medium py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 bg-accent hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

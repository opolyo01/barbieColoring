import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const { token } = useAuth();
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);

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

  async function handleJoin(id: string) {
    if (!token) return;
    setJoining(id);
    try {
      await api.competitions.join(id, token);
      navigate(`/competition/${id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(null);
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
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          + New Competition
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-xl font-bold text-white mb-6">Competitions</h1>

        {loading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : competitions.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-4xl mb-3">🏆</p>
            <p>No competitions yet. Create the first one!</p>
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
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  {c.enrolled ? (
                    <button
                      onClick={() => navigate(`/competition/${c.id}`)}
                      className="bg-green-900 hover:bg-green-800 text-green-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Open
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoin(c.id)}
                      disabled={joining === c.id || c.status === 'closed'}
                      className="bg-accent hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      {joining === c.id ? 'Joining...' : 'Join'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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

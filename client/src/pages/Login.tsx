import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user, token } = await api.auth.login(email, password);
      login(user, token);
      navigate('/competitions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">📈</span>
          <h1 className="text-2xl font-bold text-white mt-2">TradeBattle</h1>
          <p className="text-gray-400 text-sm mt-1">Compete. Trade. Win.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-panel border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Sign In</h2>

          {error && (
            <div className="bg-red-900/30 border border-red-trade/50 text-red-400 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-blue-400 disabled:opacity-50 text-white font-semibold rounded-lg py-2 text-sm transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-gray-400">
            No account?{' '}
            <Link to="/register" className="text-accent hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

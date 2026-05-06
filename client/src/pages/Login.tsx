import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL ?? '';
const POST_LOGIN_REDIRECT_KEY = 'tradebattle_post_login_redirect';

const features = [
  {
    title: 'Private Competitions',
    body: 'Run invite-only leagues with fixed starting capital, shared dates, and a clean leaderboard.',
  },
  {
    title: 'Live Trading Room',
    body: 'PM blotter, order entry, fills, and leaderboard updates stream in one focused screen.',
  },
  {
    title: 'Risk-Limited Gameplay',
    body: 'Gross exposure is capped to the competition book so the game rewards stock picking, not leverage abuse.',
  },
];

const steps = [
  'Sign in with Google and create a private competition or accept an invite link.',
  'Trade a virtual book with long and short positions during the active window.',
  'Finish on top of the leaderboard when the competition closes.',
];

function normalizeReturnTo(value: string | null | undefined): string {
  return value && value.startsWith('/') ? value : '/competitions';
}

function parseInviteFromNext(next: string | null): string {
  if (!next) return '';
  try {
    const [, query = ''] = next.split('?');
    const params = new URLSearchParams(query);
    return params.get('invite')?.trim().toUpperCase() ?? '';
  } catch {
    return '';
  }
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');
  const next = searchParams.get('next');
  const initialInvite = useMemo(() => parseInviteFromNext(next), [next]);
  const [inviteCode, setInviteCode] = useState(initialInvite);

  useEffect(() => {
    setInviteCode(initialInvite);
  }, [initialInvite]);

  function signIn(returnTo?: string) {
    localStorage.setItem(POST_LOGIN_REDIRECT_KEY, normalizeReturnTo(returnTo ?? next));
    window.location.href = `${API}/api/auth/google`;
  }

  function handleInviteSignIn() {
    const normalized = inviteCode.trim().toUpperCase();
    if (!normalized) return;
    signIn(`/competitions?invite=${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="min-h-screen bg-surface text-white overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_28%),radial-gradient(circle_at_80%_20%,_rgba(16,185,129,0.14),_transparent_24%),linear-gradient(180deg,_rgba(15,17,23,0.75),_#0f1117_35%)]" />
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div className="relative max-w-7xl mx-auto px-6 py-8 md:py-12">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl shadow-[0_0_40px_rgba(59,130,246,0.18)]">
              📈
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">TradeBattle</div>
              <div className="text-xs uppercase tracking-[0.32em] text-slate-500">Fantasy Trading Leagues</div>
            </div>
          </div>

          <button
            onClick={() => signIn()}
            className="hidden md:inline-flex items-center gap-2 bg-accent hover:bg-blue-400 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-[0_14px_40px_rgba(59,130,246,0.25)]"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </header>

        <main className="mt-12 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] items-start">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Invite-only leagues
              <span className="text-emerald-500/70">•</span>
              Virtual capital only
            </div>

            <div className="space-y-5 max-w-2xl">
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[0.95]">
                Private stock-picking competitions that feel more like a desk than a spreadsheet.
              </h1>
              <p className="text-lg text-slate-300 leading-8 max-w-xl">
                Build a league, invite your group, trade a shared virtual book, and let the live leaderboard settle who actually has the best ideas.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
              <button
                onClick={() => signIn()}
                className="inline-flex items-center justify-center gap-3 bg-accent hover:bg-blue-400 text-white font-semibold rounded-2xl px-5 py-3.5 transition-colors shadow-[0_18px_50px_rgba(59,130,246,0.25)]"
              >
                <GoogleIcon />
                Continue with Google
              </button>
              <div className="flex-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 flex gap-2">
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Have an invite code?"
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono tracking-[0.18em] text-white placeholder:text-slate-500 focus:outline-none"
                />
                <button
                  onClick={handleInviteSignIn}
                  disabled={!inviteCode.trim()}
                  className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  Join
                </button>
              </div>
            </div>

            {error && (
              <div className="max-w-xl bg-red-900/30 border border-red-500/30 text-red-300 text-sm rounded-2xl px-4 py-3">
                {decodeURIComponent(error)}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              {features.map((feature) => (
                <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
                  <div className="text-sm font-semibold text-white">{feature.title}</div>
                  <div className="mt-2 text-sm leading-6 text-slate-400">{feature.body}</div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 max-w-2xl">
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">How It Works</div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {steps.map((step, index) => (
                  <div key={step} className="rounded-2xl border border-white/8 bg-black/10 p-4">
                    <div className="text-xs font-mono text-accent">{String(index + 1).padStart(2, '0')}</div>
                    <div className="mt-3 text-sm leading-6 text-slate-300">{step}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/10 bg-panel/90 backdrop-blur-xl shadow-[0_24px_80px_rgba(2,6,23,0.45)] overflow-hidden">
            <div className="border-b border-white/10 px-5 py-4 flex items-center justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Sample Competition</div>
                <div className="mt-1 text-lg font-semibold">May Momentum League</div>
              </div>
              <div className="rounded-full bg-emerald-500/15 text-emerald-300 text-xs px-3 py-1 border border-emerald-500/20">
                Invite-only
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <PreviewMetric label="Players" value="12" />
                <PreviewMetric label="Starting Book" value="$1.0M" />
                <PreviewMetric label="Gross Limit" value="$1.0M" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-surface/70 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between text-xs text-slate-400">
                  <span>Leaderboard</span>
                  <span>Live mark-to-market</span>
                </div>
                <div className="divide-y divide-white/5">
                  <PreviewRow rank="#1" name="Alex P." pnl="+4.82%" value="$1,048,200" />
                  <PreviewRow rank="#2" name="Sam J." pnl="+2.14%" value="$1,021,400" />
                  <PreviewRow rank="#3" name="You" pnl="+1.76%" value="$1,017,600" accent />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-surface/70 p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Trading Room</span>
                  <span>PM / Blotter / OE</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm font-mono">
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-slate-300">AAPL LONG</span>
                    <span className="text-emerald-300">+$1,240</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-slate-300">TSLA SHORT</span>
                    <span className="text-red-300">-$410</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
                    <span className="text-slate-300">SEMV Left</span>
                    <span className="text-white">$404,252</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] p-4 text-sm text-slate-400 leading-6">
                No real money. No brokerage connection. Just private leagues, virtual portfolios, and a cleaner way to see who can actually manage risk and ideas.
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface/70 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function PreviewRow({
  rank,
  name,
  pnl,
  value,
  accent = false,
}: {
  rank: string;
  name: string;
  pnl: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[56px_1fr_auto] gap-3 px-4 py-3 text-sm ${accent ? 'bg-accent/8' : ''}`}>
      <span className="text-slate-500 font-mono">{rank}</span>
      <div>
        <div className="font-medium text-white">{name}</div>
        <div className={`text-xs mt-1 font-mono ${pnl.startsWith('+') ? 'text-emerald-300' : 'text-red-300'}`}>{pnl}</div>
      </div>
      <span className="font-mono text-slate-200">{value}</span>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
    </svg>
  );
}

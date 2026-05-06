import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../api';
import { Competition, LeaderboardEntry, PriceTick, Holding, Portfolio, Order } from '../types';
import Leaderboard from '../components/Leaderboard';
import OrderEntry, { type OrderEntryPrefill } from '../components/OrderEntry';
import PortfolioGrid from '../components/PortfolioGrid';
import OrderBlotter from '../components/OrderBlotter';
import { Sparkline } from '../components/Sparkline';

type MainTab = 'pm' | 'blotter' | 'oe';

const SYMBOLS = ['AAPL','TSLA','NVDA','MSFT','AMZN','GOOGL','META','NFLX','AMD','JPM','GS','SPY','QQQ','DIS','UBER','PYPL','BAC','WMT','COST','INTC'];

export default function TradingRoom() {
  const { id: competitionId } = useParams<{ id: string }>();
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [ticks, setTicks] = useState<Map<string, PriceTick[]>>(new Map());
  const [latestTick, setLatestTick] = useState<Map<string, PriceTick>>(new Map());
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [oePrefill, setOePrefill] = useState<OrderEntryPrefill | null>(null);
  const [mainTab, setMainTab] = useState<MainTab>('pm');
  const [leaderboardOpen, setLeaderboardOpen] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();

  function showNotif(msg: string) {
    setNotification(msg);
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  useEffect(() => {
    if (!token || !competitionId) return;
    api.competitions.get(competitionId, token).then((data) => {
      if (data.enrolled === false) {
        navigate('/competitions');
        return;
      }
      setCompetition(data);
    }).catch(() => navigate('/competitions'));
    refreshPortfolio();
    refreshOrders();
  }, [token, competitionId]);

  useEffect(() => {
    if (!token || !competitionId) return;
    api.competitions.leaderboard(competitionId, token)
      .then(setRankings)
      .catch(() => {
        // Live websocket updates will still populate rankings if the initial fetch fails transiently.
      });
  }, [token, competitionId]);

  function refreshPortfolio() {
    if (!token || !competitionId) return;
    api.portfolio.get(competitionId, token).then((data) => {
      setPortfolio(data.portfolio);
      setHoldings(data.holdings);
      setPrices((prev) => {
        const next = new Map(prev);
        for (const [sym, p] of Object.entries(data.prices)) next.set(sym, p as number);
        return next;
      });
    }).catch(() => navigate('/competitions'));
  }

  function refreshOrders() {
    if (!token || !competitionId) return;
    api.orders.history(competitionId, token).then(setOrders);
  }

  const openOrderEntry = useCallback((prefill: Omit<OrderEntryPrefill, 'id'>) => {
    setSelectedSymbol(prefill.symbol);
    setOePrefill({ ...prefill, id: crypto.randomUUID() });
    setMainTab('oe');
  }, []);

  const resolveSymbolPrice = useCallback(async (symbol: string) => {
    if (!token) return;
    const normalized = symbol.toUpperCase().trim();
    if (!normalized || prices.get(normalized) != null) return;

    const info = await api.symbols.get(normalized, token);
    setPrices((prev) => new Map(prev).set(info.symbol, info.price ?? 0));
  }, [prices, token]);

  const handleClosePosition = useCallback(async (holding: { symbol: string; side: 'LONG' | 'SHORT'; qty: number | null }) => {
    if (!token || !competitionId || !holding.qty || holding.qty <= 0) return;

    const closeSide = holding.side === 'LONG' ? 'SELL' : 'BUY';

    try {
      await api.orders.place(token, {
        competitionId,
        symbol: holding.symbol,
        side: closeSide,
        qty: holding.qty,
        orderType: 'MARKET',
      });
      setSelectedSymbol(holding.symbol);
      showNotif(`⏳ CLOSE  ${closeSide} ${holding.qty} ${holding.symbol}`);
      refreshOrders();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to close position';
      showNotif(`❌ CLOSE FAILED  ${message}`);
    }
  }, [competitionId, token]);

  const handleScalePosition = useCallback((holding: { symbol: string; side: 'LONG' | 'SHORT' }) => {
    openOrderEntry({
      symbol: holding.symbol,
      side: holding.side === 'LONG' ? 'BUY' : 'SELL',
      qty: null,
      orderType: 'MARKET',
    });
  }, [openOrderEntry]);

  const handleWsMessage = useCallback(
    (msg: import('../types').WsMessage) => {
      switch (msg.type) {
        case 'tick': {
          const tick = msg.data;
          setPrices((prev) => new Map(prev).set(tick.symbol, tick.price));
          setLatestTick((prev) => new Map(prev).set(tick.symbol, tick));
          setTicks((prev) => {
            const next = new Map(prev);
            const existing = next.get(tick.symbol) ?? [];
            next.set(tick.symbol, [...existing.slice(-299), tick]);
            return next;
          });
          break;
        }
        case 'leaderboard':
          if (msg.competitionId === competitionId) setRankings(msg.rankings);
          break;
        case 'filled': {
          const d = msg.data;
          showNotif(`✅ FILLED  ${d.side} ${Number(d.qty)} ${d.symbol} @ $${Number(d.fill_price).toFixed(2)}`);
          setMainTab('blotter');
          refreshPortfolio();
          refreshOrders();
          break;
        }
        case 'order_rejected':
          showNotif(`❌ REJECTED  ${msg.reason}`);
          refreshOrders();
          break;
      }
    },
    [competitionId],
  );

  const { subscribe } = useWebSocket(token, handleWsMessage);
  useEffect(() => { if (competitionId) subscribe(competitionId); }, [competitionId, subscribe]);

  const myRank = rankings.find((r) => r.user_id === user?.id);
  const currentPrice = prices.get(selectedSymbol) ?? 0;
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const posCount = holdings.length;
  const grossSemv = holdings.reduce((sum, holding) => {
    const markedPrice = prices.get(holding.symbol) ?? Number(holding.current_price ?? 0);
    return sum + Math.abs(Number(holding.qty)) * markedPrice;
  }, 0);
  const semvLeft = competition ? Number(competition.starting_balance) - grossSemv : null;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="flex flex-col bg-surface" style={{ height: '100vh', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div className="bg-panel border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0 gap-4">
        {/* Left: nav + competition */}
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/competitions')} className="text-gray-400 hover:text-white text-xs shrink-0">
            ← Back
          </button>
          <span className="text-white font-semibold text-sm truncate">{competition?.name ?? '…'}</span>
          {competition && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
              competition.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
            }`}>
              {competition.status}
            </span>
          )}
          {competition?.created_by === user?.id && (
            <button
              onClick={() => competitionId && navigate(`/competition/${competitionId}/admin`)}
              className="text-[11px] text-gray-400 hover:text-white px-2 py-0.5 rounded border border-border hover:border-gray-500 transition-colors"
            >
              Admin
            </button>
          )}
        </div>

        {/* Center: symbol ticker */}
        <div className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0 px-2">
          {SYMBOLS.slice(0, 12).map((sym) => {
            const p = prices.get(sym) ?? 0;
            const symTicks = ticks.get(sym) ?? [];
            const sparkPrices = symTicks.map((t) => t.price);
            const prev = symTicks.length > 1 ? symTicks[symTicks.length - 2].price : p;
            const up = p >= prev;
            return (
              <button
                key={sym}
                onClick={() => { setSelectedSymbol(sym); setMainTab('oe'); }}
                className={`shrink-0 px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors flex items-center gap-1.5 ${
                  selectedSymbol === sym && mainTab === 'oe'
                    ? 'bg-accent/20 border border-accent text-accent'
                    : 'border border-border text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                <Sparkline prices={sparkPrices} width={36} height={14} />
                <span>{sym}</span>
                <span className={up ? 'text-green-trade' : 'text-red-trade'}>{p > 0 ? `$${p.toFixed(2)}` : '—'}</span>
              </button>
            );
          })}
        </div>

        {/* Right: rank + user */}
        <div className="flex items-center gap-3 text-xs shrink-0">
          {myRank && (
            <>
              <span className="text-gray-400">
                Rank <span className="text-white font-bold">#{myRank.rank}</span>
              </span>
              <span className={`font-semibold font-mono ${myRank.pnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                {myRank.pnl >= 0 ? '+' : ''}{myRank.pnl_pct.toFixed(2)}%
              </span>
              <span className="text-gray-200 font-mono font-semibold">{fmtMoney(myRank.portfolio_value)}</span>
            </>
          )}
          {user && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-[11px] font-bold text-accent">
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-gray-400 hidden xl:block">{user.display_name}</span>
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="text-gray-500 hover:text-white px-1.5 py-0.5 rounded border border-border hover:border-gray-500 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Toast ── */}
      {notification && (
        <div className="fixed top-12 right-4 bg-panel border border-border rounded-lg px-4 py-2 text-xs text-white shadow-xl z-50 font-mono">
          {notification}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Leaderboard sidebar — always present, collapsible */}
        <div className={`border-r border-border bg-panel flex flex-col shrink-0 hidden lg:flex transition-all duration-200 ${leaderboardOpen ? 'w-44' : 'w-6'}`}>
          {leaderboardOpen ? (
            <>
              <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
                <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Leaderboard</span>
                <button onClick={() => setLeaderboardOpen(false)} className="text-gray-600 hover:text-gray-400 text-xs leading-none" title="Collapse">‹</button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <Leaderboard rankings={rankings} currentUserId={user?.id} />
              </div>
            </>
          ) : (
            <button
              onClick={() => setLeaderboardOpen(true)}
              className="flex-1 flex items-center justify-center text-gray-600 hover:text-gray-400 hover:bg-white/5 transition-colors"
              title="Expand leaderboard"
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>LB</span>
            </button>
          )}
        </div>

        {/* Main: tab bar + full-screen content */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Tab bar */}
          <div className="flex items-center border-b border-border bg-panel shrink-0 px-2 gap-1">
            <TabBtn label={`PM${posCount > 0 ? ` (${posCount})` : ''}`} active={mainTab === 'pm'} onClick={() => setMainTab('pm')} />
            <TabBtn
              label={`Blotter${pendingCount > 0 ? ` ●${pendingCount}` : orders.length > 0 ? ` (${orders.length})` : ''}`}
              active={mainTab === 'blotter'}
              onClick={() => setMainTab('blotter')}
              highlight={pendingCount > 0}
            />
            <TabBtn label="OE" active={mainTab === 'oe'} onClick={() => setMainTab('oe')} />
            <div className="w-px h-4 bg-border mx-1" />
            {/* Live price for selected symbol */}
            {currentPrice > 0 && (() => {
              const prev = (ticks.get(selectedSymbol) ?? []).slice(-2)[0];
              const chg = prev ? currentPrice - prev.price : 0;
              return (
                <span className="text-[11px] font-mono text-gray-400">
                  <span className="text-gray-200 font-semibold">{selectedSymbol}</span>
                  {' '}
                  <span className="text-white">${currentPrice.toFixed(2)}</span>
                  {chg !== 0 && (
                    <span className={`ml-1 ${chg >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                      {chg >= 0 ? '+' : ''}{chg.toFixed(2)}
                    </span>
                  )}
                </span>
              );
            })()}
            <div className="flex-1" />
          </div>

          {/* Full-screen content per tab */}
          <div className="flex-1 overflow-hidden min-h-0 min-w-0">
            {mainTab === 'pm' && (
              <PortfolioGrid
                portfolio={portfolio}
                holdings={holdings}
                prices={prices}
                ticks={ticks}
                latestTick={latestTick}
                startingBalance={competition ? Number(competition.starting_balance) : null}
                onClosePosition={handleClosePosition}
                onScalePosition={handleScalePosition}
              />
            )}
            {mainTab === 'blotter' && (
              <OrderBlotter
                orders={orders}
                prices={prices}
                token={token ?? ''}
                onCancelled={refreshOrders}
              />
            )}
            {mainTab === 'oe' && (
              <OrderEntry
                prices={prices}
                cash={portfolio ? Number(portfolio.cash_balance) : 0}
                semvLeft={semvLeft}
                competitionId={competitionId ?? ''}
                token={token ?? ''}
                onResolveSymbolPrice={resolveSymbolPrice}
                prefill={oePrefill}
                onPrefillApplied={() => setOePrefill(null)}
                onOrdersPlaced={() => {
                  showNotif('⏳ Orders submitted');
                  setMainTab('blotter');
                  refreshOrders();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick, highlight }: { label: string; active: boolean; onClick: () => void; highlight?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-accent text-accent'
          : highlight
          ? 'border-transparent text-yellow-400 hover:text-yellow-300'
          : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

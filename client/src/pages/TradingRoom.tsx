import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import { api } from '../api';
import { Competition, LeaderboardEntry, PriceTick, Holding, Portfolio, Order } from '../types';
import Leaderboard from '../components/Leaderboard';
import PriceChart from '../components/PriceChart';
import OrderPanel from '../components/OrderPanel';
import PortfolioPanel from '../components/Portfolio';
import TradeHistory from '../components/TradeHistory';

type Tab = 'chart' | 'portfolio' | 'trades';

export default function TradingRoom() {
  const { id: competitionId } = useParams<{ id: string }>();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [prices, setPrices] = useState<Map<string, number>>(new Map());
  const [ticks, setTicks] = useState<Map<string, PriceTick[]>>(new Map());
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<Tab>('chart');
  const [notification, setNotification] = useState<string | null>(null);
  const notifTimer = useRef<ReturnType<typeof setTimeout>>();

  function showNotification(msg: string) {
    setNotification(msg);
    clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setNotification(null), 4000);
  }

  // Load static data
  useEffect(() => {
    if (!token || !competitionId) return;
    api.competitions.get(competitionId, token).then(setCompetition).catch(() => navigate('/competitions'));
    refreshPortfolio();
    refreshOrders();
  }, [token, competitionId]);

  function refreshPortfolio() {
    if (!token || !competitionId) return;
    api.portfolio.get(competitionId, token).then((data) => {
      setPortfolio(data.portfolio);
      setHoldings(data.holdings);
      // Seed prices from REST response
      setPrices((prev) => {
        const next = new Map(prev);
        for (const [sym, p] of Object.entries(data.prices)) next.set(sym, p as number);
        return next;
      });
    });
  }

  function refreshOrders() {
    if (!token || !competitionId) return;
    api.orders.history(competitionId, token).then(setOrders);
  }

  const handleWsMessage = useCallback(
    (msg: import('../types').WsMessage) => {
      switch (msg.type) {
        case 'tick': {
          const tick = msg.data;
          setPrices((prev) => new Map(prev).set(tick.symbol, tick.price));
          setTicks((prev) => {
            const next = new Map(prev);
            const existing = next.get(tick.symbol) ?? [];
            // Keep last 300 ticks per symbol
            next.set(tick.symbol, [...existing.slice(-299), tick]);
            return next;
          });
          break;
        }
        case 'leaderboard': {
          if (msg.competitionId === competitionId) {
            setRankings(msg.rankings);
          }
          break;
        }
        case 'filled': {
          showNotification(`✅ Order filled: ${msg.data.side} ${msg.data.qty} ${msg.data.symbol} @ $${Number(msg.data.fill_price).toFixed(2)}`);
          refreshPortfolio();
          refreshOrders();
          break;
        }
        case 'order_rejected': {
          showNotification(`❌ Order rejected: ${msg.reason}`);
          refreshOrders();
          break;
        }
      }
    },
    [competitionId],
  );

  const { subscribe } = useWebSocket(token, handleWsMessage);

  useEffect(() => {
    if (!competitionId) return;
    subscribe(competitionId);
  }, [competitionId, subscribe]);

  const myRank = rankings.find((r) => r.user_id === user?.id);
  const currentPrice = prices.get(selectedSymbol) ?? 0;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Top bar */}
      <div className="bg-panel border-b border-border px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/competitions')} className="text-gray-400 hover:text-white text-sm">
            ← Back
          </button>
          <span className="text-white font-semibold">{competition?.name ?? '...'}</span>
          {competition && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${competition.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
              {competition.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm">
          {myRank && (
            <>
              <span className="text-gray-400">Rank <span className="text-white font-bold">#{myRank.rank}</span></span>
              <span className={myRank.pnl >= 0 ? 'text-green-trade font-semibold' : 'text-red-trade font-semibold'}>
                {myRank.pnl >= 0 ? '+' : ''}{myRank.pnl_pct.toFixed(2)}%
              </span>
              <span className="text-gray-300 font-semibold">
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(myRank.portfolio_value)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-16 right-4 bg-panel border border-border rounded-lg px-4 py-2 text-sm text-white shadow-xl z-50 max-w-sm">
          {notification}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Leaderboard */}
        <div className="w-56 border-r border-border bg-panel overflow-y-auto shrink-0 hidden lg:block">
          <div className="p-3 border-b border-border">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Leaderboard</span>
          </div>
          <Leaderboard rankings={rankings} currentUserId={user?.id} />
        </div>

        {/* Center: Chart + tabs */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Symbol selector */}
          <div className="bg-panel border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
            {['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'GOOGL', 'META', 'NFLX', 'AMD', 'JPM', 'GS', 'SPY', 'QQQ'].map((sym) => {
              const p = prices.get(sym) ?? 0;
              const prevTicks = ticks.get(sym) ?? [];
              const prev = prevTicks.length > 1 ? prevTicks[prevTicks.length - 2].price : p;
              const up = p >= prev;
              return (
                <button
                  key={sym}
                  onClick={() => setSelectedSymbol(sym)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedSymbol === sym
                      ? 'bg-accent/20 border border-accent text-accent'
                      : 'bg-surface border border-border text-gray-300 hover:border-gray-500'
                  }`}
                >
                  <span>{sym}</span>
                  <span className={`ml-1 ${up ? 'text-green-trade' : 'text-red-trade'}`}>
                    ${p > 0 ? p.toFixed(2) : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab buttons */}
          <div className="flex border-b border-border bg-panel px-4 gap-4">
            {(['chart', 'portfolio', 'trades'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t ? 'border-accent text-accent' : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === 'chart' && (
              <PriceChart symbol={selectedSymbol} ticks={ticks.get(selectedSymbol) ?? []} />
            )}
            {tab === 'portfolio' && (
              <PortfolioPanel portfolio={portfolio} holdings={holdings} prices={prices} />
            )}
            {tab === 'trades' && (
              <TradeHistory orders={orders} />
            )}
          </div>
        </div>

        {/* Right: Order panel */}
        <div className="w-64 border-l border-border bg-panel overflow-y-auto shrink-0">
          <OrderPanel
            symbol={selectedSymbol}
            currentPrice={currentPrice}
            cash={portfolio ? Number(portfolio.cash_balance) : 0}
            competitionId={competitionId ?? ''}
            token={token ?? ''}
            onOrderPlaced={() => {
              showNotification(`⏳ Order submitted — ${selectedSymbol}`);
              refreshOrders();
            }}
          />
        </div>
      </div>
    </div>
  );
}

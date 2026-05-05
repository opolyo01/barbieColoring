import { useState, FormEvent } from 'react';
import { api } from '../api';

interface Props {
  symbol: string;
  currentPrice: number;
  cash: number;
  competitionId: string;
  token: string;
  onOrderPlaced: () => void;
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const SPREAD = 0.0002;

export default function OrderPanel({ symbol, currentPrice, cash, competitionId, token, onOrderPlaced }: Props) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const bid = currentPrice > 0 ? currentPrice * (1 - SPREAD) : 0;
  const ask = currentPrice > 0 ? currentPrice * (1 + SPREAD) : 0;
  const maxShares = currentPrice > 0 ? Math.floor(cash / currentPrice) : 0;
  const estValue = currentPrice * (Number(qty) || 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const q = parseFloat(qty);
    if (!q || q <= 0) { setError('Enter a valid quantity'); return; }
    if (orderType === 'LIMIT' && (!parseFloat(limitPrice) || parseFloat(limitPrice) <= 0)) {
      setError('Enter a valid limit price'); return;
    }
    setLoading(true);
    try {
      await api.orders.place(token, {
        competitionId, symbol, side, qty: q, orderType,
        ...(orderType === 'LIMIT' ? { limitPrice: parseFloat(limitPrice) } : {}),
      });
      setQty('');
      setLimitPrice('');
      onOrderPlaced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest mb-1">Order Entry</div>
        <div className="flex items-baseline gap-2">
          <span className="text-white font-bold text-base tracking-wide">{symbol}</span>
          <span className="text-white font-mono text-lg">
            {currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : '—'}
          </span>
        </div>

        {/* Bid / Ask — compact inline */}
        {currentPrice > 0 && (
          <div className="flex gap-3 mt-2 text-xs font-mono">
            <div>
              <span className="text-gray-600">BID </span>
              <span className="text-red-400">${bid.toFixed(2)}</span>
            </div>
            <div className="text-gray-700">|</div>
            <div>
              <span className="text-gray-600">ASK </span>
              <span className="text-green-400">${ask.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 py-3 flex flex-col gap-3 overflow-y-auto">
        {/* Cash */}
        <div className="text-xs font-mono text-gray-500">
          Cash <span className="text-gray-300 ml-1">{fmtUsd(cash)}</span>
        </div>

        {/* Side toggle */}
        <div className="flex rounded border border-border overflow-hidden text-sm font-semibold">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`flex-1 py-2 transition-colors ${side === 'BUY' ? 'bg-emerald-700 text-white' : 'bg-transparent text-gray-500 hover:text-gray-300'}`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`flex-1 py-2 transition-colors ${side === 'SELL' ? 'bg-red-700 text-white' : 'bg-transparent text-gray-500 hover:text-gray-300'}`}
          >
            SELL
          </button>
        </div>

        {/* Order type */}
        <div className="flex gap-1.5">
          {(['MARKET', 'LIMIT'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1 text-xs rounded border transition-colors ${
                orderType === t ? 'border-slate-400 text-slate-200 bg-slate-700/40' : 'border-border text-gray-600 hover:text-gray-400'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* Limit price */}
          {orderType === 'LIMIT' && (
            <div>
              <label className="block text-[10px] text-gray-600 uppercase tracking-wide mb-1">Limit Price</label>
              <input
                type="number" min="0.01" step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface border border-border rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-slate-500"
              />
            </div>
          )}

          {/* Quantity */}
          <div>
            <label className="block text-[10px] text-gray-600 uppercase tracking-wide mb-1">Quantity</label>
            <input
              type="number" min="1" step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-full bg-surface border border-border rounded px-3 py-1.5 text-white text-sm font-mono focus:outline-none focus:border-slate-500"
            />
            {/* Quick-fill buttons */}
            <div className="flex gap-1 mt-1.5">
              {[100, 500, 1000].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQty(String(n))}
                  className="flex-1 text-[10px] py-0.5 rounded border border-border text-gray-600 hover:text-gray-300 hover:border-gray-500 transition-colors"
                >
                  {n}
                </button>
              ))}
              {maxShares > 0 && (
                <button
                  type="button"
                  onClick={() => setQty(String(maxShares))}
                  className="flex-1 text-[10px] py-0.5 rounded border border-border text-blue-500 hover:text-blue-400 hover:border-blue-600 transition-colors"
                >
                  MAX
                </button>
              )}
            </div>
          </div>

          {/* Est value */}
          {estValue > 0 && (
            <div className="text-xs font-mono text-gray-500">
              Est. <span className="text-gray-300">{fmtUsd(estValue)}</span>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-950/40 border border-red-900/40 rounded px-2 py-1">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            className={`w-full py-2.5 rounded text-sm font-bold tracking-wide transition-colors disabled:opacity-40 ${
              side === 'BUY' ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-red-700 hover:bg-red-600 text-white'
            }`}
          >
            {loading ? '…' : `${side} ${symbol}`}
          </button>
        </form>

        <div className="text-[10px] text-gray-700 leading-relaxed mt-1">
          Market orders fill at current price. Sell/Short requires 150% margin.
        </div>
      </div>
    </div>
  );
}

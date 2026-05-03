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

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function OrderPanel({ symbol, currentPrice, cash, competitionId, token, onOrderPlaced }: Props) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const estimatedValue = currentPrice * (Number(qty) || 0);
  const maxShares = currentPrice > 0 ? Math.floor(cash / currentPrice) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const parsedQty = parseFloat(qty);
    if (!parsedQty || parsedQty <= 0) { setError('Enter a valid quantity'); return; }
    if (orderType === 'LIMIT' && (!limitPrice || parseFloat(limitPrice) <= 0)) {
      setError('Enter a valid limit price');
      return;
    }

    setLoading(true);
    try {
      await api.orders.place(token, {
        competitionId,
        symbol,
        side,
        qty: parsedQty,
        orderType,
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
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Place Order</div>
        <div className="text-lg font-bold text-white">{symbol}</div>
        <div className="text-sm text-gray-400">
          {currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : 'Loading...'}
        </div>
      </div>

      <div className="text-xs text-gray-400">
        Cash: <span className="text-white font-medium">{fmt(cash)}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Side */}
        <div className="flex rounded-lg overflow-hidden border border-border">
          <button
            type="button"
            onClick={() => setSide('BUY')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              side === 'BUY' ? 'bg-green-trade text-white' : 'bg-surface text-gray-400 hover:text-white'
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setSide('SELL')}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              side === 'SELL' ? 'bg-red-trade text-white' : 'bg-surface text-gray-400 hover:text-white'
            }`}
          >
            SELL / SHORT
          </button>
        </div>

        {/* Order type */}
        <div className="flex gap-2">
          {(['MARKET', 'LIMIT'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setOrderType(t)}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                orderType === t
                  ? 'border-accent text-accent bg-accent/10'
                  : 'border-border text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Quantity</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Shares"
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
          />
          {side === 'BUY' && maxShares > 0 && (
            <button
              type="button"
              onClick={() => setQty(String(maxShares))}
              className="text-xs text-accent mt-1 hover:underline"
            >
              Max: {maxShares} shares
            </button>
          )}
        </div>

        {/* Limit price */}
        {orderType === 'LIMIT' && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Limit Price</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder={currentPrice > 0 ? currentPrice.toFixed(2) : '0.00'}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-accent"
            />
          </div>
        )}

        {/* Estimated value */}
        {estimatedValue > 0 && (
          <div className="text-xs text-gray-400">
            Est. value: <span className="text-white">{fmt(estimatedValue)}</span>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-500/20 rounded px-2 py-1">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !token}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
            side === 'BUY'
              ? 'bg-green-trade hover:bg-green-600 text-white'
              : 'bg-red-trade hover:bg-red-600 text-white'
          }`}
        >
          {loading ? 'Submitting...' : `${side} ${symbol}`}
        </button>
      </form>

      <div className="border-t border-border pt-3 text-xs text-gray-500 space-y-1">
        <p>Market orders fill instantly at current price.</p>
        <p>Sell/Short: selling shares you don't own creates a short position. 150% margin required.</p>
      </div>
    </div>
  );
}

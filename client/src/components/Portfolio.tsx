import { Holding, Portfolio } from '../types';

interface Props {
  portfolio: Portfolio | null;
  holdings: Holding[];
  prices: Map<string, number>;
}

const fmt = (n: number, decimals = 2) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

export default function PortfolioPanel({ portfolio, holdings, prices }: Props) {
  if (!portfolio) {
    return <div className="p-4 text-gray-400 text-sm">Loading portfolio...</div>;
  }

  const cash = Number(portfolio.cash_balance);
  const holdingsValue = holdings.reduce((sum, h) => {
    const price = prices.get(h.symbol) ?? Number(h.current_price);
    return sum + Number(h.qty) * price;
  }, 0);
  const totalValue = cash + holdingsValue;
  const totalPnl = holdings.reduce((sum, h) => sum + h.unrealized_pnl, 0);

  return (
    <div className="p-4 overflow-y-auto h-full">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-surface rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Total Value</div>
          <div className="font-bold text-white">{fmt(totalValue, 0)}</div>
        </div>
        <div className="bg-surface rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Cash</div>
          <div className="font-bold text-white">{fmt(cash, 0)}</div>
        </div>
        <div className="bg-surface rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">Unrealized P&L</div>
          <div className={`font-bold ${totalPnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
            {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl, 0)}
          </div>
        </div>
      </div>

      {/* Holdings table */}
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Positions</div>

      {holdings.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No open positions</div>
      ) : (
        <div className="space-y-2">
          {holdings.map((h) => {
            const isShort = Number(h.qty) < 0;
            const pnl = h.unrealized_pnl;
            const currentPrice = prices.get(h.symbol) ?? Number(h.current_price);
            return (
              <div key={h.id} className="bg-surface border border-border rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm">{h.symbol}</span>
                    {isShort && (
                      <span className="text-xs bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded">SHORT</span>
                    )}
                  </div>
                  <span className={`text-sm font-semibold ${pnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                    {pnl >= 0 ? '+' : ''}{fmt(pnl)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{Math.abs(Number(h.qty)).toFixed(2)} shares @ {fmt(Number(h.avg_cost))}</span>
                  <span>Now: {fmt(currentPrice)}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Market value: <span className="text-gray-300">{fmt(Number(h.qty) * currentPrice)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

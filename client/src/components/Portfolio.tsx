import { Holding, Portfolio } from '../types';

interface Props {
  portfolio: Portfolio | null;
  holdings: Holding[];
  prices: Map<string, number>;
}

const fmtUsd = (n: number, decimals = 2) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export default function PortfolioPanel({ portfolio, holdings, prices }: Props) {
  if (!portfolio) {
    return <div className="p-4 text-gray-400 text-sm">Loading portfolio...</div>;
  }

  const cash = Number(portfolio.cash_balance);

  // Compute all P&L live from current prices
  const liveHoldings = holdings.map((h) => {
    const qty = Number(h.qty);
    const avgCost = Number(h.avg_cost);
    const currentPrice = prices.get(h.symbol) ?? Number(h.current_price ?? 0);
    const marketValue = qty * currentPrice;
    const pnl = qty >= 0
      ? (currentPrice - avgCost) * qty
      : (avgCost - currentPrice) * Math.abs(qty);
    const pnlPct = avgCost > 0 ? (pnl / (Math.abs(qty) * avgCost)) * 100 : 0;
    return { ...h, qty, avgCost, currentPrice, marketValue, pnl, pnlPct };
  });

  const holdingsValue = liveHoldings.reduce((s, h) => s + h.marketValue, 0);
  const totalValue = cash + holdingsValue;
  const totalPnl = liveHoldings.reduce((s, h) => s + h.pnl, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary strip */}
      <div className="flex gap-px shrink-0 border-b border-border">
        <StatCell label="Total Value" value={fmtUsd(totalValue, 0)} />
        <StatCell label="Cash" value={fmtUsd(cash, 0)} />
        <StatCell label="Positions" value={fmtUsd(holdingsValue, 0)} />
        <StatCell
          label="Unrealized P&L"
          value={fmtUsd(totalPnl, 0)}
          color={totalPnl >= 0 ? 'text-green-trade' : 'text-red-trade'}
        />
      </div>

      {/* Holdings table */}
      <div className="flex-1 overflow-y-auto">
        {liveHoldings.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">No open positions</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel border-b border-border">
              <tr className="text-gray-400 uppercase tracking-wide">
                <Th>Symbol</Th>
                <Th right>Qty</Th>
                <Th right>Avg Cost</Th>
                <Th right>Last</Th>
                <Th right>Mkt Value</Th>
                <Th right>P&amp;L</Th>
                <Th right>P&amp;L %</Th>
              </tr>
            </thead>
            <tbody>
              {liveHoldings.map((h) => (
                <tr key={h.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                  <td className="px-3 py-2 font-semibold text-white">
                    {h.symbol}
                    {h.qty < 0 && (
                      <span className="ml-1 text-red-400 text-[10px] font-normal">SHORT</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono">
                    {Math.abs(h.qty).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-400 font-mono">{fmtUsd(h.avgCost)}</td>
                  <td className="px-3 py-2 text-right text-white font-mono font-semibold">{fmtUsd(h.currentPrice)}</td>
                  <td className="px-3 py-2 text-right text-gray-300 font-mono">{fmtUsd(h.marketValue, 0)}</td>
                  <td className={`px-3 py-2 text-right font-mono font-semibold ${h.pnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                    {h.pnl >= 0 ? '+' : ''}{fmtUsd(h.pnl, 0)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${h.pnl >= 0 ? 'text-green-trade' : 'text-red-trade'}`}>
                    {fmtPct(h.pnlPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value, color = 'text-white' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex-1 bg-surface px-3 py-2">
      <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-sm font-mono ${color}`}>{value}</div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-1.5 font-medium text-[10px] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

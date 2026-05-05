import { Order } from '../types';

interface Props {
  orders: Order[];
  prices: Map<string, number>;
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function TradeHistory({ orders, prices }: Props) {
  const pending = orders.filter((o) => o.status === 'pending');
  const rest = orders.filter((o) => o.status !== 'pending');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {orders.length === 0 ? (
          <div className="text-sm text-gray-500 py-8 text-center">No orders yet</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-panel border-b border-border">
              <tr className="text-gray-400 uppercase tracking-wide">
                <Th>Time</Th>
                <Th>Symbol</Th>
                <Th>Side</Th>
                <Th>Type</Th>
                <Th right>Qty</Th>
                <Th right>Price</Th>
                <Th right>Value</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {/* Pending rows first, pulsing */}
              {pending.map((order) => {
                const livePrice = prices.get(order.symbol) ?? 0;
                const estValue = Number(order.qty) * (order.limit_price ? Number(order.limit_price) : livePrice);
                return (
                  <tr key={order.id} className="border-b border-border/50 bg-yellow-900/10">
                    <td className="px-3 py-2 text-gray-500 font-mono">{fmtTime(order.created_at)}</td>
                    <td className="px-3 py-2 font-semibold text-white">{order.symbol}</td>
                    <td className="px-3 py-2">
                      <SideBadge side={order.side} />
                    </td>
                    <td className="px-3 py-2 text-gray-400">{order.order_type}</td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">{Number(order.qty).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400">
                      {order.limit_price ? fmtUsd(Number(order.limit_price)) : <span className="text-gray-500">MKT {fmtUsd(livePrice)}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">{fmtUsd(estValue)}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1 text-yellow-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
                        pending
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Filled / rejected / cancelled */}
              {rest.map((order) => {
                const fillPrice = order.fill_price ? Number(order.fill_price) : 0;
                const value = Number(order.qty) * fillPrice;
                return (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-surface/40 transition-colors">
                    <td className="px-3 py-2 text-gray-500 font-mono">{fmtTime(order.filled_at ?? order.created_at)}</td>
                    <td className="px-3 py-2 font-semibold text-white">{order.symbol}</td>
                    <td className="px-3 py-2">
                      <SideBadge side={order.side} />
                    </td>
                    <td className="px-3 py-2 text-gray-400">{order.order_type}</td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">{Number(order.qty).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-white">
                      {fillPrice > 0 ? fmtUsd(fillPrice) : order.limit_price ? fmtUsd(Number(order.limit_price)) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300 font-mono">
                      {value > 0 ? fmtUsd(value) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SideBadge({ side }: { side: Order['side'] }) {
  return (
    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
      side === 'BUY' ? 'bg-green-900/50 text-green-trade' : 'bg-red-900/50 text-red-trade'
    }`}>
      {side}
    </span>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], string> = {
    filled: 'text-green-trade',
    pending: 'text-yellow-400',
    rejected: 'text-red-trade',
    cancelled: 'text-gray-500',
  };
  return <span className={`font-medium ${map[status]}`}>{status}</span>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-3 py-1.5 font-medium text-[10px] ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

import { Order } from '../types';

interface Props {
  orders: Order[];
}

const statusColors: Record<Order['status'], string> = {
  filled: 'text-green-trade',
  pending: 'text-yellow-400',
  rejected: 'text-red-trade',
  cancelled: 'text-gray-500',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

export default function TradeHistory({ orders }: Props) {
  return (
    <div className="p-4 overflow-y-auto h-full">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Order History</div>

      {orders.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">No orders yet</div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="bg-surface border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    order.side === 'BUY' ? 'bg-green-900/40 text-green-trade' : 'bg-red-900/40 text-red-trade'
                  }`}>
                    {order.side}
                  </span>
                  <span className="font-semibold text-white text-sm">{order.symbol}</span>
                  <span className="text-xs text-gray-400">{order.order_type}</span>
                </div>
                <span className={`text-xs font-medium ${statusColors[order.status]}`}>
                  {order.status}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{Number(order.qty).toFixed(2)} shares</span>
                <span>
                  {order.fill_price
                    ? `Filled @ ${fmt(Number(order.fill_price))}`
                    : order.limit_price
                    ? `Limit ${fmt(Number(order.limit_price))}`
                    : 'Market'}
                </span>
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {new Date(order.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

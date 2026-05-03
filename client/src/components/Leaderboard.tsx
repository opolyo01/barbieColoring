import { LeaderboardEntry } from '../types';

interface Props {
  rankings: LeaderboardEntry[];
  currentUserId?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const medals = ['🥇', '🥈', '🥉'];

export default function Leaderboard({ rankings, currentUserId }: Props) {
  if (rankings.length === 0) {
    return <div className="p-3 text-xs text-gray-500">Waiting for data...</div>;
  }

  return (
    <div className="divide-y divide-border">
      {rankings.map((entry) => {
        const isMe = entry.user_id === currentUserId;
        const positive = entry.pnl >= 0;
        return (
          <div
            key={entry.user_id}
            className={`px-3 py-2.5 ${isMe ? 'bg-accent/10' : ''}`}
          >
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm shrink-0">
                  {entry.rank <= 3 ? medals[entry.rank - 1] : `#${entry.rank}`}
                </span>
                <span className={`text-xs font-medium truncate ${isMe ? 'text-accent' : 'text-white'}`}>
                  {entry.display_name}
                  {isMe && ' (you)'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-300">{fmt(entry.portfolio_value)}</span>
              <span className={`text-xs font-semibold ${positive ? 'text-green-trade' : 'text-red-trade'}`}>
                {positive ? '+' : ''}{entry.pnl_pct.toFixed(2)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface SparklineProps {
  prices: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ prices, width = 60, height = 18 }: SparklineProps) {
  if (prices.length < 2) return <svg width={width} height={height} style={{ display: 'block' }} />;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 1;
  const pts = prices
    .map((p, i) => {
      const x = pad + (i / (prices.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (p - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const up = prices[prices.length - 1] >= prices[prices.length - 2];
  const color = up ? '#34d399' : '#f87171';
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

import { useEffect, useRef } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { PriceTick } from '../types';

interface Props {
  symbol: string;
  ticks: PriceTick[];
}

export default function PriceChart({ symbol, ticks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f1117' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#21262d' },
        horzLines: { color: '#21262d' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#21262d' },
      timeScale: {
        borderColor: '#21262d',
        timeVisible: true,
        secondsVisible: true,
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#58a6ff',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, []);

  // Update data when symbol changes or ticks arrive
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    if (ticks.length === 0) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }

    // Group ticks into 1-minute OHLCV candles
    const candleMap = new Map<number, { open: number; high: number; low: number; close: number; volume: number }>();

    for (const tick of ticks) {
      const minute = Math.floor(tick.ts / 60000) * 60; // unix second
      const existing = candleMap.get(minute);
      if (!existing) {
        candleMap.set(minute, { open: tick.open, high: tick.high, low: tick.low, close: tick.close, volume: tick.volume });
      } else {
        existing.high = Math.max(existing.high, tick.high);
        existing.low = Math.min(existing.low, tick.low);
        existing.close = tick.close;
        existing.volume += tick.volume;
      }
    }

    const candles: CandlestickData[] = [];
    const volumes: HistogramData[] = [];

    for (const [time, c] of Array.from(candleMap.entries()).sort(([a], [b]) => a - b)) {
      candles.push({ time: time as CandlestickData['time'], open: c.open, high: c.high, low: c.low, close: c.close });
      volumes.push({
        time: time as HistogramData['time'],
        value: c.volume,
        color: c.close >= c.open ? '#3fb95040' : '#f8514940',
      });
    }

    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
  }, [ticks]);

  const lastTick = ticks[ticks.length - 1];
  const prevTick = ticks[ticks.length - 2];
  const change = lastTick && prevTick ? lastTick.price - prevTick.price : 0;
  const changePct = prevTick?.price ? (change / prevTick.price) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 flex items-baseline gap-3 border-b border-border bg-surface">
        <span className="font-bold text-white text-lg">{symbol}</span>
        {lastTick ? (
          <>
            <span className="text-white font-semibold">${lastTick.price.toFixed(2)}</span>
            <span className={change >= 0 ? 'text-green-trade text-sm' : 'text-red-trade text-sm'}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </>
        ) : (
          <span className="text-gray-500 text-sm">Loading prices...</span>
        )}
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}

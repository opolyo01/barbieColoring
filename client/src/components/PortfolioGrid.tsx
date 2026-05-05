import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  themeQuartz,
  colorSchemeDark,
  BodyScrollEvent,
  ColDef,
  CellClassParams,
  CellStyle,
  GetContextMenuItemsParams,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  MenuItemDef,
} from 'ag-grid-community';
import { Holding, Portfolio, PriceTick } from '../types';
import { Sparkline } from './Sparkline';

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: '#0f1117',
  foregroundColor: '#cbd5e1',
  headerBackgroundColor: '#0f1117',
  headerTextColor: '#475569',
  borderColor: '#1e2433',
  rowHoverColor: '#141b2d',
  selectedRowBackgroundColor: '#1a2744',
  oddRowBackgroundColor: '#0f1117',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  rowHeight: 26,
  headerHeight: 26,
  cellHorizontalPaddingScale: 0.8,
  wrapperBorderRadius: '0px',
  columnBorder: false,
});

// Static fundamentals — would come from a data vendor in production
const BETA: Record<string, number> = {
  AAPL: 1.20, TSLA: 2.10, NVDA: 1.85, MSFT: 0.90, AMZN: 1.15,
  GOOGL: 1.05, META: 1.35, NFLX: 1.40, AMD: 1.95, INTC: 0.85,
  JPM: 1.10, GS: 1.25, BAC: 1.30, WMT: 0.55, COST: 0.80,
  SPY: 1.00, QQQ: 1.10, DIS: 1.05, UBER: 1.65, PYPL: 1.45,
};

// Short interest as % of float — from FINRA/S3 Partners in production
const SHORT_INTEREST: Record<string, number> = {
  AAPL: 0.6, TSLA: 8.5, NVDA: 2.1, MSFT: 0.7, AMZN: 1.2,
  GOOGL: 0.9, META: 1.8, NFLX: 3.2, AMD: 3.5, INTC: 4.1,
  JPM: 0.8, GS: 1.1, BAC: 1.0, WMT: 1.3, COST: 1.4,
  SPY: 0.3, QQQ: 0.5, DIS: 2.8, UBER: 4.5, PYPL: 5.2,
};

interface Props {
  portfolio: Portfolio | null;
  holdings: Holding[];
  prices: Map<string, number>;
  ticks: Map<string, PriceTick[]>;
  latestTick: Map<string, PriceTick>;
  startingBalance: number | null;
  onClosePosition: (holding: { symbol: string; side: 'LONG' | 'SHORT'; qty: number | null }) => void | Promise<void>;
  onScalePosition: (holding: { symbol: string; side: 'LONG' | 'SHORT'; qty: number | null }) => void;
}

interface Row {
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number | null;
  avgCost: number | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  spread: number | null;
  sparkPrices: number[];
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayChgPct: number | null;
  dayVolume: number | null;
  chgDollar: number | null;
  chgPct: number | null;
  mktValue: number | null;
  costBasis: number | null;
  weight: number | null;
  pnl: number | null;
  pnlPct: number | null;
  beta: number | null;
  si: number | null;
}

const $ = (v: number, dec = 2) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

const pct = (v: number, sign = true) => `${sign && v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const css = (styles: CellStyle): CellStyle => styles;

const pnlStyle = ({ value }: CellClassParams<Row>): CellStyle =>
  value == null ? {} : { color: value >= 0 ? '#34d399' : '#f87171' };

const dimStyle: CellStyle = { color: '#64748b' };
const mutedStyle: CellStyle = { color: '#475569' };

export default function PortfolioGrid({
  portfolio,
  holdings,
  prices,
  ticks,
  latestTick,
  startingBalance,
  onClosePosition,
  onScalePosition,
}: Props) {
  const cash = portfolio ? Number(portfolio.cash_balance) : 0;
  const gridApiRef = useRef<GridApi<Row> | null>(null);
  const gridShellRef = useRef<HTMLDivElement | null>(null);
  const horizontalViewportRef = useRef<HTMLElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState({ contentWidth: 0, viewportWidth: 0, gridMaxScroll: 0 });

  const rows: Row[] = useMemo(() => {
    const totalPortfolio = cash + holdings.reduce((s, h) => {
      const last = prices.get(h.symbol) ?? Number(h.current_price ?? 0);
      return s + Math.abs(Number(h.qty)) * last;
    }, 0);

    return holdings.map((h) => {
      const qty = Number(h.qty);
      const avgCost = Number(h.avg_cost);
      const tick = latestTick.get(h.symbol);
      const last = prices.get(h.symbol) ?? Number(h.current_price ?? 0);
      const mktValue = qty * last;
      const absQty = Math.abs(qty);
      const pnl = qty >= 0 ? (last - avgCost) * qty : (avgCost - last) * absQty;
      const pnlPct = avgCost > 0 ? (pnl / (absQty * avgCost)) * 100 : 0;
      const dayOpen = tick?.open ?? null;
      const dayVolume = (ticks.get(h.symbol) ?? []).reduce((s, t) => s + t.volume, 0);

      return {
        symbol: h.symbol,
        side: qty >= 0 ? 'LONG' : 'SHORT',
        qty: absQty,
        avgCost,
        last,
        bid: tick?.bid ?? null,
        ask: tick?.ask ?? null,
        spread: tick ? tick.ask - tick.bid : null,
        sparkPrices: (ticks.get(h.symbol) ?? []).map((t) => t.price),
        dayOpen,
        dayHigh: tick?.high ?? null,
        dayLow: tick?.low ?? null,
        dayChgPct: dayOpen && dayOpen > 0 ? ((last / dayOpen) - 1) * 100 : null,
        dayVolume: dayVolume > 0 ? dayVolume : null,
        chgDollar: last - avgCost,
        chgPct: avgCost > 0 ? ((last - avgCost) / avgCost) * 100 : 0,
        mktValue,
        costBasis: absQty * avgCost,
        weight: totalPortfolio > 0 ? (Math.abs(mktValue) / totalPortfolio) * 100 : null,
        pnl,
        pnlPct,
        beta: BETA[h.symbol] ?? null,
        si: SHORT_INTEREST[h.symbol] ?? null,
      };
    });
  }, [holdings, prices, ticks, latestTick, cash]);

  const longSemv = rows.reduce((s, r) => s + Math.max(r.mktValue ?? 0, 0), 0);
  const shortSemv = rows.reduce((s, r) => s + Math.max(-(r.mktValue ?? 0), 0), 0);
  const grossSemv = longSemv + shortSemv;
  const netSemv = longSemv - shortSemv;
  const netLiq = cash + netSemv;
  const semvLeft = startingBalance != null ? startingBalance - grossSemv : null;

  const colDefs = useMemo<ColDef<Row>[]>(() => [
    // ── Identity ──────────────────────────────────────────────────
    {
      field: 'symbol', headerName: 'SYMBOL', width: 88, pinned: 'left',
      cellStyle: css({ color: '#f1f5f9', fontWeight: '600', letterSpacing: '0.02em' }),
    },
    {
      field: 'side', headerName: 'SIDE', width: 68, enableRowGroup: true,
      cellStyle: (p) => ({ color: p.value === 'LONG' ? '#34d399' : p.value === 'SHORT' ? '#f87171' : '#94a3b8', fontWeight: '600', fontSize: '11px' }),
    },
    {
      field: 'qty', headerName: 'QTY', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? p.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '',
      cellStyle: css({ color: '#94a3b8' }),
    },
    // ── Position cost ─────────────────────────────────────────────
    {
      field: 'avgCost', headerName: 'AVG COST', width: 96, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '',
      cellStyle: dimStyle,
    },
    {
      field: 'costBasis', headerName: 'COST BASIS', width: 108, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value, 0) : '',
      cellStyle: dimStyle,
    },
    // ── Live quote ────────────────────────────────────────────────
    {
      field: 'last', headerName: 'LAST', width: 96, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '',
      cellStyle: css({ color: '#e2e8f0', fontWeight: '600' }),
    },
    {
      field: 'bid', headerName: 'BID', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#34d399' }),
    },
    {
      field: 'ask', headerName: 'ASK', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#f87171' }),
    },
    {
      field: 'spread', headerName: 'SPREAD', width: 84, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? `$${p.value.toFixed(3)}` : '—',
      cellStyle: mutedStyle,
    },
    // ── Trend ─────────────────────────────────────────────────────
    {
      colId: 'trend', headerName: 'TREND', width: 76, sortable: false,
      valueGetter: () => '',
      cellStyle: css({ display: 'flex', alignItems: 'center', padding: '0 4px' }),
      cellRenderer: (p: ICellRendererParams<Row>) =>
        (p.data?.sparkPrices?.length ?? 0) >= 2
          ? <Sparkline prices={p.data!.sparkPrices} width={60} height={16} />
          : null,
    },
    // ── Day OHLC ──────────────────────────────────────────────────
    {
      field: 'dayOpen', headerName: 'D.OPEN', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: dimStyle,
    },
    {
      field: 'dayHigh', headerName: 'D.HIGH', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#34d399' }),
    },
    {
      field: 'dayLow', headerName: 'D.LOW', width: 88, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#f87171' }),
    },
    {
      field: 'dayChgPct', headerName: 'D.CHG%', width: 84, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? pct(p.value) : '—',
      cellStyle: pnlStyle,
    },
    {
      field: 'dayVolume', headerName: 'VOLUME', width: 100, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? p.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—',
      cellStyle: mutedStyle,
    },
    // ── P&L ───────────────────────────────────────────────────────
    {
      field: 'chgDollar', headerName: 'CHG $', width: 96, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '',
      cellStyle: pnlStyle,
    },
    {
      field: 'chgPct', headerName: 'CHG %', width: 80, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? pct(p.value) : '',
      cellStyle: pnlStyle,
    },
    {
      field: 'mktValue', headerName: 'MKT VALUE', width: 108, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value, 0) : '',
      cellStyle: css({ color: '#cbd5e1' }),
    },
    {
      field: 'weight', headerName: 'WEIGHT%', width: 84, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(1)}%` : '—',
      cellStyle: mutedStyle,
    },
    {
      field: 'pnl', headerName: 'P&L', width: 100, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? (p.value >= 0 ? '+' : '') + $(p.value, 0) : '',
      cellStyle: pnlStyle,
    },
    {
      field: 'pnlPct', headerName: 'P&L %', width: 80, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? pct(p.value) : '',
      cellStyle: pnlStyle,
    },
    // ── Risk / Fundamentals ───────────────────────────────────────
    {
      field: 'beta', headerName: 'BETA', width: 72, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? p.value.toFixed(2) : '—',
      cellStyle: (p) => ({ color: p.value == null ? '#374151' : p.value > 1.5 ? '#fbbf24' : p.value > 1.0 ? '#94a3b8' : '#64748b' }),
    },
    {
      field: 'si', headerName: 'SI%', width: 68, type: 'numericColumn',
      headerTooltip: 'Short interest as % of float',
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(1)}%` : '—',
      cellStyle: (p) => ({ color: p.value == null ? '#374151' : p.value > 5 ? '#f87171' : p.value > 2 ? '#fbbf24' : '#64748b' }),
    },
  ], []);

  const updateScrollMetrics = useCallback(() => {
    const shell = gridShellRef.current;
    if (!shell) return;

    const centerViewport =
      shell.querySelector<HTMLElement>('.ag-center-cols-viewport');
    const horizontalViewport =
      shell.querySelector<HTMLElement>('.ag-body-horizontal-scroll-viewport');
    if (!centerViewport || !horizontalViewport) return;

    horizontalViewportRef.current = horizontalViewport;

    const contentWidthFromApi = gridApiRef.current
      ?.getDisplayedCenterColumns()
      .reduce((sum, col) => sum + col.getActualWidth(), 0) ?? 0;

    const next = {
      contentWidth: Math.max(contentWidthFromApi, centerViewport.scrollWidth, centerViewport.clientWidth),
      viewportWidth: centerViewport.clientWidth,
      gridMaxScroll: Math.max(horizontalViewport.scrollWidth - horizontalViewport.clientWidth, 0),
    };

    setScrollMetrics((prev) =>
      prev.contentWidth === next.contentWidth &&
      prev.viewportWidth === next.viewportWidth &&
      prev.gridMaxScroll === next.gridMaxScroll
        ? prev
        : next,
    );

    if (stripRef.current) {
      const stripMaxScroll = Math.max(stripRef.current.scrollWidth - stripRef.current.clientWidth, 0);
      const nextStripLeft = next.gridMaxScroll > 0
        ? (horizontalViewport.scrollLeft / next.gridMaxScroll) * stripMaxScroll
        : 0;

      if (Math.abs(stripRef.current.scrollLeft - nextStripLeft) > 1) {
        stripRef.current.scrollLeft = nextStripLeft;
      }
    }
  }, []);

  useEffect(() => {
    const shell = gridShellRef.current;
    if (!shell) return;

    let raf = requestAnimationFrame(updateScrollMetrics);
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updateScrollMetrics);
    });

    resizeObserver.observe(shell);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [updateScrollMetrics]);

  const handleBodyScroll = useCallback((event: BodyScrollEvent<Row>) => {
    if (event.direction !== 'horizontal' || !stripRef.current) return;

    const stripMaxScroll = Math.max(stripRef.current.scrollWidth - stripRef.current.clientWidth, 0);
    const nextStripLeft = scrollMetrics.gridMaxScroll > 0
      ? (event.left / scrollMetrics.gridMaxScroll) * stripMaxScroll
      : 0;

    if (Math.abs(stripRef.current.scrollLeft - nextStripLeft) > 1) {
      stripRef.current.scrollLeft = nextStripLeft;
    }
  }, [scrollMetrics.gridMaxScroll]);

  const handleStripScroll = useCallback(() => {
    const strip = stripRef.current;
    const horizontalViewport = horizontalViewportRef.current;
    if (!strip || !horizontalViewport) return;
    const stripMaxScroll = Math.max(strip.scrollWidth - strip.clientWidth, 0);
    const targetLeft = stripMaxScroll > 0
      ? (strip.scrollLeft / stripMaxScroll) * scrollMetrics.gridMaxScroll
      : 0;

    if (Math.abs(horizontalViewport.scrollLeft - targetLeft) <= 1) return;
    horizontalViewport.scrollLeft = targetLeft;
  }, [scrollMetrics.gridMaxScroll]);

  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams<Row>) => {
    const row = params.node?.data;
    if (!row || params.node?.group) return [];

    const closeLabel = row.side === 'LONG' ? 'Close Position (Sell)' : 'Close Position (Buy)';
    const scaleLabel = row.side === 'LONG' ? 'Scale Long in OE' : 'Scale Short in OE';

    return [
      {
        name: closeLabel,
        action: () => {
          void onClosePosition({ symbol: row.symbol, side: row.side, qty: row.qty });
        },
      } satisfies MenuItemDef<Row>,
      {
        name: scaleLabel,
        action: () => {
          onScalePosition({ symbol: row.symbol, side: row.side, qty: row.qty });
        },
      } satisfies MenuItemDef<Row>,
    ];
  }, [onClosePosition, onScalePosition]);

  const showVisibleScrollbar = scrollMetrics.contentWidth - scrollMetrics.viewportWidth > 1;

  return (
    <div className="h-full min-w-0 flex flex-col portfolio-grid">
      <div ref={gridShellRef} className="flex-1 min-h-0">
        <AgGridReact
          theme={theme}
          columnDefs={colDefs}
          rowData={rows}
          getRowId={(p) => (p.data as Row).symbol}
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true, enableCellChangeFlash: false }}
          rowGroupPanelShow="always"
          groupDefaultExpanded={-1}
          suppressCellFocus
          animateRows={false}
          onGridReady={(event: GridReadyEvent<Row>) => {
            gridApiRef.current = event.api;
            requestAnimationFrame(updateScrollMetrics);
          }}
          onFirstDataRendered={() => requestAnimationFrame(updateScrollMetrics)}
          onGridSizeChanged={() => requestAnimationFrame(updateScrollMetrics)}
          onDisplayedColumnsChanged={() => requestAnimationFrame(updateScrollMetrics)}
          onColumnResized={() => requestAnimationFrame(updateScrollMetrics)}
          onBodyScroll={handleBodyScroll}
          getContextMenuItems={getContextMenuItems}
        />
      </div>
      <div className="shrink-0 border-t border-border bg-panel">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-px bg-border">
          <SummaryCell label="Long SEMV" value={$(longSemv, 0)} />
          <SummaryCell label="Short SEMV" value={$(shortSemv, 0)} />
          <SummaryCell label="Gross SEMV" value={$(grossSemv, 0)} />
          <SummaryCell label="Net SEMV" value={`${netSemv >= 0 ? '+' : '-' }${$(Math.abs(netSemv), 0)}`} />
          <SummaryCell
            label="SEMV Left"
            value={semvLeft != null ? `${semvLeft >= 0 ? '' : '-'}${$(Math.abs(semvLeft), 0)}` : '—'}
            positive={semvLeft != null ? semvLeft >= 0 : undefined}
          />
          <SummaryCell label="Net Liq" value={$(netLiq, 0)} />
        </div>
      </div>
      {showVisibleScrollbar && (
        <div className="shrink-0 border-t border-border bg-panel/80">
          <div
            ref={stripRef}
            onScroll={handleStripScroll}
            className="portfolio-grid-scrollbar overflow-x-auto overflow-y-hidden"
          >
            <div
              style={{
                width: `${Math.max(scrollMetrics.contentWidth, scrollMetrics.viewportWidth)}px`,
                height: '1px',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCell({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-panel px-4 py-2">
      <div className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${positive == null ? 'text-gray-100' : positive ? 'text-green-trade' : 'text-red-trade'}`}>
        {value}
      </div>
    </div>
  );
}

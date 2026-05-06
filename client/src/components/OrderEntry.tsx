import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import '../agGridSetup';
import { AgGridReact } from 'ag-grid-react';
import {
  themeQuartz,
  colorSchemeDark,
  ColDef,
  CellStyle,
  CellValueChangedEvent,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
} from 'ag-grid-community';
import { api } from '../api';

type Side = 'BUY' | 'SELL';
type OrderType = 'MARKET' | 'LIMIT';
type Status = 'draft' | 'submitting' | 'ok' | 'error';

export interface OrderEntryPrefill {
  id: string;
  symbol: string;
  side: Side;
  qty?: number | null;
  orderType?: OrderType;
  limitPrice?: number | null;
}

interface OrderRow {
  _id: string;
  symbol: string;
  side: Side;
  orderType: OrderType;
  qty: number | null;
  limitPrice: number | null;
  status: Status;
  message: string;
}

interface Props {
  prices: Map<string, number>;
  cash: number;
  semvLeft?: number | null;
  competitionId: string;
  token: string;
  onOrdersPlaced: () => void;
  onResolveSymbolPrice?: (symbol: string) => Promise<void> | void;
  prefill?: OrderEntryPrefill | null;
  onPrefillApplied?: () => void;
}

const theme = themeQuartz.withPart(colorSchemeDark).withParams({
  backgroundColor: '#0f1117',
  foregroundColor: '#cbd5e1',
  headerBackgroundColor: '#141820',
  headerTextColor: '#475569',
  borderColor: '#1e2433',
  rowHoverColor: '#141b2d',
  selectedRowBackgroundColor: '#1a2744',
  oddRowBackgroundColor: '#0f1117',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  rowHeight: 32,
  headerHeight: 28,
  cellHorizontalPaddingScale: 0.8,
  wrapperBorderRadius: '0px',
  columnBorder: false,
});

const $ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const css = (styles: CellStyle): CellStyle => styles;

function newRow(): OrderRow {
  return {
    _id: crypto.randomUUID(),
    symbol: '',
    side: 'BUY',
    orderType: 'MARKET',
    qty: null,
    limitPrice: null,
    status: 'draft',
    message: '',
  };
}

function isRowBlank(row: OrderRow): boolean {
  return row.status === 'draft' && !row.symbol.trim() && row.qty == null && row.limitPrice == null;
}

function rowFromPrefill(prefill: OrderEntryPrefill): OrderRow {
  return {
    _id: crypto.randomUUID(),
    symbol: prefill.symbol.toUpperCase().trim(),
    side: prefill.side,
    orderType: prefill.orderType ?? 'MARKET',
    qty: prefill.qty ?? null,
    limitPrice: (prefill.orderType ?? 'MARKET') === 'LIMIT' ? (prefill.limitPrice ?? null) : null,
    status: 'draft',
    message: '',
  };
}

function isRowValid(row: OrderRow): boolean {
  if (!row.symbol.trim()) return false;
  if (row.qty == null || row.qty <= 0) return false;
  if (row.orderType === 'LIMIT' && (row.limitPrice == null || row.limitPrice <= 0)) return false;
  return true;
}

function parseLine(line: string): OrderRow | null {
  let parts: string[];
  if (line.includes(',') || line.includes('\t')) {
    parts = line.split(/[,\t]/).map(s => s.trim().toUpperCase()).filter(Boolean);
  } else {
    parts = line.trim().toUpperCase().split(/\s+/);
  }
  const KEYWORDS = new Set(['BUY', 'SELL', 'MARKET', 'LIMIT']);
  const symbol = parts.find(p => /^[A-Z]{1,6}$/.test(p) && !KEYWORDS.has(p));
  if (!symbol) return null;
  const side: Side = parts.includes('SELL') ? 'SELL' : 'BUY';
  const orderType: OrderType = parts.includes('LIMIT') ? 'LIMIT' : 'MARKET';
  const numbers = parts.filter(p => /^\d+\.?\d*$/.test(p)).map(Number).filter(n => n > 0);
  const qty = numbers[0] ?? null;
  const limitPrice = orderType === 'LIMIT' ? (numbers[1] ?? null) : null;
  if (!qty) return null;
  return { _id: crypto.randomUUID(), symbol, side, orderType, qty, limitPrice, status: 'draft', message: '' };
}

function SideCell({ value }: ICellRendererParams<OrderRow>) {
  return (
    <span style={{ color: value === 'BUY' ? '#34d399' : '#f87171', fontWeight: 700, fontSize: 11 }}>
      {value}
    </span>
  );
}

export default function OrderEntry({
  prices,
  cash,
  semvLeft,
  competitionId,
  token,
  onOrdersPlaced,
  onResolveSymbolPrice,
  prefill,
  onPrefillApplied,
}: Props) {
  const [rows, setRows] = useState<OrderRow[]>(() => [newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const gridApiRef = useRef<GridApi<OrderRow> | null>(null);
  const pendingFocusRowIndexRef = useRef<number | null>(null);
  const symbolLookupInFlightRef = useRef<Set<string>>(new Set());
  const symbolLookupAttemptRef = useRef<Map<string, number>>(new Map());
  const pricesRef = useRef(prices);
  pricesRef.current = prices;

  const draftRows = rows.filter(r => r.status === 'draft' && r.symbol && r.qty != null && r.qty > 0);
  const totalNotional = draftRows.reduce((s, r) => {
    const price = r.orderType === 'LIMIT' && r.limitPrice ? r.limitPrice : (pricesRef.current.get(r.symbol) ?? 0);
    return s + (r.qty ?? 0) * price;
  }, 0);

  useEffect(() => {
    if (!prefill) return;

    setRows(prev => {
      const next = [...prev];
      const draft = rowFromPrefill(prefill);
      const blankIndex = next.findIndex(isRowBlank);

      if (blankIndex >= 0) {
        next[blankIndex] = draft;
      } else {
        next.push(draft);
      }

      if (next.length === 0 || !isRowBlank(next[next.length - 1])) {
        next.push(newRow());
      }

      return next;
    });
    onPrefillApplied?.();
  }, [onPrefillApplied, prefill]);

  useEffect(() => {
    const rowIndex = pendingFocusRowIndexRef.current;
    if (rowIndex == null || rowIndex >= rows.length) return;

    pendingFocusRowIndexRef.current = null;
    const api = gridApiRef.current;
    if (!api) return;

    requestAnimationFrame(() => {
      api.ensureIndexVisible(rowIndex);
      api.setFocusedCell(rowIndex, 'symbol');
      api.startEditingCell({ rowIndex, colKey: 'symbol' });
    });
  }, [rows]);

  useEffect(() => {
    if (!onResolveSymbolPrice) return;

    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      const hasPrice = prices.get(symbol) != null;
      const lastAttempt = symbolLookupAttemptRef.current.get(symbol) ?? 0;
      const attemptTooRecent = Date.now() - lastAttempt < 5000;

      if (!symbol || hasPrice || symbolLookupInFlightRef.current.has(symbol) || attemptTooRecent) continue;

      symbolLookupInFlightRef.current.add(symbol);
      symbolLookupAttemptRef.current.set(symbol, Date.now());
      Promise.resolve(onResolveSymbolPrice(symbol))
        .catch(() => {
          // Leave the timestamp so failures back off instead of spamming requests.
        })
        .finally(() => {
          symbolLookupInFlightRef.current.delete(symbol);
        });
    }
  }, [onResolveSymbolPrice, prices, rows]);

  const onCellValueChanged = useCallback((e: CellValueChangedEvent<OrderRow>) => {
    const row: OrderRow = { ...e.data };
    if (e.colDef.field === 'orderType' && row.orderType === 'MARKET') row.limitPrice = null;
    if (e.colDef.field === 'qty' && row.qty != null) {
      row.qty = Number(row.qty);
      if (!Number.isFinite(row.qty) || row.qty === 0) {
        row.qty = null;
      } else if (row.qty < 0) {
        row.side = 'SELL';
        row.qty = Math.abs(row.qty);
      }
    }
    if (e.colDef.field === 'symbol') {
      row.symbol = row.symbol.toUpperCase().trim();
    }
    if (row.status !== 'draft') row.status = 'draft';
    setRows(prev => {
      const next = prev.map(r => r._id === row._id ? row : r);
      const rowIndex = next.findIndex(r => r._id === row._id);
      const isLastRow = rowIndex === next.length - 1;

      if (isLastRow && isRowValid(row)) {
        pendingFocusRowIndexRef.current = next.length;
        next.push(newRow());
      }

      return next;
    });
  }, []);

  const colDefs = useMemo<ColDef<OrderRow>[]>(() => [
    {
      colId: 'del', headerName: '', width: 32, sortable: false, resizable: false, suppressMovable: true,
      cellStyle: css({ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }),
      cellRenderer: ({ data }: ICellRendererParams<OrderRow>) => (
        <button
          onClick={() => data && setRows(prev => prev.filter(r => r._id !== data._id))}
          style={{ color: '#374151', fontSize: 16, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          onMouseOver={e => (e.currentTarget.style.color = '#f87171')}
          onMouseOut={e => (e.currentTarget.style.color = '#374151')}
        >×</button>
      ),
    },
    {
      field: 'symbol', headerName: 'SYMBOL', width: 104, editable: true,
      cellEditor: 'agTextCellEditor',
      cellEditorParams: { useFormatter: false },
      valueSetter: p => { p.data.symbol = String(p.newValue ?? '').toUpperCase().trim(); return true; },
      cellStyle: css({ color: '#f1f5f9', fontWeight: '600', letterSpacing: '0.04em' }),
    },
    {
      field: 'side', headerName: 'SIDE', width: 72, editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['BUY', 'SELL'] },
      cellEditorPopup: true,
      cellRenderer: SideCell,
    },
    {
      field: 'orderType', headerName: 'TYPE', width: 88, editable: true,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['MARKET', 'LIMIT'] },
      cellEditorPopup: true,
      cellStyle: css({ color: '#64748b', fontSize: '11px' }),
    },
    {
      field: 'qty', headerName: 'QTY', width: 96, editable: true, type: 'numericColumn',
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: { precision: 0 },
      valueFormatter: p => p.value != null ? p.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '',
      cellStyle: css({ color: '#e2e8f0', fontWeight: '600' }),
    },
    {
      field: 'limitPrice', headerName: 'LIMIT', width: 96, type: 'numericColumn',
      editable: p => p.data?.orderType === 'LIMIT',
      cellEditor: 'agNumberCellEditor',
      cellEditorParams: { min: 0.01, precision: 2 },
      valueFormatter: p => {
        if (p.data?.orderType !== 'LIMIT') return '—';
        return p.value != null ? `$${Number(p.value).toFixed(2)}` : '';
      },
      cellStyle: p => ({ color: p.data?.orderType === 'LIMIT' ? '#e2e8f0' : '#1e293b' }),
    },
    {
      colId: 'price', headerName: 'MKT PRICE', width: 96, type: 'numericColumn',
      valueGetter: p => pricesRef.current.get(p.data?.symbol ?? '') ?? null,
      valueFormatter: p => p.value != null ? `$${Number(p.value).toFixed(2)}` : '—',
      cellStyle: css({ color: '#475569' }),
    },
    {
      colId: 'estValue', headerName: 'EST VALUE', width: 110, type: 'numericColumn',
      valueGetter: p => {
        const qty = p.data?.qty;
        const price = p.data?.orderType === 'LIMIT' && p.data?.limitPrice
          ? p.data.limitPrice
          : pricesRef.current.get(p.data?.symbol ?? '') ?? null;
        return qty && price ? qty * price : null;
      },
      valueFormatter: p => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#94a3b8' }),
    },
  ], []);

  function applyPaste() {
    const newRows = pasteText.trim().split('\n').map(parseLine).filter(Boolean) as OrderRow[];
    if (newRows.length === 0) return;
    setRows(prev => {
      const nonEmpty = prev.filter(r => r.qty != null);
      return [...nonEmpty, ...newRows, newRow()];
    });
    setPasteText('');
    setShowPaste(false);
  }

  async function submitOrders() {
    if (draftRows.length === 0 || submitting) return;
    setSubmitting(true);
    const results = await Promise.allSettled(
      draftRows.map(async row => {
        setRows(prev => prev.map(r => r._id === row._id ? { ...r, status: 'submitting' } : r));
        try {
          await api.orders.place(token, {
            competitionId,
            symbol: row.symbol,
            side: row.side,
            qty: row.qty!,
            orderType: row.orderType,
            ...(row.orderType === 'LIMIT' && row.limitPrice ? { limitPrice: row.limitPrice } : {}),
          });
          setRows(prev => prev.map(r => r._id === row._id ? { ...r, status: 'ok', message: '' } : r));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error';
          setRows(prev => prev.map(r => r._id === row._id ? { ...r, status: 'error', message: msg } : r));
          throw err;
        }
      }),
    );
    setSubmitting(false);
    const ok = results.filter(r => r.status === 'fulfilled').length;
    if (ok > 0) onOrdersPlaced();
  }

  return (
    <div className="h-full flex flex-col bg-surface">

      {/* Header */}
      <div className="px-4 py-2 border-b border-border bg-panel flex items-center gap-6 shrink-0">
        <div className="text-[10px] text-gray-600 uppercase tracking-widest">Order Basket</div>
        <div className="text-xs font-mono">
          <span className="text-gray-600">SEMV Left </span>
          <span className={semvLeft != null && semvLeft < 0 ? 'text-red-trade' : 'text-gray-200'}>
            {semvLeft != null
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(semvLeft)
              : '—'}
          </span>
        </div>
        <div className="text-xs font-mono">
          <span className="text-gray-600">Cash </span>
          <span className="text-gray-500">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cash)}</span>
        </div>
        {draftRows.length > 0 && (
          <div className="text-xs font-mono">
            <span className="text-gray-600">{draftRows.length} order{draftRows.length !== 1 ? 's' : ''} · est. </span>
            <span className="text-gray-300">{$(totalNotional)}</span>
          </div>
        )}
      </div>

      {/* Paste panel */}
      {showPaste && (
        <div className="px-4 py-3 border-b border-border bg-panel shrink-0">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">
            Paste CSV — one order per line:&nbsp;
            <span className="text-gray-700 normal-case tracking-normal">SYMBOL SIDE [TYPE] QTY [LIMIT_PRICE]</span>
          </div>
          <textarea
            autoFocus
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyPaste(); if (e.key === 'Escape') setShowPaste(false); }}
            placeholder={'AAPL BUY 100\nMSFT SELL LIMIT 50 400.00\nNVDA BUY MARKET 25\nGOOGL,BUY,LIMIT,10,175.50'}
            className="w-full h-24 bg-surface border border-border rounded px-3 py-2 text-xs font-mono text-gray-300 focus:outline-none focus:border-slate-500 resize-none"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={applyPaste}
              disabled={!pasteText.trim()}
              className="px-3 py-1 text-xs bg-accent/20 border border-accent text-accent rounded hover:bg-accent/30 transition-colors disabled:opacity-40"
            >
              Add Rows ⌘↵
            </button>
            <button
              onClick={() => { setShowPaste(false); setPasteText(''); }}
              className="px-3 py-1 text-xs border border-border text-gray-500 rounded hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 min-h-0 min-w-0">
        <AgGridReact
          theme={theme}
          columnDefs={colDefs}
          rowData={rows}
          getRowId={p => (p.data as OrderRow)._id}
          onGridReady={(event: GridReadyEvent<OrderRow>) => {
            gridApiRef.current = event.api;
          }}
          onCellValueChanged={onCellValueChanged}
          defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true, enableCellChangeFlash: false }}
          singleClickEdit
          stopEditingWhenCellsLoseFocus
          suppressCellFocus={false}
          animateRows={false}
          alwaysShowHorizontalScroll
        />
      </div>

      {/* Bottom bar */}
      <div className="px-3 py-2 border-t border-border bg-panel flex items-center gap-2 shrink-0">
        <button
          onClick={() => setRows(prev => [...prev, newRow()])}
          className="px-3 py-1.5 text-xs border border-border text-gray-500 hover:text-gray-200 hover:border-gray-500 rounded transition-colors font-mono"
        >
          + Add Row
        </button>
        <button
          onClick={() => setShowPaste(v => !v)}
          className={`px-3 py-1.5 text-xs border rounded transition-colors font-mono ${
            showPaste ? 'border-accent text-accent bg-accent/10' : 'border-border text-gray-500 hover:text-gray-200 hover:border-gray-500'
          }`}
        >
          Paste CSV
        </button>
        <button
          onClick={() => setRows(prev => {
            const next = prev.filter(r => r.status !== 'ok');
            return next.length > 0 ? next : [newRow()];
          })}
          className="px-3 py-1.5 text-xs border border-border text-gray-600 hover:text-gray-400 rounded transition-colors font-mono"
        >
          Clear sent
        </button>

        <div className="flex-1" />

        <button
          onClick={submitOrders}
          disabled={draftRows.length === 0 || submitting}
          className="px-5 py-1.5 text-sm font-bold rounded transition-colors disabled:opacity-40 bg-accent hover:bg-accent/80 text-white font-mono tracking-wide"
        >
          {submitting ? 'Sending…' : `Submit ${draftRows.length > 0 ? draftRows.length : ''} Order${draftRows.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

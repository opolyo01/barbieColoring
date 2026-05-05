import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  themeQuartz,
  colorSchemeDark,
  ColDef,
  CellStyle,
  RowClassParams,
  ICellRendererParams,
} from 'ag-grid-community';
import { Order } from '../types';
import { api } from '../api';

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

interface Props {
  orders: Order[];
  prices: Map<string, number>;
  token: string;
  onCancelled: () => void;
}

interface Row {
  id: string;
  time: string;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  limitPrice: number | null;
  fillPrice: number | null;
  value: number;
  status: string;
}

const $ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

const css = (styles: CellStyle): CellStyle => styles;

export default function OrderBlotter({ orders, prices, token, onCancelled }: Props) {
  const rows: Row[] = useMemo(() =>
    [...orders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map((o) => {
        const fill = o.fill_price ? Number(o.fill_price) : null;
        const limit = o.limit_price ? Number(o.limit_price) : null;
        const live = prices.get(o.symbol) ?? 0;
        const exec = fill ?? limit ?? live;
        return {
          id: o.id,
          time: fmtTime(o.filled_at ?? o.created_at),
          symbol: o.symbol,
          side: o.side,
          type: o.order_type,
          qty: Number(o.qty),
          limitPrice: limit,
          fillPrice: fill,
          value: Number(o.qty) * exec,
          status: o.status,
        };
      }),
    [orders, prices],
  );

  const colDefs = useMemo<ColDef<Row>[]>(() => [
    {
      colId: 'cancel', headerName: '', width: 32, sortable: false, resizable: false, suppressMovable: true,
      cellStyle: css({ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }),
      cellRenderer: ({ data }: ICellRendererParams<Row>) => {
        if (!data || data.status !== 'pending') return null;
        return (
          <button
            onClick={() => api.orders.cancel(data.id, token).then(onCancelled).catch(() => {})}
            title="Cancel order"
            style={{ color: '#374151', fontSize: 15, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
            onMouseOver={e => (e.currentTarget.style.color = '#f87171')}
            onMouseOut={e => (e.currentTarget.style.color = '#374151')}
          >×</button>
        );
      },
    },
    {
      field: 'time', headerName: 'TIME', width: 86, pinned: 'left',
      cellStyle: css({ color: '#475569' }),
    },
    {
      field: 'symbol', headerName: 'SYMBOL', width: 86, enableRowGroup: true,
      cellStyle: css({ color: '#f1f5f9', fontWeight: '600', letterSpacing: '0.02em' }),
    },
    {
      field: 'side', headerName: 'SIDE', width: 66, enableRowGroup: true,
      cellStyle: (p) => ({
        color: p.value === 'BUY' ? '#34d399' : '#f87171',
        fontWeight: '700',
        fontSize: '11px',
      }),
    },
    {
      field: 'type', headerName: 'TYPE', width: 72,
      cellStyle: css({ color: '#64748b', fontSize: '11px' }),
    },
    {
      field: 'qty', headerName: 'QTY', width: 86, type: 'numericColumn',
      aggFunc: 'sum',
      valueFormatter: (p) => p.value != null ? p.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '',
      cellStyle: css({ color: '#94a3b8' }),
    },
    {
      field: 'limitPrice', headerName: 'LIMIT', width: 96, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: css({ color: '#64748b' }),
    },
    {
      field: 'fillPrice', headerName: 'FILL', width: 100, type: 'numericColumn',
      valueFormatter: (p) => p.value != null ? $(p.value) : '—',
      cellStyle: (p) => ({ color: p.value != null ? '#e2e8f0' : '#374151', fontWeight: p.value != null ? '600' : '400' }),
    },
    {
      field: 'value', headerName: 'NOTIONAL', width: 110, type: 'numericColumn',
      aggFunc: 'sum',
      valueFormatter: (p) => p.value != null ? $(p.value) : '',
      cellStyle: css({ color: '#94a3b8' }),
    },
    {
      field: 'status', headerName: 'STATUS', width: 88, enableRowGroup: true,
      cellStyle: (p) => {
        const colors: Record<string, string> = { filled: '#34d399', pending: '#fbbf24', rejected: '#f87171', cancelled: '#475569' };
        return { color: colors[p.value] ?? '#64748b', fontWeight: '600', fontSize: '11px', letterSpacing: '0.05em' };
      },
    },
  ], []);

  const getRowStyle = (p: RowClassParams<Row>) => {
    if (p.data?.status === 'pending') return { background: 'rgba(251,191,36,0.04)' };
    return undefined;
  };

  return (
    <div className="h-full min-w-0">
      <AgGridReact
        theme={theme}
        columnDefs={colDefs}
        rowData={rows}
        getRowStyle={getRowStyle}
        getRowId={(p) => (p.data as Row).id}
        defaultColDef={{ sortable: true, resizable: true, suppressHeaderMenuButton: true, enableCellChangeFlash: false }}
        rowGroupPanelShow="always"
        groupDefaultExpanded={-1}
        suppressCellFocus
        animateRows={false}
        rowBuffer={30}
        alwaysShowHorizontalScroll
      />
    </div>
  );
}

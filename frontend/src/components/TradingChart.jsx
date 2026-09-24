import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  createChart, 
  CandlestickSeries, 
  HistogramSeries, 
  LineSeries, 
  ColorType, 
  CrosshairMode,
  createSeriesMarkers 
} from 'lightweight-charts';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { getProcessedMarkers } from '../utils/chartMarkers';
import { API_BASE } from '../config';
import klinesBaseline from '../data/klinesBaseline.json';
import klinesBaselineEth from '../data/klinesBaseline_eth.json';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ChevronRight, 
  ChevronLeft, 
  Maximize2,
  Minimize2,
  Crosshair,
  CheckCircle2,
  Eye,
  EyeOff,
  Sliders,
  Zap,
  Target,
  ShieldAlert,
  GripHorizontal,
  RotateCcw,
  ArrowRight,
  ArrowUpDown
} from 'lucide-react';

const TIMEFRAMES = [
  { id: '30m', label: '30M' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
];

function formatDuration(startTime, endTime) {
  if (!startTime) return '-';
  const start = new Date(startTime).getTime();
  const end = endTime && !String(endTime).includes('RUNNING') 
    ? new Date(endTime).getTime() 
    : Date.now();
  const diffMs = Math.abs(end - start);
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = diffHours / 24;

  if (diffDays >= 14) {
    const weeks = Math.round(diffDays / 7);
    return `${weeks} Weeks (${Math.round(diffDays)}d)`;
  }
  if (diffDays >= 1) {
    return `${diffDays.toFixed(1)} Days (${Math.round(diffHours)}h)`;
  }
  return `${Math.round(diffHours)} Hours`;
}

export default function TradingChart({ 
  timeframe = '30m', 
  onTimeframeChange, 
  activeStrategy = null,
  liveTicker = null,
  onTradeSelect = null,
  theme = 'light',
  floor = null,
  onPriceSync = null,
  activeSignals = [],
  symbol = 'BTCUSDT',
}) {
  const isDark = theme === 'dark';
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const maSeriesRef = useRef({});
  const markersPrimitiveRef = useRef(null);
  const priceLinesRef = useRef([]);

  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState(() => {
    const source = symbol === 'ETHUSDT' ? klinesBaselineEth : klinesBaseline;
    return source[timeframe] || [];
  });
  const [hoveredData, setHoveredData] = useState(null);
  const [hoveredSignal, setHoveredSignal] = useState(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [markerLabelMode, setMarkerLabelMode] = useState('compact'); // 'compact' | 'minimal' | 'prices' | 'full'
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isHudExpanded, setIsHudExpanded] = useState(true);
  const [showPriceLevels, setShowPriceLevels] = useState(true);
  const [focusedTradeIndex, setFocusedTradeIndex] = useState(0);
  const [tradeFilter, setTradeFilter] = useState('ALL'); // 'ALL' | 'WINS' | 'LOSSES'
  const [signalSortOrder, setSignalSortOrder] = useState('DESC'); // 'DESC' (Newest First) | 'ASC' (Oldest First)

  // Draggable HUD State & Handlers
  const chartViewportRef = useRef(null);
  const hudRef = useRef(null);
  const [hudPos, setHudPos] = useState({ x: null, y: null });
  const [isDraggingHud, setIsDraggingHud] = useState(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, hudX: 0, hudY: 0 });

  const handleHudPointerDown = (e) => {
    // Only drag on primary mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Don't drag if clicking interactive controls (buttons, links, inputs)
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) {
      return;
    }

    const hudEl = hudRef.current;
    const viewportEl = chartViewportRef.current;
    if (!hudEl || !viewportEl) return;

    e.preventDefault();

    const hudRect = hudEl.getBoundingClientRect();
    const viewportRect = viewportEl.getBoundingClientRect();

    const currentX = hudRect.left - viewportRect.left;
    const currentY = hudRect.top - viewportRect.top;

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      hudX: currentX,
      hudY: currentY,
    };

    setIsDraggingHud(true);

    const handlePointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.pointerX;
      const deltaY = moveEvent.clientY - dragStartRef.current.pointerY;

      const viewportWidth = viewportEl.clientWidth;
      const viewportHeight = viewportEl.clientHeight;
      const hudWidth = hudEl.offsetWidth;
      const hudHeight = hudEl.offsetHeight;

      const newX = dragStartRef.current.hudX + deltaX;
      const newY = dragStartRef.current.hudY + deltaY;

      // Clamped within chart viewport bounds with 8px padding
      const clampedX = Math.max(8, Math.min(newX, viewportWidth - hudWidth - 8));
      const clampedY = Math.max(8, Math.min(newY, viewportHeight - hudHeight - 8));

      setHudPos({ x: clampedX, y: clampedY });
    };

    const handlePointerUp = () => {
      setIsDraggingHud(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Adjust HUD position if collapsed/expanded or on window resize to ensure it stays in bounds
  useEffect(() => {
    const handleReposition = () => {
      if (hudPos.x !== null && hudRef.current && chartViewportRef.current) {
        const viewportWidth = chartViewportRef.current.clientWidth;
        const viewportHeight = chartViewportRef.current.clientHeight;
        const hudWidth = hudRef.current.offsetWidth;
        const hudHeight = hudRef.current.offsetHeight;

        setHudPos((prev) => {
          if (prev.x === null) return prev;
          return {
            x: Math.max(8, Math.min(prev.x, viewportWidth - hudWidth - 8)),
            y: Math.max(8, Math.min(prev.y, viewportHeight - hudHeight - 8)),
          };
        });
      }
    };

    handleReposition();
    window.addEventListener('resize', handleReposition);
    return () => window.removeEventListener('resize', handleReposition);
  }, [isHudExpanded, hudPos.x]);

  const [visibleMAs, setVisibleMAs] = useState({
    ma8: false,
    ma25: true,
    ma50: true,
    ma55: false, // Default inactive per user request
    ma111: false, // Default inactive per user request
    volume: true
  });
  const visibleMAsRef = useRef(visibleMAs);
  visibleMAsRef.current = visibleMAs;

  const tradesList = activeStrategy?.trades || [];
  const activeTrade = tradesList[focusedTradeIndex] || tradesList[tradesList.length - 1];
  const isStrategyLong = activeStrategy?.type === 'LONG';

  // Map trades by timestamp for fast crosshair lookup & click-to-select
  const tradesByTime = useMemo(() => {
    const map = new Map();
    if (!tradesList.length) return map;

    tradesList.forEach((tr, idx) => {
      try {
        const cleanEntry = String(tr.entry_time).replace(' UTC', '').trim();
        const entryIso = cleanEntry.includes('T') ? cleanEntry : cleanEntry.replace(' ', 'T') + (cleanEntry.endsWith('Z') ? '' : 'Z');
        const entrySec = Math.floor(new Date(entryIso).getTime() / 1000);
        if (!isNaN(entrySec)) {
          map.set(entrySec, { ...tr, eventType: 'ENTRY', tradeIndex: idx });
        }

        if (tr.exit_time && !String(tr.exit_time).includes('RUNNING')) {
          const cleanExit = String(tr.exit_time).replace(' UTC', '').trim();
          const exitIso = cleanExit.includes('T') ? cleanExit : cleanExit.replace(' ', 'T') + (cleanExit.endsWith('Z') ? '' : 'Z');
          const exitSec = Math.floor(new Date(exitIso).getTime() / 1000);
          if (!isNaN(exitSec)) {
            map.set(exitSec, { ...tr, eventType: 'EXIT', tradeIndex: idx });
          }
        }
      } catch (e) {}
    });

    return map;
  }, [tradesList]);

  // Filtered trades for navigation strip (Sorted DESC by default to match trade logs)
  const filteredTrades = useMemo(() => {
    let list = tradesList;
    if (tradeFilter === 'WINS') {
      list = tradesList.filter((t) => (t.net_return_pct || 0) > 0);
    } else if (tradeFilter === 'LOSSES') {
      list = tradesList.filter((t) => (t.net_return_pct || 0) <= 0);
    }
    return [...list].sort((a, b) => {
      const diff = (a.trade_no || 0) - (b.trade_no || 0);
      return signalSortOrder === 'DESC' ? -diff : diff;
    });
  }, [tradesList, tradeFilter, signalSortOrder]);

  // Compute moving averages over candles array
  const calculateMAValues = (candleArr, period) => {
    const result = new Array(candleArr.length).fill(null);
    let sum = 0;
    for (let i = 0; i < candleArr.length; i++) {
      sum += candleArr[i].close;
      if (i >= period) {
        sum -= candleArr[i - period].close;
      }
      if (i >= period - 1) {
        result[i] = parseFloat((sum / period).toFixed(2));
      }
    }
    return result;
  };

  // Fetch Klines whenever timeframe changes with multi-tier edge fallback
  useEffect(() => {
    let isMounted = true;

    // 0. Instantly populate baseline candles for zero-latency initial paint (BTC or ETH)
    const baselineSource = symbol === 'ETHUSDT' ? klinesBaselineEth : klinesBaseline;
    if (baselineSource && baselineSource[timeframe] && baselineSource[timeframe].length > 0) {
      setCandles(baselineSource[timeframe]);
      setLoading(false);
    } else {
      setLoading(true);
    }

    async function loadKlines() {
      // Tier 1: Try configured backend API (validating JSON content-type)
      try {
        const res = await fetch(`${API_BASE}/api/klines?symbol=${symbol}&timeframe=${timeframe}&limit=5000`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          // Defensive guard: verify symbol matches current chart symbol
          const isSymbolMatch = !data.symbol || data.symbol === symbol;
          const lastBar = data.candles?.[data.candles.length - 1];
          const isMagnitudeValid = !lastBar || (symbol === 'ETHUSDT' ? lastBar.close < 20000 : lastBar.close > 20000);

          if (data && Array.isArray(data.candles) && data.candles.length > 0 && isSymbolMatch && isMagnitudeValid) {
            if (isMounted) {
              setCandles(data.candles);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Backend klines unavailable:', err);
      }

      // Tier 2: Bybit Spot Public REST API (accessible worldwide & not blocked by Indonesian Nawala)
      try {
        const bybitTfMap = { '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };
        const bybitInterval = bybitTfMap[timeframe] || '60';
        const res = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=1000`);
        if (res.ok) {
          const data = await res.json();
          if (data?.result?.list && Array.isArray(data.result.list) && data.result.list.length > 0) {
            const reversed = [...data.result.list].reverse();
            const parsed = reversed.map((c) => ({
              time: Math.floor(parseInt(c[0], 10) / 1000),
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5]),
            }));

            const ma8Arr = calculateMAValues(parsed, 8);
            const ma25Arr = calculateMAValues(parsed, 25);
            const ma50Arr = calculateMAValues(parsed, 50);
            const ma55Arr = calculateMAValues(parsed, 55);
            const ma111Arr = calculateMAValues(parsed, 111);

            const enriched = parsed.map((c, idx) => ({
              ...c,
              ma8: ma8Arr[idx],
              ma25: ma25Arr[idx],
              ma50: ma50Arr[idx],
              ma55: ma55Arr[idx],
              ma111: ma111Arr[idx],
            }));

            if (isMounted) {
              setCandles(enriched);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Bybit public klines unavailable:', err);
      }

      // Tier 3: Binance official public REST API
      try {
        const binanceInterval = timeframe.toLowerCase();
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${binanceInterval}&limit=1000`);
        if (res.ok) {
          const raw = await res.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const parsed = raw.map((c) => ({
              time: Math.floor(c[0] / 1000),
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5]),
            }));

            const ma8Arr = calculateMAValues(parsed, 8);
            const ma25Arr = calculateMAValues(parsed, 25);
            const ma50Arr = calculateMAValues(parsed, 50);
            const ma55Arr = calculateMAValues(parsed, 55);
            const ma111Arr = calculateMAValues(parsed, 111);

            const enriched = parsed.map((c, idx) => ({
              ...c,
              ma8: ma8Arr[idx],
              ma25: ma25Arr[idx],
              ma50: ma50Arr[idx],
              ma55: ma55Arr[idx],
              ma111: ma111Arr[idx],
            }));

            if (isMounted) {
              setCandles(enriched);
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Binance public klines fetch error:', err);
      }

      if (isMounted) setLoading(false);
    }

    loadKlines();

    return () => {
      isMounted = false;
    };
  }, [timeframe, symbol]);

  // Clean and remove price lines
  const clearPriceLines = () => {
    if (candleSeriesRef.current && priceLinesRef.current.length > 0) {
      priceLinesRef.current.forEach((line) => {
        try {
          candleSeriesRef.current.removePriceLine(line);
        } catch (e) {}
      });
      priceLinesRef.current = [];
    }
  };

  // Draw Entry, Exit, SL, TP price lines on chart for the focused trade
  const updatePriceLines = (trade) => {
    clearPriceLines();
    if (!candleSeriesRef.current || !trade || !showPriceLevels) return;

    const side = trade.side || trade.type || activeStrategy?.type || 'LONG';
    const isLong = side === 'LONG';
    const isWin = (trade.net_return_pct || 0) > 0;
    const isRunning = trade.status === 'OPEN' || trade.is_active || String(trade.exit_time).includes('RUNNING');

    // 1. Entry Line
    if (trade.entry_price) {
      const entryLine = candleSeriesRef.current.createPriceLine({
        price: trade.entry_price,
        color: isRunning ? '#30D158' : '#4FE0FF',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: isRunning 
          ? `ACTIVE ENTRY #${trade.trade_no} ($${trade.entry_price.toLocaleString()})`
          : `ENTRY #${trade.trade_no} ($${trade.entry_price.toLocaleString()})`,
      });
      priceLinesRef.current.push(entryLine);
    }

    // 2. Exit Line if closed
    if (trade.exit_price && !isRunning) {
      const exitLine = candleSeriesRef.current.createPriceLine({
        price: trade.exit_price,
        color: isWin ? '#39FF88' : '#FF4B5C',
        lineWidth: 2,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: `EXIT #${trade.trade_no} (${formatPercent(trade.net_return_pct || 0)}) @ $${trade.exit_price.toLocaleString()}`,
      });
      priceLinesRef.current.push(exitLine);
    }

    // 3. Stop Loss / Breakeven Line
    const explicitSl = trade.stop_loss || (trade.be_activated ? (isLong ? trade.entry_price * 1.002 : trade.entry_price * 0.998) : null);
    if (explicitSl) {
      const isBe = trade.be_activated || (isLong ? explicitSl > trade.entry_price : explicitSl < trade.entry_price);
      const slLine = candleSeriesRef.current.createPriceLine({
        price: explicitSl,
        color: isBe ? '#FF9F0A' : '#FF4B5C',
        lineWidth: isBe ? 2 : 1.5,
        lineStyle: isBe ? 0 : 2, // Solid if BE locked, Dashed if normal SL
        axisLabelVisible: true,
        title: isBe 
          ? `BE LOCKED SL (+0.2%) @ $${Math.round(explicitSl).toLocaleString()}`
          : `STOP LOSS @ $${Math.round(explicitSl).toLocaleString()}`,
      });
      priceLinesRef.current.push(slLine);
    } else {
      const slParam = activeStrategy?.parameters?.hard_stop_loss || '';
      const slMatch = String(slParam).match(/(\d+(\.\d+)?)/);
      if (slMatch && trade.entry_price) {
        const slPct = parseFloat(slMatch[1]);
        if (!isNaN(slPct) && slPct > 0 && slPct <= 30) {
          const slPrice = isLong 
            ? trade.entry_price * (1 - slPct / 100) 
            : trade.entry_price * (1 + slPct / 100);
          const slLine = candleSeriesRef.current.createPriceLine({
            price: slPrice,
            color: '#FF4B5C',
            lineWidth: 1.5,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `SL (${slPct}%) @ $${Math.round(slPrice).toLocaleString()}`,
          });
          priceLinesRef.current.push(slLine);
        }
      }
    }

    // 4. Take Profit Line
    const explicitTp = trade.take_profit;
    if (explicitTp) {
      const tpLine = candleSeriesRef.current.createPriceLine({
        price: explicitTp,
        color: '#39FF88',
        lineWidth: 1.5,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `TAKE PROFIT @ $${Math.round(explicitTp).toLocaleString()}`,
      });
      priceLinesRef.current.push(tpLine);
    } else {
      const tpParam = activeStrategy?.parameters?.take_profit || '';
      const tpMatch = String(tpParam).match(/(\d+(\.\d+)?)/);
      if (tpMatch && trade.entry_price) {
        const tpPct = parseFloat(tpMatch[1]);
        if (!isNaN(tpPct) && tpPct > 0 && tpPct <= 100) {
          const tpPrice = isLong 
            ? trade.entry_price * (1 + tpPct / 100) 
            : trade.entry_price * (1 - tpPct / 100);
          const tpLine = candleSeriesRef.current.createPriceLine({
            price: tpPrice,
            color: '#39FF88',
            lineWidth: 1.5,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `TP (${tpPct}%) @ $${Math.round(tpPrice).toLocaleString()}`,
          });
          priceLinesRef.current.push(tpLine);
        }
      }
    }
  };

  // Initialize and Render Lightweight Charts Canvas
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Remove existing chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      markersPrimitiveRef.current = null;
      priceLinesRef.current = [];
    }

    const container = chartContainerRef.current;
    const initialWidth = Math.max(300, container.clientWidth || container.parentElement?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth - 64 : 800));
    const chart = createChart(container, {
      width: initialWidth,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#07080A' : '#FFFFFF' },
        textColor: isDark ? '#86868B' : '#6E6E73',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Geist", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#0A84FF' : '#0071E3',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#16171F' : '#EAEAEE',
        },
        horzLine: {
          color: isDark ? '#0A84FF' : '#0071E3',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#16171F' : '#EAEAEE',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        scaleMargins: {
          top: 0.08,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: isDark ? '#30D158' : '#28A745',
      downColor: isDark ? '#FF453A' : '#E53935',
      borderUpColor: isDark ? '#30D158' : '#28A745',
      borderDownColor: isDark ? '#FF453A' : '#E53935',
      wickUpColor: isDark ? '#30D158' : '#28A745',
      wickDownColor: isDark ? '#FF453A' : '#E53935',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: isDark ? 'rgba(10, 132, 255, 0.3)' : 'rgba(0, 113, 227, 0.3)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.82,
        bottom: 0,
      },
    });
    volumeSeriesRef.current = volumeSeries;

    // 3. Moving Average Series (Default: only MA25 Blue and MA50 Yellow visible)
    const ma25Series = chart.addSeries(LineSeries, {
      color: isDark ? '#0A84FF' : '#0071E3',
      lineWidth: 1.5,
      title: 'MA25',
      priceLineVisible: false,
      visible: Boolean(visibleMAsRef.current?.ma25),
    });

    const ma50Series = chart.addSeries(LineSeries, {
      color: isDark ? '#FFD60A' : '#D97706',
      lineWidth: 1.5,
      title: 'MA50',
      priceLineVisible: false,
      visible: Boolean(visibleMAsRef.current?.ma50),
    });

    const ma55Series = chart.addSeries(LineSeries, {
      color: isDark ? '#BF5AF2' : '#8E44AD',
      lineWidth: 2,
      title: 'MA55 (Macro)',
      priceLineVisible: false,
      visible: Boolean(visibleMAsRef.current?.ma55),
    });

    const ma111Series = chart.addSeries(LineSeries, {
      color: isDark ? '#FF9F0A' : '#F57C00',
      lineWidth: 1.5,
      title: 'MA111',
      priceLineVisible: false,
      visible: Boolean(visibleMAsRef.current?.ma111),
    });

    const ma8Series = chart.addSeries(LineSeries, {
      color: isDark ? '#FFC145' : '#D97706',
      lineWidth: 1,
      title: 'MA8',
      priceLineVisible: false,
      visible: Boolean(visibleMAsRef.current?.ma8),
    });

    maSeriesRef.current = {
      ma8: ma8Series,
      ma25: ma25Series,
      ma50: ma50Series,
      ma55: ma55Series,
      ma111: ma111Series,
    };

    // Explicitly enforce visibility states on lightweight-charts series
    ma8Series.applyOptions({ visible: Boolean(visibleMAsRef.current?.ma8) });
    ma25Series.applyOptions({ visible: Boolean(visibleMAsRef.current?.ma25) });
    ma50Series.applyOptions({ visible: Boolean(visibleMAsRef.current?.ma50) });
    ma55Series.applyOptions({ visible: Boolean(visibleMAsRef.current?.ma55) });
    ma111Series.applyOptions({ visible: Boolean(visibleMAsRef.current?.ma111) });

    // Populate data
    if (candles.length > 0) {
      const formattedCandles = [];
      const formattedVolumes = [];
      const ma8Data = [];
      const ma25Data = [];
      const ma50Data = [];
      const ma55Data = [];
      const ma111Data = [];

      candles.forEach((c) => {
        formattedCandles.push({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        });

        formattedVolumes.push({
          time: c.time,
          value: c.volume,
          color: c.close >= c.open
            ? (isDark ? 'rgba(48, 209, 88, 0.25)' : 'rgba(40, 167, 69, 0.3)')
            : (isDark ? 'rgba(255, 69, 58, 0.25)' : 'rgba(229, 57, 53, 0.3)'),
        });

        if (c.ma8) ma8Data.push({ time: c.time, value: c.ma8 });
        if (c.ma25) ma25Data.push({ time: c.time, value: c.ma25 });
        if (c.ma50) ma50Data.push({ time: c.time, value: c.ma50 });
        if (c.ma55) ma55Data.push({ time: c.time, value: c.ma55 });
        if (c.ma111) ma111Data.push({ time: c.time, value: c.ma111 });
      });

      candleSeries.setData(formattedCandles);
      volumeSeries.setData(formattedVolumes);
      ma8Series.setData(ma8Data);
      ma25Series.setData(ma25Data);
      ma50Series.setData(ma50Data);
      ma55Series.setData(ma55Data);
      ma111Series.setData(ma111Data);

      // Plot Strategy Markers
      if (showMarkers && activeStrategy?.markers && activeStrategy.markers.length > 0) {
        const formatted = getProcessedMarkers(activeStrategy.markers, formattedCandles, markerLabelMode);
        if (formatted.length > 0) {
          try {
            markersPrimitiveRef.current = createSeriesMarkers(candleSeries, formatted);
          } catch (markerErr) {
            console.warn('Marker rendering fallback:', markerErr);
          }
        }
      }

      // Always anchor viewport on the latest/live bar first with clean breathing room
      const totalBars = formattedCandles.length;
      if (totalBars > 0) {
        const defaultBarsVisible = Math.min(totalBars, 85);
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, totalBars - defaultBarsVisible),
          to: totalBars + 6,
        });
        chart.timeScale().scrollToPosition(0, false);
      }
    }

    // Crosshair listener for tooltip & signal detection
    chart.subscribeCrosshairMove((param) => {
      if (
        !param.point ||
        !param.time ||
        param.point.x < 0 ||
        param.point.x > container.clientWidth ||
        param.point.y < 0 ||
        param.point.y > container.clientHeight
      ) {
        setHoveredData(null);
        setHoveredSignal(null);
        return;
      }

      const candle = param.seriesData.get(candleSeries);
      const vol = param.seriesData.get(volumeSeries);
      const ma25 = param.seriesData.get(ma25Series);
      const ma50 = param.seriesData.get(ma50Series);
      const ma55 = param.seriesData.get(ma55Series);
      const ma111 = param.seriesData.get(ma111Series);

      if (candle) {
        setHoveredData({
          time: param.time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: vol?.value,
          ma25: ma25?.value,
          ma50: ma50?.value,
          ma55: ma55?.value,
          ma111: ma111?.value,
        });

        // Check if a signal event occurred on this hovered candle!
        const sigEvent = tradesByTime.get(param.time);
        if (sigEvent) {
          setHoveredSignal(sigEvent);
        } else {
          setHoveredSignal(null);
        }
      }
    });

    // Click on chart to focus trade if clicked on a signal candle!
    chart.subscribeClick((param) => {
      if (!param.time) return;
      const sigEvent = tradesByTime.get(param.time);
      if (sigEvent && sigEvent.tradeIndex !== undefined) {
        playRetroSound('select');
        setFocusedTradeIndex(sigEvent.tradeIndex);
      }
    });

    // Responsive Resize Observer
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || !chartRef.current) return;
        const entryWidth = Math.floor(entries[0].contentRect.width);
        if (entryWidth > 50) {
          chartRef.current.applyOptions({ width: entryWidth });
        }
      });
      resizeObserver.observe(container);
    }

    // Window Resize fallback listener
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        markersPrimitiveRef.current = null;
        priceLinesRef.current = [];
      }
    };
  }, [candles, theme]);

  // Reset focused trade index when active strategy changes
  useEffect(() => {
    if (tradesList.length > 0) {
      setFocusedTradeIndex(tradesList.length - 1);
    }
  }, [activeStrategy?.id, tradesList.length]);

  // Update Markers dynamically when activeStrategy, showMarkers, or markerLabelMode changes
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    if (showMarkers && activeStrategy?.markers && activeStrategy.markers.length > 0) {
      const formatted = getProcessedMarkers(activeStrategy.markers, candles, markerLabelMode);

      if (formatted.length > 0) {
        try {
          if (markersPrimitiveRef.current) {
            markersPrimitiveRef.current.setMarkers(formatted);
          } else {
            markersPrimitiveRef.current = createSeriesMarkers(candleSeriesRef.current, formatted);
          }
        } catch (err) {
          console.warn('Marker update warning:', err);
        }
      } else {
        if (markersPrimitiveRef.current) {
          try {
            markersPrimitiveRef.current.setMarkers([]);
          } catch (e) {}
        }
      }
    } else {
      if (markersPrimitiveRef.current) {
        try {
          markersPrimitiveRef.current.setMarkers([]);
        } catch (e) {}
      }
    }
  }, [activeStrategy, showMarkers, markerLabelMode, candles]);

  // Update dynamic price lines whenever focused trade or showPriceLevels changes
  useEffect(() => {
    if (activeTrade) {
      updatePriceLines(activeTrade);
    } else {
      clearPriceLines();
    }
  }, [activeTrade, showPriceLevels, activeStrategy?.id]);

  // Real-time live ticker update on current candle
  useEffect(() => {
    if (!candleSeriesRef.current || !liveTicker?.price || candles.length === 0) return;

    // Guard: ensure ticker symbol matches current chart symbol
    if (liveTicker.symbol && liveTicker.symbol !== symbol) return;

    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    // Sanity guard: prevent accidental cross-ticker price corruption (e.g. BTC 87k on ETH 2.6k chart)
    const ratio = liveTicker.price / (lastCandle.close || 1);
    if (ratio > 4.0 || ratio < 0.25) return;

    const updated = {
      time: lastCandle.time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, liveTicker.price),
      low: Math.min(lastCandle.low, liveTicker.price),
      close: liveTicker.price,
    };

    try {
      candleSeriesRef.current.update(updated);
    } catch (e) {
      // Safe catch
    }
  }, [liveTicker?.price, liveTicker?.symbol, symbol, candles]);

  // Synchronize latest candle close price with platform header
  useEffect(() => {
    if (candles && candles.length > 0 && typeof onPriceSync === 'function') {
      const lastCandle = candles[candles.length - 1];
      if (lastCandle && lastCandle.close) {
        onPriceSync(lastCandle.close, symbol);
      }
    }
  }, [candles, onPriceSync, symbol]);

  // Jump chart to specific trade
  const handleJumpToTrade = (trade, index) => {
    playRetroSound('select');
    setFocusedTradeIndex(index);

    if (!trade) return;

    const entrySec = Math.floor(new Date(trade.entry_time).getTime() / 1000);

    // If trade entry timestamp is outside currently loaded candles, fetch historical slice around trade!
    if (candles.length > 0) {
      const minCandleTime = candles[0].time;
      const maxCandleTime = candles[candles.length - 1].time;

      if (entrySec < minCandleTime || entrySec > maxCandleTime) {
        setLoading(true);
        fetch(`${API_BASE}/api/klines?symbol=${symbol}&timeframe=${timeframe}&around_time=${entrySec}&limit=3000`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.candles && data.candles.length > 0) {
              setCandles(data.candles);
            }
            setLoading(false);
          })
          .catch((err) => {
            console.error('Failed to load klines around trade:', err);
            setLoading(false);
          });
        return;
      }
    }

    if (!chartRef.current || candles.length === 0) return;

    // Find closest candle index
    let closestIdx = -1;
    let minDiff = Infinity;

    for (let i = 0; i < candles.length; i++) {
      const diff = Math.abs(candles[i].time - entrySec);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    }

    if (closestIdx !== -1) {
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(0, closestIdx - 40),
        to: Math.min(candles.length - 1, closestIdx + 40),
      });
    }
  };

  // Anchor chart viewport to the latest/live bar (Binance / TradingView standard)
  const handleScrollToLastBar = () => {
    playRetroSound('blip');
    if (!chartRef.current || candles.length === 0) return;
    const totalBars = candles.length;
    const defaultBarsVisible = Math.min(totalBars, 85);
    chartRef.current.timeScale().setVisibleLogicalRange({
      from: Math.max(0, totalBars - defaultBarsVisible),
      to: totalBars + 6,
    });
    chartRef.current.timeScale().scrollToPosition(0, false);
  };

  // Toggle Moving Averages
  const toggleMA = (key) => {
    playRetroSound('blip');
    const nextState = !visibleMAs[key];
    setVisibleMAs((prev) => ({ ...prev, [key]: nextState }));

    if (maSeriesRef.current[key]) {
      maSeriesRef.current[key].applyOptions({ visible: nextState });
    } else if (key === 'volume' && volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({ visible: nextState });
    }
  };

  return (
    <div className="apple-glass rounded-3xl p-4 sm:p-6 space-y-4">
      
      {/* 1. Chart Controls Header: Symbol, Timeframes, Signal Controls, Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] dark:border-white/[0.08] pb-3.5">
        
        {/* Left: Symbol, Live Price & Timeframe Switcher */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-apple-text tracking-tight">
              {symbol === 'ETHUSDT' ? 'ETH/USDT' : 'BTC/USDT'}
            </span>
            <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-apple-blue/15 text-apple-cyan border border-apple-blue/30">
              Binance
            </span>
            <span className="font-mono text-sm md:text-base font-bold text-apple-text tabular-nums ml-1">
              {formatPrice(
                (liveTicker?.symbol && liveTicker.symbol !== symbol)
                  ? (candles.length > 0 ? candles[candles.length - 1].close : (symbol === 'ETHUSDT' ? 2645.20 : 77379.6))
                  : (liveTicker?.price || (candles.length > 0 ? candles[candles.length - 1].close : (symbol === 'ETHUSDT' ? 2645.20 : 77379.6)))
              )}
            </span>
            {liveTicker?.change_24h_pct !== undefined && (!liveTicker.symbol || liveTicker.symbol === symbol) && (
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border tabular-nums ${
                (liveTicker.change_24h_pct || 0) >= 0
                  ? 'text-apple-green bg-apple-green/10 border-apple-green/20'
                  : 'text-apple-red bg-apple-red/10 border-apple-red/20'
              }`}>
                {formatPercent(liveTicker.change_24h_pct || 0)}
              </span>
            )}
          </div>

          <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] p-1 rounded-xl">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => {
                  playRetroSound('blip');
                  if (onTimeframeChange) onTimeframeChange(tf.id);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                  timeframe === tf.id
                    ? 'bg-white dark:bg-white/15 text-apple-text shadow-sm font-semibold'
                    : 'text-apple-muted hover:text-apple-text hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Signal Visibility & Label Controls + Indicators */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          
          {/* Signal Label Style Switcher */}
          {activeStrategy && showMarkers && (
            <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] p-1 rounded-xl">
              <span className="text-[11px] text-apple-dim px-2 hidden md:inline">Labels:</span>
              {[
                { id: 'compact', label: 'Compact' },
                { id: 'minimal', label: 'Minimal' },
                { id: 'prices', label: 'Prices' },
              ].map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    playRetroSound('blip');
                    setMarkerLabelMode(style.id);
                  }}
                  className={`px-2 py-0.5 text-xs rounded-lg transition-all cursor-pointer ${
                    markerLabelMode === style.id
                      ? 'bg-white dark:bg-white/15 text-apple-text font-medium shadow-sm'
                      : 'text-apple-muted hover:text-apple-text'
                  }`}
                  title={`Marker Label Display: ${style.label}`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          )}

          {/* Toggle HUD */}
          {activeStrategy && showMarkers && (
            <button
              onClick={() => setIsHudVisible(!isHudVisible)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all cursor-pointer ${
                isHudVisible
                  ? 'bg-apple-blue/15 text-apple-blue dark:text-white border-apple-blue/40 shadow-sm font-medium'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
              }`}
              title="Toggle On-Chart Signal Inspector HUD"
            >
              {isHudVisible ? <Eye className="w-3.5 h-3.5 text-apple-cyan" /> : <EyeOff className="w-3.5 h-3.5 text-apple-dim" />}
              <span>HUD</span>
            </button>
          )}

          {/* Toggle Price Levels (SL / TP / Entry lines) */}
          {activeStrategy && showMarkers && (
            <button
              onClick={() => setShowPriceLevels(!showPriceLevels)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-all cursor-pointer ${
                showPriceLevels
                  ? 'bg-apple-blue/15 text-apple-blue dark:text-white border-apple-blue/40 shadow-sm font-medium'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
              }`}
              title="Toggle Dynamic Entry / SL / TP Price Lines"
            >
              <Target className="w-3.5 h-3.5 text-apple-cyan" />
              <span>Levels</span>
            </button>
          )}

          {/* Show / Hide Signals */}
          <button
            onClick={() => setShowMarkers(!showMarkers)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs transition-all cursor-pointer ${
              showMarkers
                ? 'bg-white dark:bg-white/15 text-apple-text border-black/10 dark:border-white/20 font-medium shadow-sm'
                : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
            }`}
          >
            <CheckCircle2 className={`w-3.5 h-3.5 ${showMarkers ? 'text-apple-green' : 'text-apple-dim'}`} />
            <span>{showMarkers ? 'Signals On' : 'Signals Off'}</span>
          </button>

          {/* Indicators Toggle Pill */}
          <div className="flex items-center gap-1 pl-1 border-l border-black/10 dark:border-white/10">
            <button
              onClick={() => toggleMA('ma25')}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                visibleMAs.ma25
                  ? 'bg-apple-blue/15 text-apple-blue dark:text-[#0A84FF] border-apple-blue/40 font-semibold shadow-sm'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.06] dark:border-white/[0.06] text-apple-dim hover:text-apple-muted'
              }`}
              title="Fast Moving Average 25 (Blue - Active by default)"
            >
              MA25
            </button>
            <button
              onClick={() => toggleMA('ma50')}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                visibleMAs.ma50
                  ? 'bg-amber-400/15 text-amber-600 dark:text-[#FFD60A] border-amber-400/40 font-semibold shadow-sm'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.06] dark:border-white/[0.06] text-apple-dim hover:text-apple-muted'
              }`}
              title="Trend Moving Average 50 (Yellow - Active by default)"
            >
              MA50
            </button>
            <button
              onClick={() => toggleMA('ma55')}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                visibleMAs.ma55
                  ? 'bg-apple-purple/15 text-apple-purple border-apple-purple/30 font-semibold'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.06] dark:border-white/[0.06] text-apple-dim hover:text-apple-muted'
              }`}
              title="Weekly MA55 Macro Regime Anchor (Inactive by default)"
            >
              MA55
            </button>
            <button
              onClick={() => toggleMA('ma111')}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                visibleMAs.ma111
                  ? 'bg-apple-orange/15 text-apple-orange border-apple-orange/30 font-semibold'
                  : 'bg-black/[0.03] dark:bg-white/[0.03] border-black/[0.06] dark:border-white/[0.06] text-apple-dim hover:text-apple-muted'
              }`}
              title="MA 111 Baseline (Inactive by default)"
            >
              MA111
            </button>
          </div>

          {/* Last Bar / Live View */}
          <button
            onClick={handleScrollToLastBar}
            className="px-2.5 py-1 bg-apple-blue/15 hover:bg-apple-blue/25 text-apple-cyan active:scale-[0.98] border border-apple-blue/30 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5"
            title="Anchor view on the latest/live bar"
          >
            <ArrowRight className="w-3 h-3" />
            <span>Last Bar</span>
          </button>

          {/* Fit View */}
          <button
            onClick={() => {
              playRetroSound('blip');
              if (chartRef.current) chartRef.current.timeScale().fitContent();
            }}
            className="px-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:scale-[0.98] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-apple-muted hover:text-apple-text text-xs transition-all cursor-pointer"
            title="Fit all candles in viewport"
          >
            Fit View
          </button>
        </div>

      </div>

      {/* 2. OHLCV Metrics & Signal Hover Callout Bar */}
      <div className="min-h-[30px] py-0.5 flex items-center justify-between gap-3 text-xs font-mono text-apple-muted overflow-x-auto no-scrollbar">
        {hoveredSignal ? (
          <div className="flex items-center gap-2 bg-apple-blue/15 border border-apple-blue/30 rounded-lg px-2.5 py-0.5 text-white font-medium animate-in fade-in duration-150">
            <Zap className="w-3.5 h-3.5 text-apple-cyan" />
            <span>
              {hoveredSignal.eventType === 'ENTRY' 
                ? `Signal Entry: ${hoveredSignal.side || hoveredSignal.type} #${hoveredSignal.trade_no} @ ${formatPrice(hoveredSignal.entry_price)} (${hoveredSignal.entry_time})`
                : `Signal Exit: Trade #${hoveredSignal.trade_no} @ ${formatPrice(hoveredSignal.exit_price)} (${formatPercent(hoveredSignal.net_return_pct)}) - ${hoveredSignal.exit_reason || 'Exit Rule'}`
              }
            </span>
          </div>
        ) : hoveredData ? (
          <div className="flex items-center gap-4">
            <div>
              <span className="text-apple-dim">O:</span>{' '}
              <span className="text-apple-text tabular-nums">{formatPrice(hoveredData.open)}</span>
            </div>
            <div>
              <span className="text-apple-dim">H:</span>{' '}
              <span className="text-apple-green tabular-nums">{formatPrice(hoveredData.high)}</span>
            </div>
            <div>
              <span className="text-apple-dim">L:</span>{' '}
              <span className="text-apple-red tabular-nums">{formatPrice(hoveredData.low)}</span>
            </div>
            <div>
              <span className="text-apple-dim">C:</span>{' '}
              <span className={`tabular-nums font-semibold ${hoveredData.close >= hoveredData.open ? 'text-apple-green' : 'text-apple-red'}`}>
                {formatPrice(hoveredData.close)}
              </span>
            </div>
            {hoveredData.volume && (
              <div>
                <span className="text-apple-dim">VOL:</span>{' '}
                <span className="text-apple-text tabular-nums">{Number(hoveredData.volume).toFixed(2)} {symbol === 'ETHUSDT' ? 'ETH' : 'BTC'}</span>
              </div>
            )}
            {hoveredData.ma25 && visibleMAs.ma25 && (
              <div>
                <span className="text-[#0A84FF]">MA25:</span>{' '}
                <span className="tabular-nums text-zinc-300">{formatPrice(hoveredData.ma25)}</span>
              </div>
            )}
            {hoveredData.ma50 && visibleMAs.ma50 && (
              <div>
                <span className="text-[#FFD60A] dark:text-[#FFD60A] text-amber-500">MA50:</span>{' '}
                <span className="tabular-nums text-zinc-300">{formatPrice(hoveredData.ma50)}</span>
              </div>
            )}
            {hoveredData.ma55 && visibleMAs.ma55 && (
              <div>
                <span className="text-apple-purple">MA55:</span>{' '}
                <span className="tabular-nums text-zinc-300">{formatPrice(hoveredData.ma55)}</span>
              </div>
            )}
            {hoveredData.ma111 && visibleMAs.ma111 && (
              <div>
                <span className="text-apple-orange">MA111:</span>{' '}
                <span className="tabular-nums text-zinc-300">{formatPrice(hoveredData.ma111)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs flex-wrap overflow-x-auto no-scrollbar py-0.5">
            {candles.length > 0 && (() => {
              const lastC = candles[candles.length - 1];
              const curPrice = liveTicker?.price || lastC.close;
              const curHigh = Math.max(lastC.high, curPrice);
              const curLow = Math.min(lastC.low, curPrice);
              const isUp = curPrice >= lastC.open;
              return (
                <div className="flex items-center gap-3 border-r border-black/[0.08] dark:border-white/[0.08] pr-3 mr-1">
                  <div className="flex items-center gap-1 text-[11px] text-apple-dim">
                    <span className="w-1.5 h-1.5 rounded-full bg-apple-green animate-pulse" />
                    <span>Live Bar:</span>
                  </div>
                  <div>
                    <span className="text-apple-dim">O:</span>{' '}
                    <span className="text-apple-text tabular-nums">{formatPrice(lastC.open)}</span>
                  </div>
                  <div>
                    <span className="text-apple-dim">H:</span>{' '}
                    <span className="text-apple-green tabular-nums">{formatPrice(curHigh)}</span>
                  </div>
                  <div>
                    <span className="text-apple-dim">L:</span>{' '}
                    <span className="text-apple-red tabular-nums">{formatPrice(curLow)}</span>
                  </div>
                  <div>
                    <span className="text-apple-dim">C:</span>{' '}
                    <span className={`tabular-nums font-semibold ${isUp ? 'text-apple-green' : 'text-apple-red'}`}>
                      {formatPrice(curPrice)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {floor?.signal_ticket && (
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-all ${
                floor.signal_ticket.status === 'LIVE_SIGNAL'
                  ? 'bg-apple-green/15 text-apple-green border-apple-green/40 shadow-sm animate-pulse'
                  : 'bg-black/[0.04] dark:bg-white/[0.05] text-apple-text border-black/10 dark:border-white/10'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  floor.signal_ticket.status === 'LIVE_SIGNAL' ? 'bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.8)]' : 'bg-apple-blue shadow-[0_0_6px_rgba(0,113,227,0.6)]'
                }`} />
                <span className="font-semibold text-apple-text">
                  {floor.signal_ticket.status === 'LIVE_SIGNAL' ? 'LIVE POSITION' : 'LIVE ENGINE'}:
                </span>
                <span className="text-apple-muted">
                  {floor.signal_ticket.status === 'LIVE_SIGNAL'
                    ? `${floor.signal_ticket.direction} @ ${formatPrice(floor.signal_ticket.entry_price)}`
                    : `Active Watch (${floor.signal_ticket.direction || 'LONG'}) · Next Trigger: ${formatPrice(floor.signal_ticket.entry_price)} (${floor.signal_ticket.trigger_distance_pct >= 0 ? '+' : ''}${floor.signal_ticket.trigger_distance_pct}%)`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Indicator Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[11px] text-apple-dim">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-apple-green"></span>
            <span>Entry (Buy)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-apple-red"></span>
            <span>Short / Exit</span>
          </div>
          {visibleMAs.ma25 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-[#0A84FF]"></span>
              <span>MA25 (Blue)</span>
            </div>
          )}
          {visibleMAs.ma50 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-amber-400 dark:bg-[#FFD60A]"></span>
              <span>MA50 (Yellow)</span>
            </div>
          )}
          {visibleMAs.ma55 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-apple-purple"></span>
              <span>MA55</span>
            </div>
          )}
          {visibleMAs.ma111 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-0.5 rounded bg-apple-orange"></span>
              <span>MA111</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 rounded bg-apple-cyan"></span>
            <span>Price Levels</span>
          </div>
        </div>
      </div>

      {/* 3. Chart Canvas Viewport with Floating Signal Position HUD */}
      <div 
        ref={chartViewportRef} 
        className="relative w-full rounded-2xl border border-white/[0.08] bg-[#07080A] overflow-hidden"
      >
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/75 backdrop-blur-sm flex items-center justify-center text-xs text-white">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-apple-blue" />
              <span>Loading {timeframe.toUpperCase()} candlestick stream...</span>
            </div>
          </div>
        )}

        {/* Lightweight Charts Canvas Element */}
        <div ref={chartContainerRef} className="w-full" style={{ height: '520px' }} />

        {/* On-Chart Signal Position HUD (Apple-Grade Translucent Inspector) */}
        {showMarkers && activeStrategy && activeTrade && isHudVisible && (
          <div
            ref={hudRef}
            style={
              hudPos.x !== null
                ? { left: `${hudPos.x}px`, top: `${hudPos.y}px` }
                : undefined
            }
            className={`absolute ${
              hudPos.x === null ? 'top-3 right-14 sm:right-16' : ''
            } z-30 pointer-events-auto ${
              isHudExpanded ? 'w-72 sm:w-80' : 'w-auto'
            } ${
              isDraggingHud
                ? 'cursor-grabbing select-none shadow-2xl ring-1 ring-apple-blue/60 transition-none'
                : 'transition-all duration-150'
            }`}
          >
            <div className="bg-white/95 dark:bg-[#0D0E14]/90 backdrop-blur-2xl border border-black/10 dark:border-white/[0.12] rounded-2xl shadow-2xl p-3.5 text-xs text-apple-text select-none transition-colors">
              
              {/* HUD Header Bar (Draggable Handle) */}
              <div
                onPointerDown={handleHudPointerDown}
                onDoubleClick={() => setHudPos({ x: null, y: null })}
                className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-2.5 mb-2.5 cursor-grab active:cursor-grabbing group/header"
                title="Click and drag to move • Double-click to reset position"
              >
                <div className="flex items-center gap-2 pointer-events-none">
                  <GripHorizontal className="w-3.5 h-3.5 text-apple-dim group-hover/header:text-apple-cyan transition-colors" />
                  <span className="w-2 h-2 rounded-full bg-apple-cyan" />
                  <span className="font-semibold text-xs text-apple-text tracking-tight">
                    Signal Inspector
                  </span>
                </div>

                <div 
                  className="flex items-center gap-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* Reset Position Button */}
                  {hudPos.x !== null && (
                    <button
                      onClick={() => setHudPos({ x: null, y: null })}
                      className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-apple-muted hover:text-apple-text rounded-lg border border-black/[0.06] dark:border-white/[0.06] transition-colors"
                      title="Reset position to default top-right"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}

                  {/* Stepper: Previous */}
                  <button
                    onClick={() => {
                      playRetroSound('select');
                      const nextIdx = Math.max(0, focusedTradeIndex - 1);
                      handleJumpToTrade(tradesList[nextIdx], nextIdx);
                    }}
                    disabled={focusedTradeIndex === 0}
                    className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] disabled:opacity-25 text-apple-muted hover:text-apple-text rounded-lg border border-black/[0.06] dark:border-white/[0.06] transition-colors"
                    title="Previous Signal"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Stepper Count */}
                  <span className="text-[11px] text-apple-dim px-1 font-mono tabular-nums">
                    {focusedTradeIndex + 1}/{tradesList.length}
                  </span>

                  {/* Stepper: Next */}
                  <button
                    onClick={() => {
                      playRetroSound('select');
                      const nextIdx = Math.min(tradesList.length - 1, focusedTradeIndex + 1);
                      handleJumpToTrade(tradesList[nextIdx], nextIdx);
                    }}
                    disabled={focusedTradeIndex === tradesList.length - 1}
                    className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] disabled:opacity-25 text-apple-muted hover:text-apple-text rounded-lg border border-black/[0.06] dark:border-white/[0.06] transition-colors"
                    title="Next Signal"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Collapse / Expand Toggle */}
                  <button
                    onClick={() => setIsHudExpanded(!isHudExpanded)}
                    className="p-1 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] text-apple-muted hover:text-apple-text rounded-lg border border-black/[0.06] dark:border-white/[0.06] ml-0.5 transition-colors"
                    title={isHudExpanded ? 'Minimize HUD' : 'Expand HUD'}
                  >
                    {isHudExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* HUD Body (Expanded Mode) */}
              {isHudExpanded ? (
                <div className="space-y-2.5">
                  
                  {/* Signal Title & Net Return */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        (activeTrade.side || activeTrade.type) === 'LONG'
                          ? 'border-apple-green/40 text-apple-green bg-apple-green/15'
                          : 'border-apple-red/40 text-apple-red bg-apple-red/15'
                      }`}>
                        {activeTrade.side || activeTrade.type} #{activeTrade.trade_no}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                        activeTrade.status === 'OPEN' || String(activeTrade.exit_time).includes('RUNNING')
                          ? 'border-apple-green/50 bg-apple-green/20 text-apple-green font-semibold animate-pulse'
                          : 'border-black/[0.08] dark:border-white/[0.08] bg-black/[0.04] dark:bg-white/[0.04] text-apple-muted'
                      }`}>
                        {activeTrade.status === 'OPEN' || String(activeTrade.exit_time).includes('RUNNING') ? 'LIVE RUNNING' : 'CLOSED'}
                      </span>
                      {activeTrade.be_activated && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-apple-orange/20 text-apple-orange border border-apple-orange/40 font-bold">
                          BE LOCKED
                        </span>
                      )}
                    </div>

                    <div className={`text-sm font-semibold font-mono tabular-nums ${
                      (activeTrade.net_return_pct || 0) > 0 ? 'text-apple-green' : 'text-apple-red'
                    }`}>
                      {formatPercent(activeTrade.net_return_pct || 0)}
                    </div>
                  </div>

                  {/* Execution Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-2.5">
                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">Entry Price</div>
                      <div className="font-semibold text-apple-text mt-0.5 font-mono tabular-nums">
                        {formatPrice(activeTrade.entry_price)}
                      </div>
                      <div className="text-[10px] text-apple-muted truncate">
                        {String(activeTrade.entry_time).substring(0, 10)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">
                        {activeTrade.status === 'OPEN' || String(activeTrade.exit_time).includes('RUNNING') ? 'Current Price' : 'Exit Price'}
                      </div>
                      <div className="font-semibold text-apple-text mt-0.5 font-mono tabular-nums">
                        {formatPrice(activeTrade.status === 'OPEN' ? (liveTicker?.price || activeTrade.exit_price) : activeTrade.exit_price)}
                      </div>
                      <div className="text-[10px] text-apple-muted truncate">
                        {activeTrade.status === 'OPEN' || String(activeTrade.exit_time).includes('RUNNING')
                          ? 'Live Position'
                          : String(activeTrade.exit_time).substring(0, 10)}
                      </div>
                    </div>

                    <div className="col-span-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-apple-dim uppercase mr-1.5">Duration:</span>
                        <span className="text-apple-text font-medium">
                          {formatDuration(activeTrade.entry_time, activeTrade.exit_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-apple-dim uppercase mr-1.5">
                          {activeTrade.status === 'OPEN' ? 'Protection:' : 'Exit:'}
                        </span>
                        <span className="text-apple-cyan truncate max-w-[120px] inline-block align-bottom font-medium" title={activeTrade.exit_reason}>
                          {activeTrade.status === 'OPEN' 
                            ? (activeTrade.be_activated ? 'BE Locked (+0.2%)' : 'Trailing Floor')
                            : (activeTrade.exit_reason || 'Structural')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tactical Actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleJumpToTrade(activeTrade, focusedTradeIndex)}
                      className="flex-1 py-1.5 px-3 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Focus Candle</span>
                    </button>
                    <button
                      onClick={() => {
                        const latestIdx = tradesList.length - 1;
                        if (latestIdx >= 0) {
                          handleJumpToTrade(tradesList[latestIdx], latestIdx);
                        }
                        handleScrollToLastBar();
                      }}
                      className="py-1.5 px-3 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] border border-black/[0.08] dark:border-white/[0.08] text-apple-text text-xs font-medium rounded-xl transition-all cursor-pointer flex items-center gap-1"
                      title="Jump to latest bar & position"
                    >
                      <ArrowRight className="w-3 h-3 text-apple-cyan" />
                      <span>Last Bar</span>
                    </button>
                  </div>

                </div>
              ) : (
                /* Minimized Single-line Strip */
                <div className="flex items-center gap-2.5 text-xs">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    (activeTrade.side || activeTrade.type) === 'LONG'
                      ? 'bg-apple-green/15 text-apple-green'
                      : 'bg-apple-red/15 text-apple-red'
                  }`}>
                    #{activeTrade.trade_no}
                  </span>
                  <span className="font-semibold text-apple-text font-mono tabular-nums">
                    {formatPrice(activeTrade.entry_price)}
                  </span>
                  <span className={`font-semibold font-mono tabular-nums ${
                    (activeTrade.net_return_pct || 0) > 0 ? 'text-apple-green' : 'text-apple-red'
                  }`}>
                    {formatPercent(activeTrade.net_return_pct || 0)}
                  </span>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* 4. Interactive Signal Timeline Carousel & Filter Bar (Below Chart) */}
      {activeStrategy && tradesList.length > 0 && (
        <div className="apple-glass-card rounded-2xl p-3 sm:p-4 space-y-3 text-xs">
          
          {/* Timeline Bar Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.08] dark:border-white/[0.08] pb-2.5">
            
            {/* Filter Tabs & Sort Order */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-apple-dim flex items-center gap-1.5 font-medium">
                <Sliders className="w-3.5 h-3.5 text-apple-cyan" />
                Signals ({tradesList.length}):
              </span>
              
              <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] p-0.5 rounded-xl">
                {[
                  { id: 'ALL', label: `All (${tradesList.length})` },
                  { id: 'WINS', label: `Wins (${tradesList.filter((t) => (t.net_return_pct || 0) > 0).length})` },
                  { id: 'LOSSES', label: `Losses (${tradesList.filter((t) => (t.net_return_pct || 0) <= 0).length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      playRetroSound('blip');
                      setTradeFilter(f.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-all cursor-pointer ${
                      tradeFilter === f.id
                        ? 'bg-white dark:bg-white/15 text-apple-text font-medium shadow-sm'
                        : 'text-apple-muted hover:text-apple-text'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort Order Toggle: DESC (Newest First) / ASC (Oldest First) */}
              <button
                onClick={() => {
                  playRetroSound('blip');
                  setSignalSortOrder((prev) => (prev === 'DESC' ? 'ASC' : 'DESC'));
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:scale-[0.98] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-apple-muted hover:text-apple-text cursor-pointer transition-all text-xs"
                title={signalSortOrder === 'DESC' ? 'Currently Newest First (Click to toggle Oldest First)' : 'Currently Oldest First (Click to toggle Newest First)'}
              >
                <ArrowUpDown className="w-3 h-3 text-apple-cyan" />
                <span className="font-medium text-[11px]">{signalSortOrder === 'DESC' ? 'Newest First' : 'Oldest First'}</span>
              </button>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => {
                  playRetroSound('select');
                  const nextIdx = Math.max(0, focusedTradeIndex - 1);
                  handleJumpToTrade(tradesList[nextIdx], nextIdx);
                }}
                disabled={focusedTradeIndex === 0}
                className="px-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] disabled:opacity-30 border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-apple-muted hover:text-apple-text flex items-center gap-1 cursor-pointer transition-all"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="text-apple-dim font-mono tabular-nums">
                Signal #{tradesList[focusedTradeIndex]?.trade_no || 1}
              </span>

              <button
                onClick={() => {
                  playRetroSound('select');
                  const nextIdx = Math.min(tradesList.length - 1, focusedTradeIndex + 1);
                  handleJumpToTrade(tradesList[nextIdx], nextIdx);
                }}
                disabled={focusedTradeIndex === tradesList.length - 1}
                className="px-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.04] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] disabled:opacity-30 border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-apple-muted hover:text-apple-text flex items-center gap-1 cursor-pointer transition-all"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>

          {/* Scrollable Trade Chips Strip */}
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            {filteredTrades.map((tr) => {
              const actualIdx = tradesList.findIndex((t) => t.trade_no === tr.trade_no);
              const isWin = (tr.net_return_pct || 0) > 0;
              const isCurrent = focusedTradeIndex === actualIdx;
              const isRunning = tr.status === 'OPEN' || tr.is_active || String(tr.exit_time).includes('RUNNING');
              const side = tr.side || tr.type || activeStrategy.type;
              const isLong = side === 'LONG';

              return (
                <button
                  key={tr.trade_no}
                  onClick={() => handleJumpToTrade(tr, actualIdx)}
                  className={`px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
                    isCurrent
                      ? (isRunning
                          ? 'bg-apple-green/25 text-apple-text border-apple-green shadow-lg ring-2 ring-apple-green/60 font-semibold scale-[1.03] z-10 animate-pulse'
                          : 'bg-black/10 dark:bg-white/15 text-apple-text border-black/20 dark:border-white/30 shadow-md font-semibold ring-1 ring-apple-blue/50 scale-[1.03] z-10')
                      : isRunning
                      ? 'bg-apple-green/15 text-apple-green border-apple-green/50 shadow-sm font-semibold animate-pulse'
                      : isWin
                      ? 'bg-apple-green/5 text-apple-green border-apple-green/20 hover:border-apple-green/50 hover:bg-apple-green/10'
                      : 'bg-apple-red/5 text-apple-red border-apple-red/20 hover:border-apple-red/50 hover:bg-apple-red/10'
                  }`}
                  title={`Trade #${tr.trade_no}: ${side} @ $${tr.entry_price?.toLocaleString()} -> ${isRunning ? 'RUNNING' : formatPercent(tr.net_return_pct || 0)}`}
                >
                  {isRunning ? (
                    <span className="w-2 h-2 rounded-full bg-apple-green animate-ping" />
                  ) : (
                    <span className="opacity-70 font-sans">{isLong ? '▲' : '▼'}</span>
                  )}
                  <span className="font-mono">{isRunning ? `ACTIVE #${tr.trade_no}` : `#${tr.trade_no}`}</span>
                  <span className="font-semibold font-mono tabular-nums">{formatPercent(tr.net_return_pct || 0)}</span>
                </button>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}

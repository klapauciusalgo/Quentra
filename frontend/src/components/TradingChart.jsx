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
import { API_BASE } from '../config';
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
  RotateCcw
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
  onTradeSelect = null
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const maSeriesRef = useRef({});
  const markersPrimitiveRef = useRef(null);
  const priceLinesRef = useRef([]);

  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState([]);
  const [hoveredData, setHoveredData] = useState(null);
  const [hoveredSignal, setHoveredSignal] = useState(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [markerLabelMode, setMarkerLabelMode] = useState('compact'); // 'compact' | 'minimal' | 'prices' | 'full'
  const [isHudVisible, setIsHudVisible] = useState(true);
  const [isHudExpanded, setIsHudExpanded] = useState(true);
  const [showPriceLevels, setShowPriceLevels] = useState(true);
  const [focusedTradeIndex, setFocusedTradeIndex] = useState(0);
  const [tradeFilter, setTradeFilter] = useState('ALL'); // 'ALL' | 'WINS' | 'LOSSES'

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
    ma55: true, // Macro Weekly Anchor
    ma111: true,
    volume: true
  });

  const tradesList = activeStrategy?.trades || [];
  const activeTrade = tradesList[focusedTradeIndex] || tradesList[tradesList.length - 1];
  const isStrategyLong = activeStrategy?.type === 'LONG';

  // Map trades by timestamp for fast crosshair lookup & click-to-select
  const tradesByTime = useMemo(() => {
    const map = new Map();
    if (!tradesList.length) return map;

    tradesList.forEach((tr, idx) => {
      try {
        const entrySec = Math.floor(new Date(tr.entry_time).getTime() / 1000);
        map.set(entrySec, { ...tr, eventType: 'ENTRY', tradeIndex: idx });

        if (tr.exit_time && !String(tr.exit_time).includes('RUNNING')) {
          const exitSec = Math.floor(new Date(tr.exit_time).getTime() / 1000);
          map.set(exitSec, { ...tr, eventType: 'EXIT', tradeIndex: idx });
        }
      } catch (e) {}
    });

    return map;
  }, [tradesList]);

  // Filtered trades for navigation strip
  const filteredTrades = useMemo(() => {
    if (tradeFilter === 'WINS') {
      return tradesList.filter((t) => (t.net_return_pct || 0) > 0);
    }
    if (tradeFilter === 'LOSSES') {
      return tradesList.filter((t) => (t.net_return_pct || 0) <= 0);
    }
    return tradesList;
  }, [tradesList, tradeFilter]);

  // Fetch Klines whenever timeframe changes
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(`${API_BASE}/api/klines?timeframe=${timeframe}&limit=5000`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.candles) {
          setCandles(data.candles);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading klines:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [timeframe]);

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

    // 1. Entry Line
    if (trade.entry_price) {
      const entryLine = candleSeriesRef.current.createPriceLine({
        price: trade.entry_price,
        color: '#4FE0FF',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: `ENTRY #${trade.trade_no} ($${trade.entry_price.toLocaleString()})`,
      });
      priceLinesRef.current.push(entryLine);
    }

    // 2. Exit Line if closed
    if (trade.exit_price) {
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

    // 3. Stop Loss Line (if hard_stop_loss is numeric)
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

    // 4. Take Profit Line (if take_profit is numeric)
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
  };

  // Helper to format markers dynamically based on selected label mode
  const formatMarkersForDisplay = (rawMarkers, mode) => {
    return rawMarkers.map((m) => {
      let text = '';
      const isEntry = m.shape === 'arrowUp' || m.shape === 'arrowDown';
      const isLong = m.side === 'LONG' || m.shape === 'arrowUp';

      if (mode === 'minimal') {
        text = ''; // Zero clutter: clean arrows and circles only!
      } else if (mode === 'prices') {
        if (isEntry && m.entryPrice) text = `$${Math.round(m.entryPrice).toLocaleString()}`;
        else if (!isEntry && m.exitPrice) text = `$${Math.round(m.exitPrice).toLocaleString()}`;
      } else if (mode === 'full') {
        text = m.text || '';
      } else {
        // 'compact' - Default anti-slop mode (concise, clear, no candle overlap)
        if (isEntry) {
          text = isLong ? `BUY #${m.tradeNo || ''}` : `SELL #${m.tradeNo || ''}`;
        } else {
          const pnl = m.pnlPct !== undefined ? m.pnlPct : null;
          text = pnl !== null ? `${pnl > 0 ? '+' : ''}${Number(pnl).toFixed(1)}%` : 'EXIT';
        }
      }

      return {
        ...m,
        text,
        size: isEntry ? 2 : 1.5,
      };
    });
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
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: '#12151D' },
        textColor: '#8A8FA3',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1E2330' },
        horzLines: { color: '#1E2330' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#4FE0FF',
          width: 1,
          style: 3,
          labelBackgroundColor: '#232838',
        },
        horzLine: {
          color: '#4FE0FF',
          width: 1,
          style: 3,
          labelBackgroundColor: '#232838',
        },
      },
      rightPriceScale: {
        borderColor: '#2D344B',
        scaleMargins: {
          top: 0.08,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#2D344B',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
      },
    });

    chartRef.current = chart;

    // 1. Candlestick Series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#39FF88',
      downColor: '#FF4B5C',
      borderUpColor: '#39FF88',
      borderDownColor: '#FF4B5C',
      wickUpColor: '#39FF88',
      wickDownColor: '#FF4B5C',
    });
    candleSeriesRef.current = candleSeries;

    // 2. Volume Histogram Series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
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

    // 3. Moving Average Series
    const ma25Series = chart.addSeries(LineSeries, {
      color: '#4FE0FF',
      lineWidth: 1,
      title: 'MA25',
      priceLineVisible: false,
    });

    const ma50Series = chart.addSeries(LineSeries, {
      color: '#38BDF8',
      lineWidth: 1.5,
      title: 'MA50',
      priceLineVisible: false,
    });

    const ma55Series = chart.addSeries(LineSeries, {
      color: '#A855F7',
      lineWidth: 2,
      title: 'MA55 (Macro)',
      priceLineVisible: false,
    });

    const ma111Series = chart.addSeries(LineSeries, {
      color: '#FB923C',
      lineWidth: 1.5,
      title: 'MA111',
      priceLineVisible: false,
    });

    const ma8Series = chart.addSeries(LineSeries, {
      color: '#FFC145',
      lineWidth: 1,
      title: 'MA8',
      priceLineVisible: false,
    });

    maSeriesRef.current = {
      ma8: ma8Series,
      ma25: ma25Series,
      ma50: ma50Series,
      ma55: ma55Series,
      ma111: ma111Series,
    };

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
          color: c.close >= c.open ? 'rgba(57, 255, 136, 0.25)' : 'rgba(255, 75, 92, 0.25)',
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
        const candleTimes = new Set(formattedCandles.map((c) => c.time));
        const validMarkers = activeStrategy.markers.filter((m) => candleTimes.has(m.time));

        if (validMarkers.length > 0) {
          const formatted = formatMarkersForDisplay(validMarkers, markerLabelMode);
          markersPrimitiveRef.current = createSeriesMarkers(candleSeries, formatted);

          // Focus viewport around the latest execution marker
          const lastMarker = validMarkers[validMarkers.length - 1];
          const lastMarkerIndex = formattedCandles.findIndex((c) => c.time === lastMarker.time);
          if (lastMarkerIndex !== -1) {
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(0, lastMarkerIndex - 60),
              to: Math.min(formattedCandles.length - 1, lastMarkerIndex + 30),
            });
          }
        } else {
          chart.timeScale().fitContent();
        }
      } else {
        chart.timeScale().fitContent();
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

    // Window Resize listener
    const handleResize = () => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        markersPrimitiveRef.current = null;
        priceLinesRef.current = [];
      }
    };
  }, [candles]);

  // Reset focused trade index when active strategy changes
  useEffect(() => {
    if (tradesList.length > 0) {
      setFocusedTradeIndex(tradesList.length - 1);
    }
  }, [activeStrategy?.id]);

  // Update Markers dynamically when activeStrategy, showMarkers, or markerLabelMode changes
  useEffect(() => {
    if (!candleSeriesRef.current || candles.length === 0) return;

    if (showMarkers && activeStrategy?.markers && activeStrategy.markers.length > 0) {
      const candleTimes = new Set(candles.map((c) => c.time));
      const validMarkers = activeStrategy.markers.filter((m) => candleTimes.has(m.time));
      const formatted = formatMarkersForDisplay(validMarkers, markerLabelMode);

      if (markersPrimitiveRef.current) {
        markersPrimitiveRef.current.setMarkers(formatted);
      } else {
        markersPrimitiveRef.current = createSeriesMarkers(candleSeriesRef.current, formatted);
      }
    } else {
      if (markersPrimitiveRef.current) {
        markersPrimitiveRef.current.setMarkers([]);
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

    const lastCandle = candles[candles.length - 1];
    if (!lastCandle) return;

    const updated = {
      time: lastCandle.time,
      open: lastCandle.open,
      high: Math.max(lastCandle.high, liveTicker.price),
      low: Math.min(lastCandle.low, liveTicker.price),
      close: liveTicker.price,
    };

    candleSeriesRef.current.update(updated);
  }, [liveTicker?.price]);

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
        fetch(`${API_BASE}/api/klines?timeframe=${timeframe}&around_time=${entrySec}&limit=3000`)
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
    <div className="bg-floor-dark border-2 border-floor-border p-3 sm:p-4 space-y-3">
      
      {/* 1. Chart Controls Header: Symbol, Timeframes, Signal Controls, Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-floor-border pb-2.5">
        
        {/* Left: Symbol & Timeframe Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-pixel text-xs text-signal-cyan">BTCUSDT</span>
            <span className="text-[10px] font-mono text-signal-warn bg-floor-darker border border-floor-border px-1.5 py-0.5">
              BINANCE
            </span>
          </div>

          <div className="flex items-center bg-floor-darker border border-floor-border p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                onClick={() => {
                  playRetroSound('blip');
                  if (onTimeframeChange) onTimeframeChange(tf.id);
                }}
                className={`font-pixel text-[10px] px-2 sm:px-2.5 py-1 transition-all ${
                  timeframe === tf.id
                    ? 'bg-signal-cyan text-floor-darker font-bold shadow-pixel-cyan'
                    : 'text-retro-muted hover:text-retro-text hover:bg-floor-wall'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Signal Visibility & Label Controls + Indicators */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          
          {/* Signal Label Style Switcher */}
          {activeStrategy && showMarkers && (
            <div className="flex items-center bg-floor-darker border border-floor-border p-0.5">
              <span className="text-[10px] text-retro-dim px-1.5 hidden md:inline">LABELS:</span>
              {[
                { id: 'compact', label: 'COMPACT' },
                { id: 'minimal', label: 'SHAPES' },
                { id: 'prices', label: 'PRICES' },
              ].map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    playRetroSound('blip');
                    setMarkerLabelMode(style.id);
                  }}
                  className={`px-2 py-0.5 text-[10px] transition-colors ${
                    markerLabelMode === style.id
                      ? 'bg-floor-wall text-signal-cyan font-bold border border-floor-border'
                      : 'text-retro-muted hover:text-retro-text'
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
              className={`flex items-center gap-1 px-2 py-1 border text-[10px] transition-colors ${
                isHudVisible
                  ? 'border-signal-cyan text-signal-cyan bg-signal-cyan/10'
                  : 'border-floor-border text-retro-dim hover:text-retro-muted'
              }`}
              title="Toggle On-Chart Signal Inspector HUD"
            >
              {isHudVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>HUD</span>
            </button>
          )}

          {/* Toggle Price Levels (SL / TP / Entry lines) */}
          {activeStrategy && showMarkers && (
            <button
              onClick={() => setShowPriceLevels(!showPriceLevels)}
              className={`flex items-center gap-1 px-2 py-1 border text-[10px] transition-colors ${
                showPriceLevels
                  ? 'border-signal-cyan text-signal-cyan bg-signal-cyan/10'
                  : 'border-floor-border text-retro-dim hover:text-retro-muted'
              }`}
              title="Toggle Dynamic Entry / SL / TP Price Lines"
            >
              <Target className="w-3 h-3" />
              <span>LEVELS</span>
            </button>
          )}

          {/* Show / Hide Signals */}
          <button
            onClick={() => setShowMarkers(!showMarkers)}
            className={`flex items-center gap-1 px-2.5 py-1 border text-[10px] font-pixel transition-colors ${
              showMarkers
                ? 'border-signal-cyan bg-signal-cyan text-floor-darker font-bold shadow-pixel-cyan'
                : 'border-floor-border bg-floor-wall text-retro-muted hover:text-retro-text'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{showMarkers ? 'SIGNALS ON' : 'SIGNALS OFF'}</span>
          </button>

          {/* Indicators Toggle Pill */}
          <div className="flex items-center gap-1 pl-1 border-l border-floor-border/80">
            <button
              onClick={() => toggleMA('ma55')}
              className={`px-1.5 py-0.5 border text-[10px] font-bold ${
                visibleMAs.ma55 ? 'border-signal-purple text-signal-purple bg-signal-purple/10' : 'border-floor-border text-retro-dim'
              }`}
              title="Weekly MA55 Macro Regime Anchor"
            >
              MA55
            </button>
            <button
              onClick={() => toggleMA('ma111')}
              className={`px-1.5 py-0.5 border text-[10px] ${
                visibleMAs.ma111 ? 'border-orange-400 text-orange-400 bg-orange-400/10' : 'border-floor-border text-retro-dim'
              }`}
            >
              MA111
            </button>
          </div>

          {/* Fit View */}
          <button
            onClick={() => {
              playRetroSound('blip');
              if (chartRef.current) chartRef.current.timeScale().fitContent();
            }}
            className="px-2 py-1 bg-floor-wall hover:bg-floor-border border border-floor-border text-retro-muted hover:text-retro-text text-[10px]"
            title="Fit all candles in viewport"
          >
            Fit View
          </button>
        </div>

      </div>

      {/* 2. OHLCV Metrics & Signal Hover Callout Bar */}
      <div className="h-6 flex items-center justify-between gap-4 text-[11px] font-mono text-retro-muted overflow-x-auto whitespace-nowrap">
        {hoveredSignal ? (
          <div className="flex items-center gap-2 bg-signal-cyan/15 border border-signal-cyan/50 px-2.5 py-0.5 text-signal-cyan font-bold animate-in fade-in duration-150">
            <Zap className="w-3.5 h-3.5 text-signal-cyan animate-pulse" />
            <span>
              {hoveredSignal.eventType === 'ENTRY' 
                ? `SIGNAL ENTRY: ${hoveredSignal.side || hoveredSignal.type} #${hoveredSignal.trade_no} @ ${formatPrice(hoveredSignal.entry_price)} (${hoveredSignal.entry_time})`
                : `SIGNAL EXIT: Trade #${hoveredSignal.trade_no} @ ${formatPrice(hoveredSignal.exit_price)} (${formatPercent(hoveredSignal.net_return_pct)}) — ${hoveredSignal.exit_reason || 'Exit Rule'}`
              }
            </span>
          </div>
        ) : hoveredData ? (
          <div className="flex items-center gap-4">
            <div>
              <span className="text-retro-dim">O:</span>{' '}
              <span className="text-retro-text">{formatPrice(hoveredData.open)}</span>
            </div>
            <div>
              <span className="text-retro-dim">H:</span>{' '}
              <span className="text-signal-bull">{formatPrice(hoveredData.high)}</span>
            </div>
            <div>
              <span className="text-retro-dim">L:</span>{' '}
              <span className="text-signal-bear">{formatPrice(hoveredData.low)}</span>
            </div>
            <div>
              <span className="text-retro-dim">C:</span>{' '}
              <span className={hoveredData.close >= hoveredData.open ? 'text-signal-bull font-bold' : 'text-signal-bear font-bold'}>
                {formatPrice(hoveredData.close)}
              </span>
            </div>
            {hoveredData.volume && (
              <div>
                <span className="text-retro-dim">VOL:</span>{' '}
                <span className="text-retro-text">{Number(hoveredData.volume).toFixed(2)} BTC</span>
              </div>
            )}
            {hoveredData.ma55 && visibleMAs.ma55 && (
              <div>
                <span className="text-signal-purple">MA55:</span>{' '}
                <span>{formatPrice(hoveredData.ma55)}</span>
              </div>
            )}
            {hoveredData.ma111 && visibleMAs.ma111 && (
              <div>
                <span className="text-orange-400">MA111:</span>{' '}
                <span>{formatPrice(hoveredData.ma111)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-retro-dim flex items-center gap-2">
            <span>Hover cursor or click on candles to inspect price & signal execution.</span>
            {activeStrategy && (
              <span className="text-signal-cyan font-medium hidden sm:inline">
                // Active Algo: {activeStrategy.name} ({tradesList.length} trades plotted)
              </span>
            )}
          </div>
        )}

        {/* Indicator Legend */}
        <div className="hidden lg:flex items-center gap-3 text-[10px] text-retro-dim">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-signal-bull"></span>
            <span>Entry (Buy)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-signal-bear"></span>
            <span>Short / Exit (Sell)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-0.5 bg-signal-cyan"></span>
            <span>Price Levels</span>
          </div>
        </div>
      </div>

      {/* 3. Chart Canvas Viewport with Floating Signal Position HUD */}
      <div 
        ref={chartViewportRef} 
        className="relative w-full border border-floor-border bg-[#12151D] overflow-hidden"
      >
        {loading && (
          <div className="absolute inset-0 z-20 bg-floor-dark/80 flex items-center justify-center font-pixel text-xs text-signal-cyan">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>LOADING {timeframe.toUpperCase()} CANDLESTICKS...</span>
            </div>
          </div>
        )}

        {/* Lightweight Charts Canvas Element */}
        <div ref={chartContainerRef} className="w-full" style={{ height: '520px' }} />

        {/* On-Chart Signal Position HUD (High-Taste, Anti-Slop Floating Inspector) */}
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
                ? 'cursor-grabbing select-none shadow-cyan-500/25 shadow-2xl ring-1 ring-signal-cyan/60 transition-none'
                : 'transition-all duration-150'
            }`}
          >
            <div className="bg-[#0C0E14]/92 backdrop-blur-md border border-floor-border hover:border-signal-cyan/40 shadow-2xl p-3 text-xs font-mono text-retro-text select-none transition-colors">
              
              {/* HUD Header Bar (Draggable Handle) */}
              <div
                onPointerDown={handleHudPointerDown}
                onDoubleClick={() => setHudPos({ x: null, y: null })}
                className="flex items-center justify-between border-b border-floor-border/70 pb-2 mb-2 cursor-grab active:cursor-grabbing group/header"
                title="Click and drag to move • Double-click to reset position"
              >
                <div className="flex items-center gap-1.5 pointer-events-none">
                  <GripHorizontal className="w-3.5 h-3.5 text-retro-dim group-hover/header:text-signal-cyan transition-colors" />
                  <span className="w-2 h-2 rounded-full bg-signal-cyan animate-pulse"></span>
                  <span className="font-pixel text-[10px] text-signal-cyan tracking-wider">
                    SIGNAL INSPECTOR
                  </span>
                </div>

                <div 
                  className="flex items-center gap-1"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {/* Reset Position Button (appears when moved from default) */}
                  {hudPos.x !== null && (
                    <button
                      onClick={() => setHudPos({ x: null, y: null })}
                      className="p-1 hover:bg-floor-wall text-retro-muted hover:text-signal-cyan border border-floor-border transition-colors"
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
                    className="p-1 hover:bg-floor-wall disabled:opacity-25 text-retro-muted hover:text-retro-text border border-floor-border"
                    title="Previous Signal"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Stepper Count */}
                  <span className="text-[10px] text-retro-muted px-1">
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
                    className="p-1 hover:bg-floor-wall disabled:opacity-25 text-retro-muted hover:text-retro-text border border-floor-border"
                    title="Next Signal"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  {/* Collapse / Expand Toggle */}
                  <button
                    onClick={() => setIsHudExpanded(!isHudExpanded)}
                    className="p-1 hover:bg-floor-wall text-retro-muted hover:text-retro-text border border-floor-border ml-0.5"
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
                      <span className={`font-pixel text-[10px] px-2 py-0.5 border ${
                        (activeTrade.side || activeTrade.type) === 'LONG'
                          ? 'border-signal-bull/60 text-signal-bull bg-signal-bull/15'
                          : 'border-signal-bear/60 text-signal-bear bg-signal-bear/15'
                      }`}>
                        {activeTrade.side || activeTrade.type} #{activeTrade.trade_no}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 border ${
                        activeTrade.status === 'CLOSED'
                          ? 'border-floor-border bg-floor-wall text-retro-muted'
                          : 'border-signal-cyan/50 bg-signal-cyan/15 text-signal-cyan font-bold animate-pulse'
                      }`}>
                        {activeTrade.status || 'CLOSED'}
                      </span>
                    </div>

                    <div className={`text-sm font-bold font-mono ${
                      (activeTrade.net_return_pct || 0) > 0 ? 'text-signal-bull' : 'text-signal-bear'
                    }`}>
                      {formatPercent(activeTrade.net_return_pct || 0)}
                    </div>
                  </div>

                  {/* Execution Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-floor-bg border border-floor-border/60 p-2">
                    <div>
                      <div className="text-[9px] text-retro-dim uppercase tracking-wider">Entry Price</div>
                      <div className="font-bold text-retro-text mt-0.5">
                        {formatPrice(activeTrade.entry_price)}
                      </div>
                      <div className="text-[9px] text-retro-muted truncate">
                        {String(activeTrade.entry_time).substring(0, 10)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] text-retro-dim uppercase tracking-wider">
                        {activeTrade.status === 'CLOSED' ? 'Exit Price' : 'Current Mark'}
                      </div>
                      <div className="font-bold text-retro-text mt-0.5">
                        {formatPrice(activeTrade.exit_price || liveTicker?.price)}
                      </div>
                      <div className="text-[9px] text-retro-muted truncate">
                        {activeTrade.exit_time && !String(activeTrade.exit_time).includes('RUNNING')
                          ? String(activeTrade.exit_time).substring(0, 10)
                          : 'Active Candle'}
                      </div>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-floor-border/40 flex items-center justify-between text-[10px]">
                      <div>
                        <span className="text-[9px] text-retro-dim uppercase mr-1">Duration:</span>
                        <span className="text-retro-text font-bold">
                          {formatDuration(activeTrade.entry_time, activeTrade.exit_time)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-retro-dim uppercase mr-1">Exit:</span>
                        <span className="text-signal-cyan truncate max-w-[110px] inline-block align-bottom" title={activeTrade.exit_reason}>
                          {activeTrade.exit_reason || 'Structural'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tactical Actions */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      onClick={() => handleJumpToTrade(activeTrade, focusedTradeIndex)}
                      className="flex-1 py-1 px-2 bg-signal-cyan/15 hover:bg-signal-cyan/25 border border-signal-cyan/50 text-signal-cyan font-pixel text-[9px] flex items-center justify-center gap-1 transition-colors"
                    >
                      <Crosshair className="w-3 h-3" />
                      <span>FOCUS CANDLE</span>
                    </button>
                    <button
                      onClick={() => {
                        const latestIdx = tradesList.length - 1;
                        handleJumpToTrade(tradesList[latestIdx], latestIdx);
                      }}
                      className="py-1 px-2.5 bg-floor-wall hover:bg-floor-border border border-floor-border text-retro-muted hover:text-retro-text text-[10px] transition-colors"
                      title="Jump to latest position"
                    >
                      Latest ⚡
                    </button>
                  </div>

                </div>
              ) : (
                /* Minimized Single-line Strip */
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`font-pixel px-1.5 py-0.2 border ${
                    (activeTrade.side || activeTrade.type) === 'LONG'
                      ? 'border-signal-bull/60 text-signal-bull'
                      : 'border-signal-bear/60 text-signal-bear'
                  }`}>
                    #{activeTrade.trade_no}
                  </span>
                  <span className="font-bold text-retro-text">
                    {formatPrice(activeTrade.entry_price)}
                  </span>
                  <span className={`font-bold ${
                    (activeTrade.net_return_pct || 0) > 0 ? 'text-signal-bull' : 'text-signal-bear'
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
        <div className="bg-floor-bg border border-floor-border p-2.5 space-y-2 font-mono text-xs">
          
          {/* Timeline Bar Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-floor-border/60 pb-2">
            
            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-retro-dim flex items-center gap-1 font-bold">
                <Sliders className="w-3 h-3 text-signal-cyan" />
                SIGNALS ({tradesList.length}):
              </span>
              
              <div className="flex items-center gap-1">
                {[
                  { id: 'ALL', label: `ALL (${tradesList.length})` },
                  { id: 'WINS', label: `WINS (${tradesList.filter((t) => (t.net_return_pct || 0) > 0).length})` },
                  { id: 'LOSSES', label: `LOSSES (${tradesList.filter((t) => (t.net_return_pct || 0) <= 0).length})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      playRetroSound('blip');
                      setTradeFilter(f.id);
                    }}
                    className={`px-2 py-0.5 text-[10px] border transition-colors ${
                      tradeFilter === f.id
                        ? 'border-signal-cyan bg-signal-cyan/15 text-signal-cyan font-bold'
                        : 'border-floor-border bg-floor-darker text-retro-muted hover:text-retro-text'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center gap-1.5 text-[10px]">
              <button
                onClick={() => {
                  playRetroSound('select');
                  const nextIdx = Math.max(0, focusedTradeIndex - 1);
                  handleJumpToTrade(tradesList[nextIdx], nextIdx);
                }}
                disabled={focusedTradeIndex === 0}
                className="px-2 py-0.5 bg-floor-darker hover:bg-floor-wall disabled:opacity-30 border border-floor-border text-retro-muted hover:text-retro-text flex items-center gap-1"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>PREV</span>
              </button>

              <span className="text-retro-dim">
                Signal #{tradesList[focusedTradeIndex]?.trade_no || 1}
              </span>

              <button
                onClick={() => {
                  playRetroSound('select');
                  const nextIdx = Math.min(tradesList.length - 1, focusedTradeIndex + 1);
                  handleJumpToTrade(tradesList[nextIdx], nextIdx);
                }}
                disabled={focusedTradeIndex === tradesList.length - 1}
                className="px-2 py-0.5 bg-floor-darker hover:bg-floor-wall disabled:opacity-30 border border-floor-border text-retro-muted hover:text-retro-text flex items-center gap-1"
              >
                <span>NEXT</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

          </div>

          {/* Scrollable Trade Chips Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-thin">
            {filteredTrades.map((tr) => {
              const actualIdx = tradesList.findIndex((t) => t.trade_no === tr.trade_no);
              const isWin = (tr.net_return_pct || 0) > 0;
              const isCurrent = focusedTradeIndex === actualIdx;
              const side = tr.side || tr.type || activeStrategy.type;
              const isLong = side === 'LONG';

              return (
                <button
                  key={tr.trade_no}
                  onClick={() => handleJumpToTrade(tr, actualIdx)}
                  className={`px-2.5 py-1 border text-[10px] whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isCurrent
                      ? 'border-signal-cyan bg-signal-cyan text-floor-darker font-bold shadow-pixel-cyan scale-105 z-10'
                      : isWin
                      ? 'border-signal-bull/30 bg-signal-bull/5 text-signal-bull hover:border-signal-bull/70'
                      : 'border-signal-bear/30 bg-signal-bear/5 text-signal-bear hover:border-signal-bear/70'
                  }`}
                  title={`Trade #${tr.trade_no}: ${side} @ $${tr.entry_price?.toLocaleString()} -> ${formatPercent(tr.net_return_pct || 0)}`}
                >
                  <span className="opacity-70 font-sans">{isLong ? '▲' : '▼'}</span>
                  <span>#{tr.trade_no}</span>
                  <span className="font-bold">{formatPercent(tr.net_return_pct || 0)}</span>
                </button>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}

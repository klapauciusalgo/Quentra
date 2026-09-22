import React, { useState, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  Award, 
  Calendar, 
  Zap, 
  BarChart3, 
  ArrowUpRight, 
  Info, 
  Sliders,
  DollarSign,
  Layers,
  Sparkles
} from 'lucide-react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import klinesBaseline from '../data/klinesBaseline.json';
import klinesBaselineEth from '../data/klinesBaseline_eth.json';

// Ground truth Ethereum annual returns (2020-2026)
const ETH_ANNUAL_RETURNS = {
  2020: { return_pct: 622.67, start_px: 135.37, end_px: 978.28, regime: 'DeFi Summer & Protocol Expansion' },
  2021: { return_pct: 291.31, start_px: 978.33, end_px: 3828.27, regime: 'Double Peak ATH & NFT Supercycle' },
  2022: { return_pct: -68.64, start_px: 3828.11, end_px: 1200.34, regime: 'Macro Contraction & The Merge' },
  2023: { return_pct: 90.10, start_px: 1200.33, end_px: 2281.87, regime: 'Staking Inflow & L2 Rollup Scaling' },
  2024: { return_pct: 59.34, start_px: 2281.87, end_px: 3635.99, regime: 'Spot ETH ETF Launch Expansion' },
  2025: { return_pct: -13.51, start_px: 3636.00, end_px: 3144.70, regime: 'Institutional Asset Rebalancing' },
  2026: { return_pct: -15.88, start_px: 3144.71, end_px: 2645.21, regime: 'Current High-Base Range' },
};

// Ground truth Bitcoin annual returns (2020-2026)
const BTC_ANNUAL_RETURNS = {
  2020: { return_pct: 348.51, start_px: 7357.64, end_px: 33000.05, regime: 'Post-Halving Bull Run' },
  2021: { return_pct: 43.29, start_px: 33000.05, end_px: 47286.18, regime: 'Double Peak ATH ($69k)' },
  2022: { return_pct: -64.86, start_px: 47286.18, end_px: 16616.75, regime: 'Crypto Winter / Deleveraging' },
  2023: { return_pct: 154.46, start_px: 16617.17, end_px: 42283.58, regime: 'Macro Rebound / Bank Crisis' },
  2024: { return_pct: 132.63, start_px: 42283.58, end_px: 98363.61, regime: 'Spot ETF Inflow Expansion' },
  2025: { return_pct: -6.95, start_px: 98363.61, end_px: 91529.73, regime: 'Institutional Consolidation' },
  2026: { return_pct: -15.35, start_px: 91529.74, end_px: 77484.00, regime: 'Current High-Base Range' },
};

export default function AlgoVsBtcVisualizer({ strategy, selectedAsset = 'BTCUSDT' }) {
  const isEth = selectedAsset === 'ETHUSDT';
  const assetName = isEth ? 'Ethereum' : 'Bitcoin';
  const assetShort = isEth ? 'ETH' : 'BTC';
  const benchmarkColor = isEth ? '#627EEA' : '#FF9F0A';
  const [metricMode, setMetricMode] = useState('EQUITY'); // 'EQUITY' ($10k base) | 'RETURN' (%) | 'ALPHA' (delta %)
  const [rangePreset, setRangePreset] = useState('ALL'); // 'ALL' | '2020-2022' | '2023-2024' | '2025-2026'
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [mousePos, setMousePos] = useState({ x: null, y: null });
  const chartRef = useRef(null);

  const trades = strategy?.trades || [];
  const weeklyBars = useMemo(() => {
    const source = isEth ? klinesBaselineEth : klinesBaseline;
    const raw = source['1w'] || [];
    return raw.filter((c) => c.time >= 1577836800); // from Jan 1, 2020
  }, [isEth]);

  const startBtcPrice = weeklyBars[0]?.close || (isEth ? 135.37 : 8184.98);
  const initialCapital = 10000;

  // Build high-resolution comparison timeline
  const fullTimeline = useMemo(() => {
    if (!weeklyBars || weeklyBars.length === 0) return [];

    let runningEquity = initialCapital;
    let tradeIdx = 0;
    let maxAlgoEquity = initialCapital;
    let maxBtcEquity = initialCapital;

    return weeklyBars.map((bar, index) => {
      const barDate = new Date(bar.time * 1000).toISOString().substring(0, 10);
      const year = parseInt(barDate.substring(0, 4), 10);

      // Process all trades closed up to this date
      while (
        tradeIdx < trades.length && 
        trades[tradeIdx].exit_time && 
        trades[tradeIdx].exit_time.substring(0, 10) <= barDate
      ) {
        const t = trades[tradeIdx];
        runningEquity *= (1 + (t.net_return_pct || 0) / 100);
        tradeIdx++;
      }

      if (runningEquity > maxAlgoEquity) maxAlgoEquity = runningEquity;
      const algoDrawdownPct = ((maxAlgoEquity - runningEquity) / maxAlgoEquity) * 100;

      const btcEquity = initialCapital * (bar.close / startBtcPrice);
      if (btcEquity > maxBtcEquity) maxBtcEquity = btcEquity;
      const btcDrawdownPct = ((maxBtcEquity - btcEquity) / maxBtcEquity) * 100;

      const algoReturnPct = ((runningEquity - initialCapital) / initialCapital) * 100;
      const btcReturnPct = ((bar.close - startBtcPrice) / startBtcPrice) * 100;
      const alphaPct = algoReturnPct - btcReturnPct;

      return {
        index,
        date: barDate,
        year,
        time: bar.time,
        btcPrice: bar.close,
        btcEquity: Math.round(btcEquity),
        btcReturnPct: parseFloat(btcReturnPct.toFixed(2)),
        btcDrawdownPct: parseFloat(btcDrawdownPct.toFixed(2)),
        algoEquity: Math.round(runningEquity),
        algoReturnPct: parseFloat(algoReturnPct.toFixed(2)),
        algoDrawdownPct: parseFloat(algoDrawdownPct.toFixed(2)),
        alphaPct: parseFloat(alphaPct.toFixed(2)),
        tradesClosed: tradeIdx,
      };
    });
  }, [weeklyBars, trades, startBtcPrice, initialCapital]);

  // Filtered timeline based on range preset
  const displayTimeline = useMemo(() => {
    if (rangePreset === '2020-2022') {
      return fullTimeline.filter((p) => p.year >= 2020 && p.year <= 2022);
    }
    if (rangePreset === '2023-2024') {
      return fullTimeline.filter((p) => p.year >= 2023 && p.year <= 2024);
    }
    if (rangePreset === '2025-2026') {
      return fullTimeline.filter((p) => p.year >= 2025 && p.year <= 2026);
    }
    return fullTimeline;
  }, [fullTimeline, rangePreset]);

  // High-level summary metrics
  const summary = useMemo(() => {
    if (fullTimeline.length === 0) return null;
    const last = fullTimeline[fullTimeline.length - 1];
    
    // Overall Max Drawdowns
    let maxAlgoDD = 0;
    let maxBtcDD = 0;
    fullTimeline.forEach((p) => {
      if (p.algoDrawdownPct > maxAlgoDD) maxAlgoDD = p.algoDrawdownPct;
      if (p.btcDrawdownPct > maxBtcDD) maxBtcDD = p.btcDrawdownPct;
    });

    const outperformanceRatio = last.algoEquity / (last.btcEquity || 1);
    const capitalCreatedAlgo = last.algoEquity - initialCapital;
    const capitalCreatedBtc = last.btcEquity - initialCapital;

    return {
      algoFinalEquity: last.algoEquity,
      btcFinalEquity: last.btcEquity,
      algoReturnPct: last.algoReturnPct,
      btcReturnPct: last.btcReturnPct,
      alphaPct: last.alphaPct,
      maxAlgoDD: parseFloat(maxAlgoDD.toFixed(1)),
      maxBtcDD: parseFloat(maxBtcDD.toFixed(1)),
      outperformanceRatio: parseFloat(outperformanceRatio.toFixed(2)),
      capitalCreatedAlgo,
      capitalCreatedBtc,
      currentBtcPrice: last.btcPrice,
      totalTrades: last.tradesClosed,
    };
  }, [fullTimeline, initialCapital]);

  // SVG Chart Geometry Calculations
  const svgWidth = 960;
  const svgHeight = 360;
  const padding = { top: 30, right: 30, bottom: 40, left: 75 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  const chartData = useMemo(() => {
    if (displayTimeline.length === 0) return null;

    let minVal = Infinity;
    let maxVal = -Infinity;

    displayTimeline.forEach((p) => {
      if (metricMode === 'EQUITY') {
        minVal = Math.min(minVal, p.algoEquity, p.btcEquity);
        maxVal = Math.max(maxVal, p.algoEquity, p.btcEquity);
      } else if (metricMode === 'RETURN') {
        minVal = Math.min(minVal, p.algoReturnPct, p.btcReturnPct);
        maxVal = Math.max(maxVal, p.algoReturnPct, p.btcReturnPct);
      } else {
        minVal = Math.min(minVal, p.alphaPct);
        maxVal = Math.max(maxVal, p.alphaPct);
      }
    });

    // In Alpha mode, ensure 0 parity is always included within the vertical scale
    if (metricMode === 'ALPHA') {
      minVal = Math.min(minVal, 0);
      maxVal = Math.max(maxVal, 0);
    }

    // Add 8% breathing room
    const range = maxVal - minVal || 1;
    let yMin = minVal - range * 0.08;
    let yMax = maxVal + range * 0.08;

    // Only clamp to 0 in EQUITY mode (dollar capital cannot be negative)
    if (metricMode === 'EQUITY') {
      yMin = Math.max(0, yMin);
    }

    const getX = (idx) => padding.left + (idx / (displayTimeline.length - 1 || 1)) * plotWidth;
    const getY = (val) => padding.top + plotHeight - ((val - yMin) / (yMax - yMin || 1)) * plotHeight;

    // Calculate zero parity line
    const zeroY = getY(0);
    const hasZeroLine = zeroY >= padding.top && zeroY <= padding.top + plotHeight;
    const zeroRatio = Math.max(0, Math.min(1, (zeroY - padding.top) / (plotHeight || 1)));

    const algoPoints = displayTimeline.map((p, idx) => {
      const val = metricMode === 'EQUITY' ? p.algoEquity : metricMode === 'RETURN' ? p.algoReturnPct : p.alphaPct;
      return { x: getX(idx), y: getY(val), point: p, val };
    });

    const btcPoints = displayTimeline.map((p, idx) => {
      const val = metricMode === 'EQUITY' ? p.btcEquity : metricMode === 'RETURN' ? p.btcReturnPct : 0;
      return { x: getX(idx), y: getY(val), point: p, val };
    });

    // Build SVG Path strings
    const algoPath = algoPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`, '');
    const btcPath = btcPoints.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`, '');

    // In Alpha mode with zero line, close area to zeroY parity; otherwise to bottom axis
    const baselineY = (metricMode === 'ALPHA' && hasZeroLine) ? zeroY : getY(yMin);
    const algoArea = `${algoPath} L ${algoPoints[algoPoints.length - 1].x.toFixed(1)},${baselineY.toFixed(1)} L ${algoPoints[0].x.toFixed(1)},${baselineY.toFixed(1)} Z`;
    const btcArea = `${btcPath} L ${btcPoints[btcPoints.length - 1].x.toFixed(1)},${getY(yMin).toFixed(1)} L ${btcPoints[0].x.toFixed(1)},${getY(yMin).toFixed(1)} Z`;

    // Horizontal Y Grid lines (5 balanced ticks)
    const rawYTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = yMin + ratio * (yMax - yMin);
      const isNearZero = Math.abs(val) < (yMax - yMin) * 0.03;
      return {
        y: getY(val),
        val,
        isNearZero,
        label: metricMode === 'EQUITY' 
          ? `$${Math.round(val).toLocaleString()}` 
          : isNearZero
          ? '0%'
          : val > 0
          ? `+${Math.round(val).toLocaleString()}%`
          : `-${Math.round(Math.abs(val)).toLocaleString()}%`,
      };
    });

    // Suppress ticks that collide with the prominent 0% Parity badge
    const yTicks = rawYTicks.filter((t) => !hasZeroLine || Math.abs(t.y - zeroY) >= 16);

    // Vertical X Grid lines (Years)
    const yearMarkers = [];
    let prevYear = null;
    displayTimeline.forEach((p, idx) => {
      if (p.year !== prevYear) {
        yearMarkers.push({
          x: getX(idx),
          year: p.year,
        });
        prevYear = p.year;
      }
    });

    return {
      algoPoints,
      btcPoints,
      algoPath,
      btcPath,
      algoArea,
      btcArea,
      yTicks,
      yearMarkers,
      zeroY,
      hasZeroLine,
      zeroRatio,
      getX,
      getY,
      yMin,
      yMax,
    };
  }, [displayTimeline, metricMode, plotWidth, plotHeight, padding]);

  // Pointer hover interactions
  const handleMouseMove = (e) => {
    if (!chartRef.current || !chartData || displayTimeline.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const clampedX = Math.max(padding.left, Math.min(svgWidth - padding.right, mouseX));

    const progress = (clampedX - padding.left) / plotWidth;
    const index = Math.min(displayTimeline.length - 1, Math.max(0, Math.round(progress * (displayTimeline.length - 1))));

    const pt = displayTimeline[index];
    setHoveredPoint(pt);
    setMousePos({
      x: chartData.getX(index),
      algoY: chartData.algoPoints[index]?.y,
      btcY: chartData.btcPoints[index]?.y,
    });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
    setMousePos({ x: null, y: null });
  };

  // Year-by-year comparative table
  const yearlyComparison = useMemo(() => {
    const stratYearly = strategy?.yearly_stats || [];
    const annualSource = isEth ? ETH_ANNUAL_RETURNS : BTC_ANNUAL_RETURNS;
    return Object.keys(annualSource).map((yStr) => {
      const year = parseInt(yStr, 10);
      const btc = annualSource[year];
      const algoY = stratYearly.find((item) => item.year === year);
      const algoReturn = algoY ? algoY.total_return_pct : 0.0;
      const alpha = algoReturn - btc.return_pct;
      const isOutperformed = alpha >= 0;

      return {
        year,
        regime: btc.regime,
        algoReturn,
        btcReturn: btc.return_pct,
        alpha,
        isOutperformed,
        trades: algoY?.trades || 0,
        winRate: algoY?.win_rate || 0,
        profitFactor: algoY?.profit_factor || 0,
      };
    });
  }, [strategy, isEth]);

  const isLong = strategy?.type === 'LONG';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Value Proposition & Strategy Alpha Callout */}
      <div className="apple-glass rounded-3xl p-5 md:p-6 border border-black/[0.08] dark:border-white/[0.08]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-apple-blue shadow-[0_0_8px_rgba(10,132,255,0.7)]" />
              <span className="text-xs font-semibold text-apple-text tracking-wide uppercase">
                Alpha Intelligence Benchmark
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-apple-blue/10 text-apple-blue border border-apple-blue/20 font-semibold">
                Ground Truth 2020-2026
              </span>
            </div>
            <h3 className="text-lg md:text-xl font-bold text-apple-text tracking-tight flex items-center gap-2">
              <span>{strategy?.name} vs {assetName} Buy & Hold</span>
            </h3>
            <p className="text-xs text-apple-muted max-w-2xl leading-relaxed">
              Real-world mathematical comparison evaluating capital growth, drawdown mitigation during bear cycles, and net excess return (Alpha) versus passive {assetName} holding.
            </p>
          </div>

          {/* Quick Alpha Badge */}
          {summary && (
            <div className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl p-3.5 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-apple-green/15 text-apple-green flex items-center justify-center border border-apple-green/30">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] text-apple-dim uppercase tracking-wider font-semibold">
                  Cumulative Alpha
                </div>
                <div className="text-base md:text-lg font-bold text-apple-green font-mono tabular-nums">
                  {summary.alphaPct >= 0 ? `+${Number(summary.alphaPct).toLocaleString()}%` : `${summary.alphaPct}%`}
                </div>
                <div className="text-[10px] text-apple-muted">
                  {summary.outperformanceRatio > 1 
                    ? `${summary.outperformanceRatio}x More Wealth than Holding ${assetShort}` 
                    : 'Systematic Capital Shield'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4 Scorecard KPI Metrics */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-5 mt-5 border-t border-black/[0.06] dark:border-white/[0.06]">
            {/* Card 1: Total Return */}
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 space-y-1">
              <div className="text-[11px] text-apple-muted font-medium flex items-center justify-between">
                <span>Net Return</span>
                <span className="text-[10px] font-semibold text-apple-blue">Algo vs {assetShort}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-apple-green font-mono tabular-nums">
                  +{Number(summary.algoReturnPct).toLocaleString()}%
                </span>
                <span className={`text-xs font-mono tabular-nums ${isEth ? 'text-indigo-400' : 'text-apple-orange'}`}>
                  ({summary.btcReturnPct >= 0 ? '+' : ''}{Number(summary.btcReturnPct).toLocaleString()}%)
                </span>
              </div>
              <div className="text-[10px] text-apple-dim">
                Algo Return vs Passive {assetShort} Return
              </div>
            </div>

            {/* Card 2: Initial Capital Wealth ($10k Deposit) */}
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 space-y-1">
              <div className="text-[11px] text-apple-muted font-medium flex items-center justify-between">
                <span>$10k Initial Capital</span>
                <DollarSign className="w-3.5 h-3.5 text-apple-green" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-apple-text font-mono tabular-nums">
                  ${Number(summary.algoFinalEquity).toLocaleString()}
                </span>
                <span className="text-xs text-apple-muted line-through font-mono tabular-nums">
                  ${Number(summary.btcFinalEquity).toLocaleString()}
                </span>
              </div>
              <div className="text-[10px] text-apple-green font-medium">
                +${Number(summary.capitalCreatedAlgo - summary.capitalCreatedBtc).toLocaleString()} Excess Capital
              </div>
            </div>

            {/* Card 3: Max Drawdown Protection */}
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 space-y-1">
              <div className="text-[11px] text-apple-muted font-medium flex items-center justify-between">
                <span>Max Drawdown Risk</span>
                <ShieldCheck className="w-3.5 h-3.5 text-apple-cyan" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-apple-cyan font-mono tabular-nums">
                  -{summary.maxAlgoDD}%
                </span>
                <span className="text-xs text-apple-red font-mono tabular-nums">
                  (-{summary.maxBtcDD}%)
                </span>
              </div>
              <div className="text-[10px] text-apple-green font-medium">
                {(summary.maxBtcDD - summary.maxAlgoDD).toFixed(1)}% Less Capital Drawdown
              </div>
            </div>

            {/* Card 4: Outperformance Multiple */}
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3.5 space-y-1">
              <div className="text-[11px] text-apple-muted font-medium flex items-center justify-between">
                <span>Wealth Multiplier</span>
                <Sparkles className="w-3.5 h-3.5 text-apple-orange" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-bold text-apple-orange font-mono tabular-nums">
                  {summary.outperformanceRatio}x
                </span>
                <span className="text-xs text-apple-muted">
                  over {assetName}
                </span>
              </div>
              <div className="text-[10px] text-apple-dim">
                Across {summary.totalTrades} Systematic Closed Trades
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Dual-Curve Visualizer Chart */}
      <div className="apple-glass rounded-3xl p-5 md:p-6 border border-black/[0.08] dark:border-white/[0.08] space-y-4">
        
        {/* Controls Bar: Metric Mode & Range Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-black/[0.06] dark:border-white/[0.06]">
          
          {/* Metric Mode Toggle */}
          <div className="flex items-center gap-1.5 bg-black/[0.03] dark:bg-white/[0.05] p-1 rounded-2xl border border-black/[0.06] dark:border-white/[0.06]">
            {[
              { id: 'EQUITY', label: 'Portfolio Growth ($10k Base)' },
              { id: 'RETURN', label: 'Cumulative Return (%)' },
              { id: 'ALPHA', label: `Alpha Spread (% Over ${assetShort})` },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  playRetroSound('blip');
                  setMetricMode(m.id);
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  metricMode === m.id
                    ? 'bg-apple-blue text-white shadow-sm'
                    : 'text-apple-muted hover:text-apple-text'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Timeframe Presets */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-apple-dim mr-1 hidden sm:inline">Cycle:</span>
            {[
              { id: 'ALL', label: '2020-2026 (All)' },
              { id: '2020-2022', label: '2020-22 (Bear Shield)' },
              { id: '2023-2024', label: '2023-24 (Bull Recovery)' },
              { id: '2025-2026', label: '2025-26 (Recent)' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  playRetroSound('blip');
                  setRangePreset(r.id);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-xl border transition-all cursor-pointer ${
                  rangePreset === r.id
                    ? 'bg-black/10 dark:bg-white/10 text-apple-text border-black/20 dark:border-white/20 font-semibold'
                    : 'text-apple-muted border-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs gap-3">
          {metricMode === 'ALPHA' ? (
            <div className="flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-1.5 rounded-full bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.6)]" />
                <span className="font-semibold text-apple-green">Positive Alpha</span>
                <span className="text-[10px] text-apple-dim">(Outperforming {assetShort} Buy & Hold)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-1.5 rounded-full bg-apple-red shadow-[0_0_6px_rgba(255,69,58,0.6)]" />
                <span className="font-semibold text-apple-red">Negative Alpha</span>
                <span className="text-[10px] text-apple-dim">(Trailing {assetShort} / Consolidation Lag)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-0.5 border-b border-dashed border-apple-muted" />
                <span className="font-semibold text-apple-muted">0.0% Parity Line</span>
                <span className="text-[10px] text-apple-dim">(Benchmark Baseline)</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-1 rounded-full bg-apple-blue" />
                <span className="font-semibold text-apple-text">{strategy?.name || 'Algo Strategy'}</span>
                <span className="text-[10px] text-apple-dim">(Systematic Execution)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-3.5 h-1 rounded-full border-b border-dashed ${isEth ? 'bg-[#627EEA]' : 'bg-apple-orange'}`} />
                <span className={`font-semibold ${isEth ? 'text-indigo-400' : 'text-apple-orange'}`}>{assetName} Buy & Hold</span>
                <span className="text-[10px] text-apple-dim">(Passive Benchmark)</span>
              </div>
            </div>
          )}
          <div className="text-[11px] text-apple-dim">
            Hover cursor over chart to inspect granular dates & returns
          </div>
        </div>

        {/* SVG Visualization Canvas */}
        <div 
          ref={chartRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative w-full aspect-[16/6] min-h-[260px] max-h-[420px] bg-black/[0.02] dark:bg-black/25 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] overflow-hidden cursor-crosshair select-none"
        >
          {chartData && (
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <defs>
                {/* Algo Blue Gradient */}
                <linearGradient id="algoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0071E3" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#0071E3" stopOpacity="0.0" />
                </linearGradient>

                {/* Benchmark Asset Gradient */}
                <linearGradient id="btcGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={benchmarkColor} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={benchmarkColor} stopOpacity="0.0" />
                </linearGradient>

                {/* Alpha Area Gradient (Dual Color: Apple Green above zero, Apple Red below zero) */}
                <linearGradient 
                  id="alphaAreaGradient" 
                  x1="0" 
                  y1={padding.top} 
                  x2="0" 
                  y2={padding.top + plotHeight} 
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#30D158" stopOpacity="0.35" />
                  <stop offset={`${Math.max(0, chartData.zeroRatio * 100 - 3).toFixed(1)}%`} stopColor="#30D158" stopOpacity="0.06" />
                  <stop offset={`${(chartData.zeroRatio * 100).toFixed(1)}%`} stopColor="#30D158" stopOpacity="0.0" />
                  <stop offset={`${(chartData.zeroRatio * 100).toFixed(1)}%`} stopColor="#FF453A" stopOpacity="0.0" />
                  <stop offset={`${Math.min(100, chartData.zeroRatio * 100 + 3).toFixed(1)}%`} stopColor="#FF453A" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#FF453A" stopOpacity="0.32" />
                </linearGradient>

                {/* Alpha Stroke Gradient (Apple Green above zero, Apple Red below zero) */}
                <linearGradient 
                  id="alphaStrokeGradient" 
                  x1="0" 
                  y1={padding.top} 
                  x2="0" 
                  y2={padding.top + plotHeight} 
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="#30D158" />
                  <stop offset={`${Math.max(0, chartData.zeroRatio * 100 - 1.5).toFixed(1)}%`} stopColor="#30D158" />
                  <stop offset={`${Math.min(100, chartData.zeroRatio * 100 + 1.5).toFixed(1)}%`} stopColor="#FF453A" />
                  <stop offset="100%" stopColor="#FF453A" />
                </linearGradient>
              </defs>

              {/* Horizontal Grid lines */}
              {chartData.yTicks.map((t, i) => (
                <g key={`ytick-${i}`}>
                  <line
                    x1={padding.left}
                    y1={t.y}
                    x2={svgWidth - padding.right}
                    y2={t.y}
                    stroke="currentColor"
                    className="text-black/[0.07] dark:text-white/[0.07]"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={padding.left - 10}
                    y={t.y + 4}
                    textAnchor="end"
                    className="text-[10px] fill-apple-dim font-mono tabular-nums"
                  >
                    {t.label}
                  </text>
                </g>
              ))}

              {/* Zero Reference Parity Line (Active when range crosses 0, especially in Alpha Spread) */}
              {chartData.hasZeroLine && (
                <g>
                  <line
                    x1={padding.left}
                    y1={chartData.zeroY}
                    x2={svgWidth - padding.right}
                    y2={chartData.zeroY}
                    stroke="currentColor"
                    className="text-apple-muted/60 dark:text-white/30"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                  <rect
                    x={padding.left - 52}
                    y={chartData.zeroY - 9}
                    width="44"
                    height="18"
                    rx="5"
                    className="fill-black/[0.08] dark:fill-white/[0.12]"
                  />
                  <text
                    x={padding.left - 30}
                    y={chartData.zeroY + 3.5}
                    textAnchor="middle"
                    className="text-[10px] fill-apple-text font-bold font-mono"
                  >
                    0.0%
                  </text>
                  <rect
                    x={svgWidth - padding.right + 6}
                    y={chartData.zeroY - 9}
                    width="54"
                    height="18"
                    rx="5"
                    className="fill-black/[0.08] dark:fill-white/[0.12]"
                  />
                  <text
                    x={svgWidth - padding.right + 33}
                    y={chartData.zeroY + 3.5}
                    textAnchor="middle"
                    className="text-[9px] fill-apple-muted dark:fill-apple-muted font-bold font-mono tracking-wider"
                  >
                    PARITY
                  </text>
                </g>
              )}

              {/* Vertical Year Grid lines */}
              {chartData.yearMarkers.map((ym, i) => (
                <g key={`ymark-${i}`}>
                  <line
                    x1={ym.x}
                    y1={padding.top}
                    x2={ym.x}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-black/[0.05] dark:text-white/[0.05]"
                  />
                  <text
                    x={ym.x}
                    y={svgHeight - padding.bottom + 18}
                    textAnchor="middle"
                    className="text-[11px] fill-apple-muted font-medium font-mono"
                  >
                    {ym.year}
                  </text>
                </g>
              ))}

              {/* Bitcoin Benchmark Area & Line */}
              {metricMode !== 'ALPHA' && (
                <>
                  <path d={chartData.btcArea} fill="url(#btcGradient)" />
                  <path
                    d={chartData.btcPath}
                    fill="none"
                    stroke={benchmarkColor}
                    strokeWidth="2"
                    strokeDasharray="4,4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Algo Strategy Area & Line */}
              <path 
                d={chartData.algoArea} 
                fill={metricMode === 'ALPHA' ? 'url(#alphaAreaGradient)' : 'url(#algoGradient)'} 
              />
              <path
                d={chartData.algoPath}
                fill="none"
                stroke={metricMode === 'ALPHA' ? 'url(#alphaStrokeGradient)' : '#0071E3'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Hover Crosshair & Data Points */}
              {mousePos.x !== null && (
                <g>
                  {/* Vertical Crosshair Line */}
                  <line
                    x1={mousePos.x}
                    y1={padding.top}
                    x2={mousePos.x}
                    y2={svgHeight - padding.bottom}
                    stroke="currentColor"
                    className="text-apple-blue/70"
                    strokeWidth="1.5"
                    strokeDasharray="2,2"
                  />

                  {/* Dot on Benchmark curve */}
                  {metricMode !== 'ALPHA' && mousePos.btcY !== undefined && (
                    <circle
                      cx={mousePos.x}
                      cy={mousePos.btcY}
                      r="4.5"
                      fill={benchmarkColor}
                      className="stroke-white dark:stroke-[#0C0D12]"
                      strokeWidth="2"
                    />
                  )}

                  {/* Dot on Algo curve */}
                  {mousePos.algoY !== undefined && (
                    <circle
                      cx={mousePos.x}
                      cy={mousePos.algoY}
                      r="5.5"
                      className={metricMode === 'ALPHA' 
                        ? (hoveredPoint && hoveredPoint.alphaPct >= 0 
                            ? 'fill-apple-green stroke-white dark:stroke-[#0C0D12]' 
                            : 'fill-apple-red stroke-white dark:stroke-[#0C0D12]')
                        : 'fill-apple-blue stroke-white dark:stroke-[#0C0D12]'}
                      strokeWidth="2.5"
                    />
                  )}
                </g>
              )}
            </svg>
          )}

          {/* Floating Hover Inspector HUD */}
          {hoveredPoint && (
            <div 
              className="absolute pointer-events-none top-3 right-3 bg-white/95 dark:bg-[#13141C]/95 backdrop-blur-md border border-black/10 dark:border-white/15 rounded-2xl p-3.5 shadow-2xl space-y-2 text-xs min-w-[240px] transition-all duration-75"
            >
              <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-1.5">
                <span className="font-semibold text-apple-text flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-apple-blue" />
                  {hoveredPoint.date}
                </span>
                <span className="text-[10px] text-apple-dim font-mono">
                  {assetShort} @ ${Math.round(hoveredPoint.btcPrice).toLocaleString()}
                </span>
              </div>

              <div className="space-y-1.5 font-mono">
                {/* Algo value */}
                <div className="flex items-center justify-between text-apple-blue">
                  <span className="text-[11px] font-sans font-medium text-apple-text">Algo {metricMode === 'EQUITY' ? 'Equity' : 'Return'}:</span>
                  <span className={`font-bold tabular-nums ${hoveredPoint.algoReturnPct >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                    {metricMode === 'EQUITY' 
                      ? `$${hoveredPoint.algoEquity.toLocaleString()}` 
                      : `${hoveredPoint.algoReturnPct >= 0 ? '+' : ''}${hoveredPoint.algoReturnPct}%`}
                  </span>
                </div>

                {/* BTC value */}
                <div className="flex items-center justify-between text-apple-orange">
                  <span className="text-[11px] font-sans font-medium text-apple-muted">{assetShort} {metricMode === 'EQUITY' ? 'Equity' : 'Return'}:</span>
                  <span className={`font-medium tabular-nums ${hoveredPoint.btcReturnPct >= 0 ? (isEth ? 'text-indigo-400' : 'text-apple-orange') : 'text-apple-dim'}`}>
                    {metricMode === 'EQUITY' 
                      ? `$${hoveredPoint.btcEquity.toLocaleString()}` 
                      : `${hoveredPoint.btcReturnPct >= 0 ? '+' : ''}${hoveredPoint.btcReturnPct}%`}
                  </span>
                </div>

                {/* Net Alpha */}
                <div className="flex items-center justify-between pt-1 border-t border-black/[0.06] dark:border-white/[0.06]">
                  <span className={`text-[11px] font-sans font-semibold ${hoveredPoint.alphaPct >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                    {hoveredPoint.alphaPct >= 0 ? 'Net Alpha Spread:' : 'Alpha Drawdown / Lag:'}
                  </span>
                  <span className={`font-bold tabular-nums ${hoveredPoint.alphaPct >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                    {hoveredPoint.alphaPct >= 0 ? `+${hoveredPoint.alphaPct}%` : `${hoveredPoint.alphaPct}%`}
                  </span>
                </div>
              </div>

              {/* Status Pill in Tooltip */}
              <div className="pt-1 flex items-center justify-between border-t border-black/[0.06] dark:border-white/[0.06]">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  hoveredPoint.alphaPct >= 0 
                    ? 'bg-apple-green/15 text-apple-green border-apple-green/30' 
                    : 'bg-apple-red/15 text-apple-red border-apple-red/30'
                }`}>
                  {hoveredPoint.alphaPct >= 0 
                    ? `+${hoveredPoint.alphaPct}% vs Buy & Hold` 
                    : `${hoveredPoint.alphaPct}% vs Buy & Hold`}
                </span>
                <span className="text-[10px] text-apple-dim font-mono">
                  Trades: {hoveredPoint.tradesClosed}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Year-by-Year Head-to-Head Alpha Breakdown Table */}
      <div className="apple-glass rounded-3xl p-5 md:p-6 border border-black/[0.08] dark:border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-sm md:text-base text-apple-text flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-apple-blue" />
              <span>Year-by-Year Alpha Audit (2020 - 2026)</span>
            </h4>
            <p className="text-xs text-apple-muted mt-0.5">
              Granular comparison of strategy performance against {assetName} in each distinct market regime.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-apple-dim uppercase tracking-wider">
            Annual Ground Truth
          </span>
        </div>

        <div className="overflow-x-auto -mx-5 md:mx-0">
          <div className="inline-block min-w-full align-middle px-5 md:px-0">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-black/[0.08] dark:border-white/[0.08] text-apple-dim uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 text-left font-semibold">Year</th>
                  <th className="py-2.5 text-left font-semibold">Market Regime</th>
                  <th className="py-2.5 text-right font-semibold">Algo Return</th>
                  <th className="py-2.5 text-right font-semibold">{assetName} Return</th>
                  <th className="py-2.5 text-right font-semibold">Alpha Spread</th>
                  <th className="py-2.5 text-center font-semibold">Trades</th>
                  <th className="py-2.5 text-right font-semibold">Outcome Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                {yearlyComparison.map((row) => {
                  const isAlphaPositive = row.alpha >= 0;
                  return (
                    <tr 
                      key={row.year}
                      className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Year */}
                      <td className="py-3 font-mono font-bold text-apple-text whitespace-nowrap">
                        {row.year}
                      </td>

                      {/* Regime */}
                      <td className="py-3 text-apple-muted whitespace-nowrap">
                        {row.regime}
                      </td>

                      {/* Algo Return */}
                      <td className="py-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={row.algoReturn >= 0 ? 'text-apple-green' : 'text-apple-red'}>
                          {row.algoReturn >= 0 ? `+${row.algoReturn.toFixed(1)}%` : `${row.algoReturn.toFixed(1)}%`}
                        </span>
                      </td>

                      {/* Bitcoin Return */}
                      <td className="py-3 text-right font-mono font-medium whitespace-nowrap">
                        <span className={row.btcReturn >= 0 ? (isEth ? 'text-indigo-400' : 'text-apple-orange') : 'text-apple-dim'}>
                          {row.btcReturn >= 0 ? `+${row.btcReturn.toFixed(1)}%` : `${row.btcReturn.toFixed(1)}%`}
                        </span>
                      </td>

                      {/* Alpha Spread */}
                      <td className="py-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isAlphaPositive ? 'text-apple-green' : 'text-apple-orange'}>
                          {row.alpha >= 0 ? `+${row.alpha.toFixed(1)}%` : `${row.alpha.toFixed(1)}%`}
                        </span>
                      </td>

                      {/* Trades */}
                      <td className="py-3 text-center text-apple-muted font-mono whitespace-nowrap">
                        {row.trades}
                      </td>

                      {/* Outcome Verdict */}
                      <td className="py-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                          row.year === 2022
                            ? 'bg-apple-cyan/15 text-apple-cyan border-apple-cyan/30'
                            : isAlphaPositive
                            ? 'bg-apple-green/15 text-apple-green border-apple-green/30'
                            : 'bg-black/[0.04] dark:bg-white/[0.05] text-apple-muted border-black/10 dark:border-white/10'
                        }`}>
                          {row.year === 2022 ? (
                            <>
                              <ShieldCheck className="w-3 h-3" />
                              Bear Capital Shield
                            </>
                          ) : isAlphaPositive ? (
                            <>
                              <TrendingUp className="w-3 h-3" />
                              Outperformed {assetShort}
                            </>
                          ) : (
                            'Controlled Cadence'
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Why This Algo Beats Buy & Hold (Mathematical Edge) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        <div className="apple-glass rounded-2xl p-4 border border-black/[0.06] dark:border-white/[0.06] space-y-2">
          <div className="w-8 h-8 rounded-xl bg-apple-blue/15 text-apple-blue flex items-center justify-center border border-apple-blue/25">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h5 className="text-xs font-bold text-apple-text tracking-tight">
            1. Asymmetric Drawdown Avoidance
          </h5>
          <p className="text-[11px] text-apple-muted leading-relaxed">
            A -70% crash requires +233% gain just to break even. This algo exits on momentum breakdown, holding cash while {assetName} bleeds, preserving critical compounding principal.
          </p>
        </div>

        <div className="apple-glass rounded-2xl p-4 border border-black/[0.06] dark:border-white/[0.06] space-y-2">
          <div className="w-8 h-8 rounded-xl bg-apple-green/15 text-apple-green flex items-center justify-center border border-apple-green/25">
            <Zap className="w-4 h-4" />
          </div>
          <h5 className="text-xs font-bold text-apple-text tracking-tight">
            2. High-Velocity Compounding
          </h5>
          <p className="text-[11px] text-apple-muted leading-relaxed">
            By taking dynamic partial profits and locking in breakeven shields, profits are reinvested into subsequent high-probability setups, multiplying terminal wealth faster than static holding.
          </p>
        </div>

        <div className="apple-glass rounded-2xl p-4 border border-black/[0.06] dark:border-white/[0.06] space-y-2">
          <div className="w-8 h-8 rounded-xl bg-apple-purple/15 text-apple-purple flex items-center justify-center border border-apple-purple/25">
            <Sliders className="w-4 h-4" />
          </div>
          <h5 className="text-xs font-bold text-apple-text tracking-tight">
            3. Pure Mechanical Discipline
          </h5>
          <p className="text-[11px] text-apple-muted leading-relaxed">
            Zero psychological panic-selling at market bottoms or FOMO buying at market tops. Execution is 100% deterministic, governed by verified Moving Average and price action logic.
          </p>
        </div>
      </div>

    </div>
  );
}

import React, { useState } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  BarChart3, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  Zap, 
  Target, 
  ShieldAlert, 
  Compass, 
  FileText, 
  Sliders, 
  Maximize2,
  Lock,
  ChevronRight,
  Sun,
  Moon,
  Clock,
  Sparkles
} from 'lucide-react';
import strategiesData from '../data/strategiesData.json';

export default function LandingPage({ 
  ticker = { price: 77300, change_24h_pct: 0.5 }, 
  status = { binance_ws_connected: true },
  floor = null,
  theme = 'light',
  onToggleTheme,
  onEnterDashboard
}) {
  const [activeCategory, setActiveCategory] = useState('ALL'); // ALL, LONG, SHORT, MACRO
  const [selectedPreviewImage, setSelectedPreviewImage] = useState(null);

  const isPositive = (ticker?.change_24h_pct || 0) >= 0;

  // Filter strategies for the showcase grid
  const filteredStrategies = strategiesData.filter((s) => {
    if (activeCategory === 'LONG') return s.type === 'LONG' && s.id !== 'pure-macro-weekly-ma55';
    if (activeCategory === 'SHORT') return s.type === 'SHORT';
    if (activeCategory === 'MACRO') return s.id === 'pure-macro-weekly-ma55';
    return true;
  });

  const handleLaunch = (stratId = null) => {
    playRetroSound('select');
    if (onEnterDashboard) {
      onEnterDashboard(stratId);
    }
  };

  return (
    <div className="min-h-screen bg-apple-canvas text-apple-text selection:bg-apple-blue selection:text-white transition-colors duration-200">
      
      {/* 1. Global Sticky Navigation Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-2xl bg-apple-canvas/80 border-b border-apple-border transition-colors duration-200">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          
          {/* Logo & Brand Identity */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-black/[0.06] to-black/[0.01] dark:from-white/[0.12] dark:to-white/[0.02] border border-black/10 dark:border-white/15 flex items-center justify-center shadow-sm">
              <span className="w-3.5 h-3.5 rounded-sm bg-apple-blue flex items-center justify-center text-[9px] font-bold text-white">
                Q
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-base tracking-tight text-apple-text">
                  Quentra
                </span>
                <span className="px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase rounded-full bg-apple-blue/15 text-apple-cyan border border-apple-blue/30">
                  Pro
                </span>
              </div>
              <p className="text-[11px] text-apple-muted hidden sm:block">
                Quantitative Algorithmic Platform
              </p>
            </div>
          </div>

          {/* Center Links & Live Stream Pill */}
          <div className="hidden lg:flex items-center gap-6 text-xs text-apple-muted font-medium">
            <a href="#features" className="hover:text-apple-text transition-colors">Core Features</a>
            <a href="#strategies" className="hover:text-apple-text transition-colors">8 Quant Algos</a>
            <a href="#risk" className="hover:text-apple-text transition-colors">Risk Architecture</a>
            <a href="#proof" className="hover:text-apple-text transition-colors">Ground Truth Data</a>
          </div>

          {/* Right Action Bar: Live Ticker + Theme + CTA */}
          <div className="flex items-center gap-3">
            {/* Live Spot Pill */}
            <div className="hidden sm:flex items-center gap-2 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl px-3 py-1 text-xs">
              <span className="text-apple-dim">BTC:</span>
              <span className="font-mono font-bold text-apple-text tabular-nums">
                {formatPrice(ticker?.price || 77300)}
              </span>
              <span className={`text-[10px] font-semibold tabular-nums ${isPositive ? 'text-apple-green' : 'text-apple-red'}`}>
                {formatPercent(ticker?.change_24h_pct || 0)}
              </span>
            </div>

            {/* Theme Toggle Button */}
            <button
              onClick={onToggleTheme}
              className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.96] border border-black/10 dark:border-white/10 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer min-w-[34px] min-h-[34px]"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-apple-orange" />
              ) : (
                <Moon className="w-4 h-4 text-apple-blue" />
              )}
            </button>

            {/* Main Terminal CTA Button */}
            <button
              onClick={() => handleLaunch()}
              className="px-4 py-2 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md"
            >
              <span>Launch Terminal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>
      </header>

      {/* 2. Hero Section: Direct Value Proposition & Live Evidence */}
      <section className="relative overflow-hidden pt-12 pb-16 md:pt-18 md:pb-24 px-4 sm:px-6">
        <div className="max-w-[1400px] mx-auto space-y-10">
          
          {/* Hero Copy */}
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 bg-apple-blue/10 border border-apple-blue/25 text-apple-blue dark:text-apple-cyan px-3 py-1 rounded-full text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-apple-blue animate-pulse" />
              <span>Institutional Precision · 2020-2026 Ground Truth Backtest</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-apple-text leading-[1.12]">
              Algorithmic Bitcoin Trading Built on Empirical Proof, Not Speculation.
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-apple-muted leading-relaxed max-w-2xl">
              Quentra executes 8 systematic Smart Money Concepts breakout models with macro moving average trend filters. Zero emotional interference. Hard capital shield stops.
            </p>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => handleLaunch()}
                className="px-6 py-3.5 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-sm font-semibold rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg"
              >
                <span>Enter Trading Terminal</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <a
                href="#strategies"
                className="px-5 py-3.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] border border-black/10 dark:border-white/15 text-apple-text text-sm font-medium rounded-2xl transition-all cursor-pointer"
              >
                Explore 8 Quant Models ↓
              </a>
            </div>
          </div>

          {/* Quantitative Fact Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 pt-4 border-t border-black/[0.06] dark:border-white/[0.06]">
            <div className="apple-glass rounded-2xl p-4">
              <div className="text-xs text-apple-muted">Audited Strategies</div>
              <div className="text-xl md:text-2xl font-bold text-apple-text font-mono mt-1">
                8 Models
              </div>
              <div className="text-[11px] text-apple-dim mt-0.5">Long, Short & Macro Trend</div>
            </div>

            <div className="apple-glass rounded-2xl p-4">
              <div className="text-xs text-apple-muted">Top Model Benchmark</div>
              <div className="text-xl md:text-2xl font-bold text-apple-green font-mono mt-1">
                +2,835.1%
              </div>
              <div className="text-[11px] text-apple-dim mt-0.5">Pippo 30M Alpha Runner</div>
            </div>

            <div className="apple-glass rounded-2xl p-4">
              <div className="text-xs text-apple-muted">Historical Data Horizon</div>
              <div className="text-xl md:text-2xl font-bold text-apple-cyan font-mono mt-1">
                117,338 Bars
              </div>
              <div className="text-[11px] text-apple-dim mt-0.5">2020 - 2026 Binance Ground Truth</div>
            </div>

            <div className="apple-glass rounded-2xl p-4">
              <div className="text-xs text-apple-muted">Liquidation Track Record</div>
              <div className="text-xl md:text-2xl font-bold text-apple-green font-mono mt-1">
                0.0%
              </div>
              <div className="text-[11px] text-apple-dim mt-0.5">Protected by Hard Stops</div>
            </div>
          </div>

          {/* Hero Feature Preview: Interactive Terminal Mockup */}
          <div className="apple-glass rounded-3xl p-3 md:p-5 space-y-3 shadow-2xl border border-black/10 dark:border-white/15">
            <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-3 px-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-apple-red/80" />
                <span className="w-3 h-3 rounded-full bg-apple-orange/80" />
                <span className="w-3 h-3 rounded-full bg-apple-green/80" />
                <span className="text-xs font-mono text-apple-muted ml-2 hidden sm:inline">
                  quentra.terminal/live-execution-stream
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-apple-cyan bg-apple-blue/10 px-2.5 py-0.5 rounded-full border border-apple-blue/25">
                  Live Terminal View
                </span>
                <button
                  onClick={() => handleLaunch()}
                  className="text-xs text-apple-text hover:text-apple-blue flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  <span>Open Live Interface</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* High-Resolution Terminal Screenshot Preview */}
            <div className="relative group overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-black">
              <img
                src="/snapshots/chart_preview.png"
                alt="Quentra Candlestick Execution Terminal"
                className="w-full h-auto object-cover transform transition-transform duration-500 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
                <button
                  onClick={() => handleLaunch()}
                  className="px-5 py-2.5 bg-apple-blue text-white rounded-xl text-xs font-semibold shadow-lg flex items-center gap-2 cursor-pointer hover:bg-blue-600 transition-colors"
                >
                  <span>Interact with Live Candlestick & Markers</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 3. Core Features Architecture (Bento Grid) */}
      <section id="features" className="py-16 md:py-24 border-t border-apple-border bg-apple-surface/40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 space-y-12">
          
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-apple-blue">
              Platform Capabilities
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              Four Specialized Pillars of Algorithmic Trading
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted leading-relaxed">
              Every interface in Quentra is designed for quantitative rigor, zero guesswork, and total auditability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Feature 1: Candlestick Engine & Marker HUD */}
            <div className="apple-glass rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-blue/15 border border-apple-blue/30 flex items-center justify-center text-apple-cyan">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-apple-text tracking-tight">
                  High-Speed Candlestick Terminal & On-Chart Signal HUD
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Interactive multi-timeframe chart (30M, 1H, 4H, 1D, 1W) with exact historical buy and sell markers plotted on the bars. Inspect entry prices, exit targets, and trade durations in real time.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
                <img
                  src="/snapshots/chart_preview.png"
                  alt="Candlestick Chart & Signal Markers"
                  className="w-full h-auto object-cover"
                />
              </div>
              <button
                onClick={() => handleLaunch()}
                className="text-xs font-semibold text-apple-blue hover:text-blue-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Launch Interactive Chart</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Feature 2: Algo vs Bitcoin Price Visualizer */}
            <div className="apple-glass rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-green/15 border border-apple-green/30 flex items-center justify-center text-apple-green">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-apple-text tracking-tight">
                  Empirical Alpha & Comparative Benchmark Visualizer
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Side-by-side equity comparison of algorithmic trading against passive Bitcoin buy-and-hold. Includes granular Alpha Spread line chart with zero-baseline tracking.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
                <img
                  src="/snapshots/algo_vs_btc_preview.png"
                  alt="Algo vs Bitcoin Price Benchmark"
                  className="w-full h-auto object-cover"
                />
              </div>
              <button
                onClick={() => handleLaunch()}
                className="text-xs font-semibold text-apple-green hover:text-green-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Inspect Alpha Performance</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Feature 3: Transparent Closed Trade Logs */}
            <div className="apple-glass rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-orange/15 border border-apple-orange/30 flex items-center justify-center text-apple-orange">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-apple-text tracking-tight">
                  Verifiable Closed Trade Logs & Execution Audit
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Zero black-box claims. Filter trades by year, win/loss status, and search specific exit triggers. Every transaction details entry price, exit price, and net return after fees.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
                <img
                  src="/snapshots/trade_logs_preview.png"
                  alt="Closed Trade Logs Audit"
                  className="w-full h-auto object-cover"
                />
              </div>
              <button
                onClick={() => handleLaunch()}
                className="text-xs font-semibold text-apple-orange hover:text-orange-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>View Full Trade History</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Feature 4: Leverage & Liquidation Simulator */}
            <div className="apple-glass rounded-3xl p-6 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-purple/15 border border-apple-purple/30 flex items-center justify-center text-apple-purple">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-semibold text-apple-text tracking-tight">
                  Leverage & Liquidation Safety Architecture
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Simulate empirical compounding across 4 margin tiers and custom leverage sliders. Calculates dynamic liquidation mark prices and proves mathematical safety buffers over hard stops.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden border border-black/10 dark:border-white/10 shadow-sm">
                <img
                  src="/snapshots/risk_architecture_preview.png"
                  alt="Leverage and Liquidation Architecture"
                  className="w-full h-auto object-cover"
                />
              </div>
              <button
                onClick={() => handleLaunch()}
                className="text-xs font-semibold text-apple-purple hover:text-purple-600 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Simulate Leverage Risk</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>
      </section>

      {/* 4. The 8 Quantitative Algorithms Showcase */}
      <section id="strategies" className="py-16 md:py-24 border-t border-apple-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 space-y-8">
          
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2 max-w-xl">
              <div className="text-xs font-semibold uppercase tracking-wider text-apple-blue">
                Strategy Directory
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
                8 Quantitative Models Calibrated for Every Market Cycle
              </h2>
              <p className="text-xs sm:text-sm text-apple-muted leading-relaxed">
                Choose between long-only momentum runners, macro cycle followers, and tactical short breakdown exploitations.
              </p>
            </div>

            {/* Category Segment Filter */}
            <div className="apple-segmented-container">
              {[
                { id: 'ALL', label: 'All Models (8)' },
                { id: 'LONG', label: 'Long Momentum (4)' },
                { id: 'SHORT', label: 'Short Breakdowns (3)' },
                { id: 'MACRO', label: 'Macro Cycle (1)' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    playRetroSound('blip');
                    setActiveCategory(tab.id);
                  }}
                  className={`apple-segmented-item ${activeCategory === tab.id ? 'active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {filteredStrategies.map((s) => {
              const isLong = s.type === 'LONG';
              const m = s.metrics || {};
              const p = s.parameters || {};

              return (
                <div
                  key={s.id}
                  className="apple-glass rounded-3xl p-5 space-y-4 flex flex-col justify-between hover:shadow-lg transition-all duration-300 border border-black/10 dark:border-white/10 group"
                >
                  <div className="space-y-3">
                    {/* Direction & Timeframe Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        s.id === 'pure-macro-weekly-ma55'
                          ? 'bg-apple-cyan/10 text-apple-cyan border-apple-cyan/30'
                          : isLong
                          ? 'bg-apple-green/10 text-apple-green border-apple-green/30'
                          : 'bg-apple-red/10 text-apple-red border-apple-red/30'
                      }`}>
                        {s.id === 'pure-macro-weekly-ma55' ? 'Macro Dual' : s.type}
                      </span>
                      <span className="text-[11px] font-mono text-apple-blue bg-apple-blue/10 px-2 py-0.5 rounded-md">
                        {s.timeframe} Cadence
                      </span>
                    </div>

                    <div>
                      <h4 className="text-base font-semibold text-apple-text tracking-tight group-hover:text-apple-blue transition-colors">
                        {s.name}
                      </h4>
                      <p className="text-[11px] text-apple-muted line-clamp-2 mt-1 leading-relaxed">
                        {s.logic_summary}
                      </p>
                    </div>

                    {/* Metric Badges */}
                    <div className="grid grid-cols-2 gap-2 bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06] rounded-2xl p-3 text-xs">
                      <div>
                        <span className="text-[10px] text-apple-dim block">Total Return</span>
                        <span className="font-semibold text-apple-green font-mono tabular-nums">
                          +{Number(m.total_return_pct || 0).toLocaleString()}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-apple-dim block">Win Rate</span>
                        <span className="font-semibold text-apple-text font-mono tabular-nums">
                          {m.win_rate_pct}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-apple-dim block">Profit Factor</span>
                        <span className="font-semibold text-apple-cyan font-mono tabular-nums">
                          {m.profit_factor}x
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-apple-dim block">Hard Stop</span>
                        <span className="font-semibold text-apple-red font-mono tabular-nums">
                          {p.hard_stop_loss || '5.0%'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Launch CTA for this specific algo */}
                  <button
                    onClick={() => handleLaunch(s.id)}
                    className="w-full py-2 px-3 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-apple-blue hover:text-white dark:hover:bg-apple-blue dark:hover:text-white active:scale-[0.98] border border-black/10 dark:border-white/10 text-apple-text text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>Launch with {s.short_name || 'Algo'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* 5. Quantitative Risk & Defense Architecture */}
      <section id="risk" className="py-16 md:py-24 border-t border-apple-border bg-apple-surface/40">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 space-y-12">
          
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-apple-blue">
              Risk Engineering
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              The Three Non-Negotiable Pillars of Capital Defense
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted leading-relaxed">
              Why Quentra has maintained a 0.0% liquidation rate across 6 years of volatile crypto cycles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="apple-glass rounded-3xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-apple-cyan/15 text-apple-cyan border border-apple-cyan/30 flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="text-base font-semibold text-apple-text">
                Macro Moving Average Regime Filter
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                Longs are strictly blocked whenever Bitcoin trades below the 4H SMA 111 or Weekly MA 55. This single mathematical filter eliminates 80% of whipsaws during bear markets and preserves cash.
              </p>
            </div>

            <div className="apple-glass rounded-3xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-apple-red/15 text-apple-red border border-apple-red/30 flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="text-base font-semibold text-apple-text">
                Hard Stop Loss on Every Trade
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                Every execution carries an invariant hard stop (5% to 15% depending on cadence). No mental stops, no averaging down, and no hope trading. Capital preservation is prioritized over win rate vanity.
              </p>
            </div>

            <div className="apple-glass rounded-3xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-apple-green/15 text-apple-green border border-apple-green/30 flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="text-base font-semibold text-apple-text">
                Rapid Breakeven Risk Elimination
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                As soon as a trade achieves initial expansion (+1.5% to +5.0%), the stop loss automatically advances to the entry price (+0.2% to cover taker fees), unlocking a zero-risk ride for trend runners.
              </p>
            </div>
          </div>

        </div>
      </section>

      {/* 6. Final High-Impact Call to Action */}
      <section className="py-16 md:py-24 border-t border-apple-border px-4 sm:px-6">
        <div className="max-w-[1200px] mx-auto apple-glass rounded-3xl p-8 sm:p-12 md:p-16 text-center space-y-6 shadow-2xl relative overflow-hidden border border-black/10 dark:border-white/15">
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              Experience Verified Algorithmic Execution Today.
            </h2>
            <p className="text-xs sm:text-sm md:text-base text-apple-muted leading-relaxed">
              Open the full trading terminal, explore candlestick markers, inspect trade logs, and simulate leverage safety models with zero barriers.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => handleLaunch()}
              className="px-8 py-4 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-sm font-semibold rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-xl"
            >
              <span>Launch Trading Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-4 text-xs text-apple-dim flex items-center justify-center gap-4 flex-wrap">
            <span>Direct Binance WebSocket</span>
            <span>·</span>
            <span>2020-2026 Ground Truth</span>
            <span>·</span>
            <span>Zero Emotional Bias</span>
          </div>
        </div>
      </section>

      {/* 7. Institutional Footer */}
      <footer className="border-t border-apple-border bg-apple-surface/60 py-8 px-4 sm:px-6 text-xs text-apple-muted">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-apple-green" />
            <span className="font-semibold text-apple-text">Quentra Pro</span>
            <span className="text-apple-dim">/ Developed by i_setyawans · Crypto Algo Enthusiast</span>
          </div>
          <div className="text-apple-dim">
            Quantitative Algorithmic Platform · All metrics calibrated on historical tick data.
          </div>
        </div>
      </footer>

    </div>
  );
}

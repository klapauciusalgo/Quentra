import React, { useState, useRef, useEffect } from 'react';
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
  Play,
  Pause,
  Activity,
  Radio,
  Sparkles,
  SlidersHorizontal,
  X
} from 'lucide-react';
import strategiesData from '../data/strategiesData.json';
import { useAuth } from '../context/AuthContext';

export default function LandingPage({ 
  ticker = { price: 77300, change_24h_pct: 0.5 }, 
  status = { binance_ws_connected: true },
  floor = null,
  theme = 'light',
  onToggleTheme,
  onEnterDashboard
}) {
  const { isAuthenticated, user, openAuthModal } = useAuth();
  const [activeCategory, setActiveCategory] = useState('ALL'); // ALL, LONG, SHORT, MACRO
  const [heroTab, setHeroTab] = useState('motion'); // 'motion' | 'chart' | 'alpha' | 'risk'
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState(null);
  const videoRef = useRef(null);

  const isPositive = (ticker?.change_24h_pct || 0) >= 0;

  // Toggle video playback
  const toggleVideoPlayback = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsVideoPlaying(true);
    } else {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    }
  };

  // Filter strategies for the showcase grid
  const filteredStrategies = strategiesData.filter((s) => {
    if (activeCategory === 'LONG') return s.type === 'LONG' && s.id !== 'pure-macro-weekly-ma55';
    if (activeCategory === 'SHORT') return s.type === 'SHORT';
    if (activeCategory === 'MACRO') return s.id === 'pure-macro-weekly-ma55';
    return true;
  });

  const handleLaunch = (stratId = null) => {
    playRetroSound('select');
    if (!isAuthenticated) {
      // User must create or have an account to enter the terminal
      openAuthModal(stratId ? `/app?strategy=${stratId}` : '/app');
      return;
    }
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

          {/* Center Links */}
          <nav className="hidden lg:flex items-center gap-6 text-xs text-apple-muted font-medium">
            <a href="#motion" className="hover:text-apple-text transition-colors">System In Motion</a>
            <a href="#features" className="hover:text-apple-text transition-colors">Core Features</a>
            <a href="#strategies" className="hover:text-apple-text transition-colors">8 Quant Algos</a>
            <a href="#risk" className="hover:text-apple-text transition-colors">Capital Defense</a>
          </nav>

          {/* Right Action Bar: Live Ticker + Theme + CTA */}
          <div className="flex items-center gap-2.5 sm:gap-3">
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
              aria-label="Toggle theme mode"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-apple-orange" />
              ) : (
                <Moon className="w-4 h-4 text-apple-blue" />
              )}
            </button>

            {/* Authentication Status & Terminal CTA */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] rounded-full text-xs">
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-apple-blue/20 text-apple-blue flex items-center justify-center text-[10px] font-bold">
                      {user?.full_name?.charAt(0) || 'T'}
                    </div>
                  )}
                  <span className="hidden sm:inline font-medium text-apple-text max-w-[110px] truncate">
                    {user?.full_name}
                  </span>
                </div>
                <button
                  onClick={() => handleLaunch()}
                  className="px-4 py-2 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <span>Launch Terminal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuthModal('/app')}
                  className="hidden sm:block px-3 py-1.5 text-xs font-medium text-apple-muted hover:text-apple-text transition-colors cursor-pointer"
                >
                  Masuk
                </button>
                <button
                  onClick={() => handleLaunch()}
                  className="px-4 py-2 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow-md"
                >
                  <span>Launch Terminal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* 2. Hero Section: Cinematic Split-Screen with Motion Video Terminal Hub */}
      <section className="relative overflow-hidden pt-8 pb-16 md:pt-14 md:pb-20 px-4 sm:px-6 min-h-[90dvh] flex flex-col justify-center">
        {/* Subtle Ambient Radial Glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-apple-blue/10 dark:bg-apple-blue/15 rounded-full blur-[140px] pointer-events-none -z-10 animate-glow" />

        <div className="max-w-[1500px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Direct Value Proposition (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-bold tracking-tight text-apple-text leading-[1.08]">
              Algorithmic Bitcoin Execution Built on Empirical Proof.
            </h1>

            <p className="text-sm sm:text-base text-apple-muted leading-relaxed max-w-[55ch]">
              Systematic Smart Money breakouts with weekly trend regime filters, strict hard stops, and autonomous breakeven risk elimination.
            </p>

            {/* Dual CTA Actions */}
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
                Explore 8 Models ↓
              </a>
            </div>

            {/* Quantitative Proof Strip */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.08]">
              <div className="apple-glass rounded-2xl p-3.5">
                <div className="text-[11px] text-apple-muted font-medium">Audited Models</div>
                <div className="text-lg font-bold text-apple-text font-mono mt-0.5">8 Algos</div>
                <div className="text-[10px] text-apple-dim">Long · Short · Macro</div>
              </div>

              <div className="apple-glass rounded-2xl p-3.5">
                <div className="text-[11px] text-apple-muted font-medium">Ground Truth</div>
                <div className="text-lg font-bold text-apple-cyan font-mono mt-0.5">117,338</div>
                <div className="text-[10px] text-apple-dim">Historical 30M Bars</div>
              </div>

              <div className="apple-glass rounded-2xl p-3.5">
                <div className="text-[11px] text-apple-muted font-medium">Liquidation Rate</div>
                <div className="text-lg font-bold text-apple-green font-mono mt-0.5">0.0%</div>
                <div className="text-[10px] text-apple-dim">Hard Stop Guarded</div>
              </div>
            </div>
          </div>

          {/* Right Column: Motion Video & Dynamic Command Center (7 Cols) */}
          <div className="lg:col-span-7">
            <div className="apple-glass rounded-3xl p-3 sm:p-4 space-y-3 shadow-2xl border border-black/10 dark:border-white/15 relative">
              
              {/* Window Header with Tab Controls & Traffic Lights */}
              <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-3 px-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-apple-red/80" />
                  <span className="w-3 h-3 rounded-full bg-apple-orange/80" />
                  <span className="w-3 h-3 rounded-full bg-apple-green/80" />
                  <span className="text-xs font-mono text-apple-muted ml-2 hidden sm:inline">
                    quentra.terminal/live-feed
                  </span>
                </div>

                {/* Interactive Preview View Switcher */}
                <div className="flex items-center gap-1 bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-xl text-[11px]">
                  <button
                    onClick={() => setHeroTab('motion')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                      heroTab === 'motion'
                        ? 'bg-apple-blue text-white shadow-sm'
                        : 'text-apple-muted hover:text-apple-text'
                    }`}
                  >
                    <Activity className="w-3 h-3" />
                    <span>Live Motion</span>
                  </button>
                  <button
                    onClick={() => setHeroTab('chart')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                      heroTab === 'chart'
                        ? 'bg-apple-blue text-white shadow-sm'
                        : 'text-apple-muted hover:text-apple-text'
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    <span>Chart HUD</span>
                  </button>
                  <button
                    onClick={() => setHeroTab('alpha')}
                    className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1 ${
                      heroTab === 'alpha'
                        ? 'bg-apple-blue text-white shadow-sm'
                        : 'text-apple-muted hover:text-apple-text'
                    }`}
                  >
                    <TrendingUp className="w-3 h-3" />
                    <span>Alpha</span>
                  </button>
                </div>
              </div>

              {/* Viewport Display Area */}
              <div className="relative group overflow-hidden rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-black aspect-[16/9] flex items-center justify-center">
                
                {/* 1. Motion Video Tab View */}
                {heroTab === 'motion' && (
                  <div className="relative w-full h-full">
                    <video
                      ref={videoRef}
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover opacity-90"
                    >
                      <source src="/videos/hero_quant_motion.mp4" type="video/mp4" />
                      <source src="/videos/hero_quant_motion.webm" type="video/webm" />
                    </video>

                    {/* Dark gradient overlay for HUD legibility */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

                    {/* Top-left Telemetry Tag */}
                    <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-xl flex items-center gap-2 text-[11px] text-white font-mono">
                      <span className="w-2 h-2 rounded-full bg-apple-green animate-ping" />
                      <span className="font-semibold text-apple-cyan">AUTONOMOUS ENGINE ACTIVE</span>
                      <span className="text-white/60">· Latency &lt;42ms</span>
                    </div>

                    {/* Play / Pause Video Control Button */}
                    <button
                      onClick={toggleVideoPlayback}
                      className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
                      title={isVideoPlaying ? 'Pause ambient motion' : 'Play ambient motion'}
                    >
                      {isVideoPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>

                    {/* Floating Signal Notification Card on Video */}
                    <div className="absolute bottom-3 left-3 right-3 bg-black/75 backdrop-blur-xl border border-white/15 rounded-xl p-3 flex items-center justify-between gap-3 text-white">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-apple-green/20 border border-apple-green/40 flex items-center justify-center text-apple-green shrink-0">
                          <Zap className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            Pippo 30M Short V2 Type A
                          </div>
                          <div className="text-[10px] text-white/60 flex items-center gap-2">
                            <span>Target: $76,240</span>
                            <span>·</span>
                            <span>Hard Stop: -5.0%</span>
                            <span>·</span>
                            <span className="text-apple-green">Breakeven Locked</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleLaunch('pippo-30m-short-v2-a')}
                        className="px-3 py-1.5 bg-apple-blue hover:bg-blue-600 text-white text-xs font-semibold rounded-lg shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Launch</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Candlestick Chart HUD Tab View */}
                {heroTab === 'chart' && (
                  <div className="relative w-full h-full">
                    <img
                      src="/snapshots/chart_preview.png"
                      alt="Quentra Candlestick Terminal"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 right-3">
                      <button
                        onClick={() => handleLaunch()}
                        className="px-4 py-2 bg-apple-blue text-white rounded-xl text-xs font-semibold shadow-lg flex items-center gap-1.5 cursor-pointer hover:bg-blue-600 transition-colors"
                      >
                        <span>Open Interactive Chart</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Alpha Visualizer Tab View */}
                {heroTab === 'alpha' && (
                  <div className="relative w-full h-full">
                    <img
                      src="/snapshots/algo_vs_btc_preview.png"
                      alt="Quentra Alpha Curve"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-3 right-3">
                      <button
                        onClick={() => handleLaunch()}
                        className="px-4 py-2 bg-apple-blue text-white rounded-xl text-xs font-semibold shadow-lg flex items-center gap-1.5 cursor-pointer hover:bg-blue-600 transition-colors"
                      >
                        <span>Inspect Alpha Spread</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Bottom Quick Control Bar */}
              <div className="flex items-center justify-between text-xs text-apple-muted px-2 pt-1">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-apple-green shadow-[0_0_8px_rgba(48,209,88,0.6)]" />
                  <span className="font-mono text-[11px]">Direct Binance Feed · Real-time Ticks</span>
                </div>
                <button
                  onClick={() => handleLaunch()}
                  className="text-apple-blue hover:underline font-medium text-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>Enter Full Platform</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* 3. Kinetic Telemetry Marquee Ribbon (Taste-Skill: exactly 1 marquee on the page) */}
      <div className="border-y border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] overflow-hidden py-3 text-xs font-mono select-none">
        <div className="animate-marquee whitespace-nowrap flex items-center gap-8 text-apple-muted">
          <span>BTC/USDT LIVE STREAM</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-text font-semibold">8 AUDITED MODELS</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-green font-semibold">0.0% LIQUIDATION TRACK RECORD</span>
          <span className="text-apple-dim">·</span>
          <span>WEEKLY MA55 REGIME FILTER</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-cyan font-semibold">117,338 BARS GROUND TRUTH</span>
          <span className="text-apple-dim">·</span>
          <span>LATENCY &lt;50MS</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-text font-semibold">ZERO BLACK BOX CLAIMS</span>
          <span className="text-apple-dim">·</span>
          <span>SYSTEMATIC SMART MONEY CONCEPTS</span>
          <span className="text-apple-dim">·</span>
          {/* Duplicate set for seamless continuous marquee */}
          <span>BTC/USDT LIVE STREAM</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-text font-semibold">8 AUDITED MODELS</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-green font-semibold">0.0% LIQUIDATION TRACK RECORD</span>
          <span className="text-apple-dim">·</span>
          <span>WEEKLY MA55 REGIME FILTER</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-cyan font-semibold">117,338 BARS GROUND TRUTH</span>
          <span className="text-apple-dim">·</span>
          <span>LATENCY &lt;50MS</span>
          <span className="text-apple-dim">·</span>
          <span className="text-apple-text font-semibold">ZERO BLACK BOX CLAIMS</span>
          <span className="text-apple-dim">·</span>
          <span>SYSTEMATIC SMART MONEY CONCEPTS</span>
          <span className="text-apple-dim">·</span>
        </div>
      </div>

      {/* 4. "System In Motion" Showcase Section */}
      <section id="motion" className="py-16 md:py-24 px-4 sm:px-6 bg-apple-surface/40 border-b border-apple-border">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              Systematic Precision in Real-Time Motion.
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted leading-relaxed max-w-[60ch]">
              Quentra operates as an autonomous mathematical execution engine. Every order block breakout is governed by strict regime checks, hard stop-losses, and dynamic profit-protection ratchets.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Cinematic Motion Video Viewport (7 Cols) */}
            <div className="lg:col-span-7">
              <div className="apple-glass rounded-3xl p-3 shadow-2xl border border-black/10 dark:border-white/15 overflow-hidden">
                <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-black">
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  >
                    <source src="/videos/hero_quant_motion.mp4" type="video/mp4" />
                    <source src="/videos/hero_quant_motion.webm" type="video/webm" />
                  </video>
                  <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] font-mono text-apple-cyan border border-white/10">
                    60 FPS KINETIC STREAM · PIPPO RUNNER ENGINE
                  </div>
                </div>
              </div>
            </div>

            {/* 4-Step Algorithmic Pipeline (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              
              <div className="apple-glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-apple-blue">
                  <span className="w-5 h-5 rounded-md bg-apple-blue/15 flex items-center justify-center font-mono text-[10px]">1</span>
                  <span>Multi-Timeframe Invariant Check</span>
                </div>
                <p className="text-xs text-apple-muted pl-7">
                  Synchronizes 30m, 1h, 4h, 1D, and 1W bars simultaneously. Ensures no trade fires on incomplete or unverified candle closures.
                </p>
              </div>

              <div className="apple-glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-apple-cyan">
                  <span className="w-5 h-5 rounded-md bg-apple-cyan/15 flex items-center justify-center font-mono text-[10px]">2</span>
                  <span>Weekly MA55 Macro Regime Gate</span>
                </div>
                <p className="text-xs text-apple-muted pl-7">
                  Long breakouts are strictly suppressed when Bitcoin trades below the Weekly MA55 line, shielding capital during bear market drawdowns.
                </p>
              </div>

              <div className="apple-glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-apple-green">
                  <span className="w-5 h-5 rounded-md bg-apple-green/15 flex items-center justify-center font-mono text-[10px]">3</span>
                  <span>Order Block Breakout Trigger</span>
                </div>
                <p className="text-xs text-apple-muted pl-7">
                  Detects 36-bar local liquidity transitions and institutional order blocks. Executes with deterministic latency under 50 milliseconds.
                </p>
              </div>

              <div className="apple-glass rounded-2xl p-4 space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-apple-orange">
                  <span className="w-5 h-5 rounded-md bg-apple-orange/15 flex items-center justify-center font-mono text-[10px]">4</span>
                  <span>Automated Breakeven Ratchet</span>
                </div>
                <p className="text-xs text-apple-muted pl-7">
                  As soon as price expands +1.5% to +5.0% into profit, the hard stop loss automatically ratchets up to entry price, guaranteeing a zero-risk trade.
                </p>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* 5. Core Features Architecture (The 4 Specialized Pillars) */}
      <section id="features" className="py-16 md:py-24 border-b border-apple-border px-4 sm:px-6">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          <div className="max-w-2xl space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              Four Specialized Pillars of Algorithmic Trading
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted leading-relaxed">
              Every interface in Quentra is designed for quantitative rigor, zero guesswork, and total auditability.
            </p>
          </div>

          {/* 4 Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            
            {/* Pillar 1: High-Speed Candlestick Terminal & Signal HUD */}
            <div className="apple-glass rounded-3xl p-5 md:p-6 space-y-4 hover:border-apple-blue/40 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-blue/10 text-apple-blue flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-apple-text">
                  High-Speed Candlestick Terminal & On-Chart Signal HUD
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Interactive multi-timeframe chart with exact historical buy and sell markers plotted on the bars. Inspect entry prices, exit targets, and trade durations in real time.
                </p>
              </div>

              <div 
                onClick={() => setSelectedPreviewImage('/snapshots/chart_preview.png')}
                className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 cursor-pointer aspect-[16/10] bg-black"
              >
                <img 
                  src="/snapshots/chart_preview.png" 
                  alt="Candlestick Terminal Preview" 
                  className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
                  <span className="px-3 py-1.5 rounded-xl bg-white/90 text-black text-xs font-semibold shadow-md flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand High-Res Snapshot</span>
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleLaunch()}
                  className="text-xs text-apple-blue hover:text-blue-600 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Launch Interactive Chart</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pillar 2: Empirical Alpha & Comparative Benchmark */}
            <div className="apple-glass rounded-3xl p-5 md:p-6 space-y-4 hover:border-apple-green/40 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-green/10 text-apple-green flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-apple-text">
                  Empirical Alpha & Comparative Benchmark Visualizer
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Side-by-side equity comparison of algorithmic trading against passive Bitcoin buy-and-hold. Includes granular Alpha Spread line chart with zero-baseline tracking.
                </p>
              </div>

              <div 
                onClick={() => setSelectedPreviewImage('/snapshots/algo_vs_btc_preview.png')}
                className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 cursor-pointer aspect-[16/10] bg-black"
              >
                <img 
                  src="/snapshots/algo_vs_btc_preview.png" 
                  alt="Comparative Alpha Visualizer Preview" 
                  className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
                  <span className="px-3 py-1.5 rounded-xl bg-white/90 text-black text-xs font-semibold shadow-md flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand High-Res Snapshot</span>
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleLaunch()}
                  className="text-xs text-apple-green hover:text-green-600 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Inspect Alpha Performance</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pillar 3: Verifiable Closed Trade Logs & Execution Audit */}
            <div className="apple-glass rounded-3xl p-5 md:p-6 space-y-4 hover:border-apple-orange/40 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-orange/10 text-apple-orange flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-apple-text">
                  Verifiable Closed Trade Logs & Execution Audit
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Zero black-box claims. Filter trades by year, win/loss status, and search specific exit triggers. Every transaction details entry price, exit price, and net return after fees.
                </p>
              </div>

              <div 
                onClick={() => setSelectedPreviewImage('/snapshots/trade_logs_preview.png')}
                className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 cursor-pointer aspect-[16/10] bg-black"
              >
                <img 
                  src="/snapshots/trade_logs_preview.png" 
                  alt="Trade Logs Audit Preview" 
                  className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
                  <span className="px-3 py-1.5 rounded-xl bg-white/90 text-black text-xs font-semibold shadow-md flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand High-Res Snapshot</span>
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleLaunch()}
                  className="text-xs text-apple-orange hover:text-orange-600 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>View Full Trade History</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Pillar 4: Leverage & Liquidation Safety Architecture */}
            <div className="apple-glass rounded-3xl p-5 md:p-6 space-y-4 hover:border-apple-cyan/40 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-apple-cyan/10 text-apple-cyan flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-lg md:text-xl font-bold text-apple-text">
                  Leverage & Liquidation Safety Architecture
                </h3>
                <p className="text-xs text-apple-muted leading-relaxed">
                  Simulate empirical compounding across 4 margin tiers and custom leverage sliders. Calculates dynamic liquidation mark prices and proves mathematical safety buffers over hard stops.
                </p>
              </div>

              <div 
                onClick={() => setSelectedPreviewImage('/snapshots/risk_architecture_preview.png')}
                className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/10 cursor-pointer aspect-[16/10] bg-black"
              >
                <img 
                  src="/snapshots/risk_architecture_preview.png" 
                  alt="Risk Architecture Preview" 
                  className="w-full h-full object-cover transform transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
                  <span className="px-3 py-1.5 rounded-xl bg-white/90 text-black text-xs font-semibold shadow-md flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Expand High-Res Snapshot</span>
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => handleLaunch()}
                  className="text-xs text-apple-cyan hover:text-cyan-600 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Simulate Leverage Risk</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* 6. Quantitative Strategy Directory (8 Audited Models) */}
      <section id="strategies" className="py-16 md:py-24 px-4 sm:px-6">
        <div className="max-w-[1400px] mx-auto space-y-10">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
                8 Quantitative Models Calibrated for Every Market Cycle
              </h2>
              <p className="text-xs sm:text-sm text-apple-muted leading-relaxed">
                Choose between long-only momentum runners, macro cycle followers, and tactical short breakdown exploitations.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-black/[0.04] dark:bg-white/[0.05] border border-black/10 dark:border-white/10 p-1 rounded-2xl self-start md:self-auto">
              {[
                { id: 'ALL', label: 'All Models (8)' },
                { id: 'LONG', label: 'Long Momentum (4)' },
                { id: 'SHORT', label: 'Short Breakdowns (3)' },
                { id: 'MACRO', label: 'Macro Cycle (1)' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    playRetroSound('select');
                    setActiveCategory(tab.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                    activeCategory === tab.id
                      ? 'bg-apple-surface text-apple-text shadow-sm'
                      : 'text-apple-muted hover:text-apple-text'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {filteredStrategies.map((strat) => {
              const isLong = strat.type === 'LONG';
              const isMacro = strat.id === 'pure-macro-weekly-ma55';
              const totalRet = strat.metrics?.total_return_pct ?? 0;
              const winRate = strat.metrics?.win_rate_pct ?? 0;
              const profitFactor = strat.metrics?.profit_factor ?? 1.0;
              const hardStop = strat.parameters?.hard_stop_loss_pct ?? 5.0;

              return (
                <div 
                  key={strat.id}
                  className="apple-glass rounded-3xl p-5 space-y-4 hover:border-black/20 dark:hover:border-white/25 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        isMacro
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          : isLong
                          ? 'bg-apple-green/10 text-apple-green border border-apple-green/20'
                          : 'bg-apple-red/10 text-apple-red border border-apple-red/20'
                      }`}>
                        {isMacro ? 'Macro Dual' : strat.type}
                      </span>
                      <span className="text-[11px] font-mono text-apple-dim">
                        {strat.timeframe} Cadence
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-base text-apple-text">
                        {strat.name}
                      </h4>
                      <p className="text-[11px] text-apple-muted line-clamp-2 mt-1 leading-relaxed">
                        {strat.logic_summary}
                      </p>
                    </div>

                    {/* Stats Matrix */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
                      <div>
                        <div className="text-[10px] text-apple-dim">Total Return</div>
                        <div className={`text-sm font-bold font-mono ${totalRet >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                          {totalRet > 0 ? '+' : ''}{Number(totalRet).toLocaleString()}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-apple-dim">Win Rate</div>
                        <div className="text-sm font-bold font-mono text-apple-text">
                          {Number(winRate).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-apple-dim">Profit Factor</div>
                        <div className="text-xs font-semibold font-mono text-apple-text">
                          {Number(profitFactor).toFixed(2)}x
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-apple-dim">Hard Stop</div>
                        <div className="text-xs font-semibold font-mono text-apple-red">
                          {isMacro ? 'Weekly Close cross MA55' : `${Number(hardStop).toFixed(1)}%`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleLaunch(strat.id)}
                    className="w-full py-2.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-apple-blue hover:text-white dark:hover:bg-apple-blue active:scale-[0.98] border border-black/10 dark:border-white/10 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-apple-text"
                  >
                    <span>Launch with {strat.short_name || strat.name}</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* 7. Capital Defense Architecture */}
      <section id="risk" className="py-16 md:py-24 bg-apple-surface/40 border-y border-apple-border px-4 sm:px-6">
        <div className="max-w-[1400px] mx-auto space-y-12">
          
          <div className="max-w-3xl space-y-3">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              The Three Non-Negotiable Pillars of Capital Defense
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted leading-relaxed max-w-[65ch]">
              Why Quentra has maintained a 0.0% liquidation rate across 6 years of volatile crypto cycles.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            <div className="apple-glass rounded-3xl p-6 space-y-4">
              <div className="w-10 h-10 rounded-2xl bg-apple-blue/10 text-apple-blue flex items-center justify-center font-bold text-sm">
                01
              </div>
              <h3 className="text-base font-bold text-apple-text">
                Macro Moving Average Regime Filter
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                Longs are strictly blocked whenever Bitcoin trades below the 4H SMA 111 or Weekly MA 55. This single mathematical filter eliminates 80% of whipsaws during bear markets and preserves cash.
              </p>
            </div>

            <div className="apple-glass rounded-3xl p-6 space-y-4">
              <div className="w-10 h-10 rounded-2xl bg-apple-red/10 text-apple-red flex items-center justify-center font-bold text-sm">
                02
              </div>
              <h3 className="text-base font-bold text-apple-text">
                Hard Stop Loss on Every Trade
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                Every execution carries an invariant hard stop (5% to 15% depending on cadence). No mental stops, no averaging down, and no hope trading. Capital preservation is prioritized over win rate vanity.
              </p>
            </div>

            <div className="apple-glass rounded-3xl p-6 space-y-4">
              <div className="w-10 h-10 rounded-2xl bg-apple-green/10 text-apple-green flex items-center justify-center font-bold text-sm">
                03
              </div>
              <h3 className="text-base font-bold text-apple-text">
                Rapid Breakeven Risk Elimination
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                As soon as a trade achieves initial expansion (+1.5% to +5.0%), the stop loss automatically advances to the entry price (+0.2% to cover taker fees), unlocking a zero-risk ride for trend runners.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* 8. Conversion Section */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-[1000px] mx-auto apple-glass rounded-3xl p-8 md:p-14 text-center space-y-6 shadow-2xl border border-black/10 dark:border-white/15">
          <div className="space-y-2">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-apple-text">
              Experience Verified Algorithmic Execution Today.
            </h2>
            <p className="text-xs sm:text-sm text-apple-muted max-w-xl mx-auto leading-relaxed">
              Open the full trading terminal, explore candlestick markers, inspect trade logs, and simulate leverage safety models with zero barriers.
            </p>
          </div>

          <div className="pt-2">
            <button
              onClick={() => handleLaunch()}
              className="px-8 py-4 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-sm font-semibold rounded-2xl inline-flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-xl"
            >
              <span>Launch Trading Terminal</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-6 text-[11px] text-apple-dim pt-4">
            <span>Direct Binance WebSocket</span>
            <span>·</span>
            <span>2020-2026 Ground Truth</span>
            <span>·</span>
            <span>Zero Emotional Bias</span>
          </div>
        </div>
      </section>

      {/* 9. Minimal Institutional Footer */}
      <footer className="border-t border-apple-border bg-apple-surface/40 py-8 px-4 sm:px-6 text-xs text-apple-muted">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-apple-green" />
            <span className="font-semibold text-apple-text">Quentra Pro</span>
            <span className="text-apple-dim">/ Developed by i_setyawans · Crypto Algo Enthusiast</span>
          </div>
          <div className="text-apple-dim text-[11px]">
            Quantitative Algorithmic Platform · All metrics calibrated on historical tick data.
          </div>
        </div>
      </footer>

      {/* Snapshot Preview Modal */}
      {selectedPreviewImage && (
        <div 
          onClick={() => setSelectedPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-5xl w-full bg-apple-surface rounded-3xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/15"
          >
            <div className="flex items-center justify-between p-4 border-b border-apple-border">
              <span className="text-xs font-semibold text-apple-text">
                High-Resolution Platform Snapshot
              </span>
              <button
                onClick={() => setSelectedPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-apple-muted hover:text-apple-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 bg-black">
              <img 
                src={selectedPreviewImage} 
                alt="Enlarged Platform Preview" 
                className="w-full h-auto rounded-xl"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

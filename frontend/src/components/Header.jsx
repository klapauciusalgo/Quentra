import React, { useState, useEffect } from 'react';
import { formatPrice, formatPercent, playRetroSound, isAudioEnabled, toggleAudio } from '../utils/formatters';
import { Radio, Volume2, VolumeX, Zap, Activity, Clock, ShieldCheck } from 'lucide-react';

export default function Header({ ticker, status, floor, onSimulateSignal }) {
  const [audioActive, setAudioActive] = useState(true);
  const [priceFlash, setPriceFlash] = useState(null);
  const [prevPrice, setPrevPrice] = useState(ticker?.price || 0);

  useEffect(() => {
    if (ticker?.price && ticker.price !== prevPrice) {
      setPriceFlash(ticker.price > prevPrice ? 'up' : 'down');
      setPrevPrice(ticker.price);
      const t = setTimeout(() => setPriceFlash(null), 800);
      return () => clearTimeout(t);
    }
  }, [ticker?.price]);

  const handleAudioToggle = () => {
    const next = toggleAudio();
    setAudioActive(next);
    if (next) playRetroSound('blip');
  };

  const isPositive = (ticker?.change_24h_pct || 0) >= 0;

  return (
    <header className="border-b-2 border-floor-border bg-floor-darker px-4 py-2.5 sticky top-0 z-40">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-3">
          <div className="relative w-9 h-9 bg-floor-wall border-2 border-signal-cyan flex items-center justify-center shadow-pixel-cyan">
            {/* 16-bit mini floor logo */}
            <div className="grid grid-cols-3 gap-0.5 w-5 h-5">
              <span className="bg-signal-cyan"></span>
              <span className="bg-signal-bull"></span>
              <span className="bg-signal-cyan"></span>
              <span className="bg-floor-bg"></span>
              <span className="bg-signal-warn"></span>
              <span className="bg-floor-bg"></span>
              <span className="bg-signal-bear"></span>
              <span className="bg-signal-cyan"></span>
              <span className="bg-signal-bull"></span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-pixel text-xs md:text-sm text-retro-text tracking-wider">
                QUIET<span className="text-signal-cyan">ALGO</span>
              </h1>
              <span className="bg-signal-cyan/10 border border-signal-cyan/40 text-signal-cyan font-mono text-[10px] px-1.5 py-0.5 rounded-none font-bold">
                v2.6 PRO
              </span>
            </div>
            <p className="text-[11px] text-retro-muted font-mono hidden sm:block">
              Algorithmic Strategy Hub & Real-Time Analytics
            </p>
          </div>
        </div>

        {/* Live BTC Ticker & 24h Stats */}
        <div className="flex items-center gap-4 bg-floor-bg border border-floor-border px-3 py-1.5 rounded-none">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-signal-warn">BTC/USDT</span>
            <span
              className={`font-mono font-bold text-sm md:text-base tracking-tight transition-colors duration-200 ${
                priceFlash === 'up'
                  ? 'text-signal-bull'
                  : priceFlash === 'down'
                  ? 'text-signal-bear'
                  : 'text-retro-text'
              }`}
            >
              {formatPrice(ticker?.price || 77300)}
            </span>
          </div>

          <div
            className={`font-mono text-xs font-semibold px-2 py-0.5 border ${
              isPositive
                ? 'text-signal-bull border-signal-bull/30 bg-signal-bull/10'
                : 'text-signal-bear border-signal-bear/30 bg-signal-bear/10'
            }`}
          >
            {formatPercent(ticker?.change_24h_pct || 0)}
          </div>

          <div className="hidden lg:flex items-center gap-3 text-[11px] font-mono text-retro-muted border-l border-floor-border pl-3">
            <div>
              <span className="text-retro-dim">24h High: </span>
              <span className="text-retro-text">{formatPrice(ticker?.high_24h || 79800)}</span>
            </div>
            <div>
              <span className="text-retro-dim">24h Low: </span>
              <span className="text-retro-text">{formatPrice(ticker?.low_24h || 76100)}</span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Market Session */}
          <div className="hidden md:flex items-center gap-1.5 bg-floor-wall/80 border border-floor-border px-2.5 py-1 text-[11px] font-mono text-retro-muted">
            <Clock className="w-3.5 h-3.5 text-signal-warn" />
            <span>{floor?.session?.name || 'Asia / Global Market'}</span>
          </div>

          {/* Binance WS Live Badge */}
          <div className="flex items-center gap-1.5 bg-floor-wall border border-floor-border px-2.5 py-1 text-[11px] font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                status?.binance_ws_connected
                  ? 'bg-signal-bull animate-pulse shadow-pixel-green'
                  : 'bg-signal-warn animate-pulse'
              }`}
            />
            <span className="hidden sm:inline text-retro-muted">BINANCE WS:</span>
            <span
              className={`font-bold ${
                status?.binance_ws_connected ? 'text-signal-bull' : 'text-signal-warn'
              }`}
            >
              {status?.binance_ws_connected ? 'LIVE' : 'RECONNECTING'}
            </span>
          </div>

          {/* Dispatch Test Signal */}
          <button
            onClick={() => {
              playRetroSound('signal');
              if (onSimulateSignal) onSimulateSignal();
            }}
            className="flex items-center gap-1.5 bg-signal-cyan/10 hover:bg-signal-cyan/20 border border-signal-cyan text-signal-cyan text-[11px] font-pixel px-2.5 py-1.5 transition-all shadow-pixel-cyan hover:scale-[1.02] active:scale-95"
            title="Dispatch a real-time signal alert to test the floor!"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DISPATCH</span>
          </button>

          {/* Audio Toggle */}
          <button
            onClick={handleAudioToggle}
            className="p-1.5 bg-floor-wall hover:bg-floor-border border border-floor-border text-retro-muted hover:text-retro-text transition-colors"
            title={audioActive ? 'Mute 8-bit sound effects' : 'Enable 8-bit sound effects'}
          >
            {audioActive ? (
              <Volume2 className="w-4 h-4 text-signal-cyan" />
            ) : (
              <VolumeX className="w-4 h-4 text-retro-dim" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
}

import React, { useState, useEffect } from 'react';
import { formatPrice, formatPercent, playRetroSound, isAudioEnabled, toggleAudio } from '../utils/formatters';
import { Volume2, VolumeX, Zap, Activity, Clock, ChevronDown, Check } from 'lucide-react';

export default function Header({ ticker, status, floor, onSimulateSignal }) {
  const [audioActive, setAudioActive] = useState(true);
  const [priceFlash, setPriceFlash] = useState(null);
  const [prevPrice, setPrevPrice] = useState(ticker?.price || 0);

  useEffect(() => {
    if (ticker?.price && ticker.price !== prevPrice) {
      setPriceFlash(ticker.price > prevPrice ? 'up' : 'down');
      setPrevPrice(ticker.price);
      const t = setTimeout(() => setPriceFlash(null), 600);
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
    <header className="sticky top-0 z-40 backdrop-blur-2xl bg-[#07080A]/80 border-b border-white/[0.08] transition-all">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand & Platform Identity */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.02] border border-white/15 flex items-center justify-center shadow-sm">
            <span className="w-3.5 h-3.5 rounded-sm bg-apple-blue flex items-center justify-center text-[9px] font-bold text-white">
              Q
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-base tracking-tight text-white">
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

        {/* Live BTC Ticker Telemetry */}
        <div className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] rounded-2xl px-3.5 py-1.5 transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-apple-muted tracking-wide">BTC/USDT</span>
            <span
              className={`font-mono text-sm md:text-base font-bold tabular-nums transition-colors duration-200 ${
                priceFlash === 'up'
                  ? 'text-apple-green'
                  : priceFlash === 'down'
                  ? 'text-apple-red'
                  : 'text-white'
              }`}
            >
              {formatPrice(ticker?.price || 77300)}
            </span>
          </div>

          <div
            className={`text-xs font-medium px-2 py-0.5 rounded-full border tabular-nums ${
              isPositive
                ? 'text-apple-green bg-apple-green/10 border-apple-green/20'
                : 'text-apple-red bg-apple-red/10 border-apple-red/20'
            }`}
          >
            {formatPercent(ticker?.change_24h_pct || 0)}
          </div>

          <div className="hidden xl:flex items-center gap-3 text-xs text-apple-muted border-l border-white/10 pl-3">
            <div>
              <span className="text-apple-dim">High: </span>
              <span className="text-zinc-200 font-mono tabular-nums">{formatPrice(ticker?.high_24h || 79800)}</span>
            </div>
            <div>
              <span className="text-apple-dim">Low: </span>
              <span className="text-zinc-200 font-mono tabular-nums">{formatPrice(ticker?.low_24h || 76100)}</span>
            </div>
          </div>
        </div>

        {/* Status Indicators & Tactile Controls */}
        <div className="flex items-center gap-2.5">
          {/* Market Session Pill */}
          <div className="hidden md:flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 text-xs text-apple-muted">
            <Clock className="w-3.5 h-3.5 text-apple-orange" />
            <span className="truncate max-w-[140px]">{floor?.session?.name || 'Asia Market'}</span>
          </div>

          {/* Binance WebSocket Status */}
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                status?.binance_ws_connected
                  ? 'bg-apple-green shadow-[0_0_8px_rgba(48,209,88,0.5)]'
                  : 'bg-apple-orange animate-pulse'
              }`}
            />
            <span className="hidden sm:inline text-apple-muted font-normal">Stream:</span>
            <span
              className={`font-medium ${
                status?.binance_ws_connected ? 'text-apple-green' : 'text-apple-orange'
              }`}
            >
              {status?.binance_ws_connected ? 'Live' : 'Syncing'}
            </span>
          </div>

          {/* Dispatch Simulated Signal Trigger */}
          <button
            onClick={() => {
              playRetroSound('signal');
              if (onSimulateSignal) onSimulateSignal();
            }}
            className="flex items-center gap-1.5 bg-white/[0.08] hover:bg-white/[0.14] active:scale-[0.98] border border-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer min-h-[34px]"
            title="Dispatch a real-time signal alert to test execution feed"
          >
            <Zap className="w-3.5 h-3.5 text-apple-cyan" />
            <span className="hidden sm:inline">Test Signal</span>
          </button>

          {/* Audio Haptics Toggle */}
          <button
            onClick={handleAudioToggle}
            className="w-8 h-8 rounded-full bg-white/[0.05] hover:bg-white/[0.1] active:scale-[0.96] border border-white/10 flex items-center justify-center text-apple-muted hover:text-white transition-all cursor-pointer min-w-[44px] min-h-[44px]"
            title={audioActive ? 'Mute haptic audio feedback' : 'Enable haptic audio feedback'}
            aria-label="Toggle audio"
          >
            {audioActive ? (
              <Volume2 className="w-4 h-4 text-apple-blue" />
            ) : (
              <VolumeX className="w-4 h-4 text-apple-dim" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
}

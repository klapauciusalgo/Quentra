import React, { useState, useEffect, useRef } from 'react';
import { formatPrice, formatPercent, playRetroSound, isAudioEnabled, toggleAudio } from '../utils/formatters';
import { Volume2, VolumeX, Zap, Sun, Moon, Compass, LogOut, User, ChevronDown, ShieldCheck } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';

export default function Header({ 
  ticker, 
  status, 
  floor, 
  theme = 'light',
  onToggleTheme,
  onSimulateSignal,
  activeSignals = [],
  notifications = [],
  onSelectStrategy,
  onCloseSignal,
  onClearNotifications,
  onGoToLanding,
  selectedAsset = 'BTCUSDT',
  onSelectAsset
}) {
  const { user, isAuthenticated, logout, openAuthModal } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const [audioActive, setAudioActive] = useState(true);
  const [priceFlash, setPriceFlash] = useState(null);
  const [prevPrice, setPrevPrice] = useState(ticker?.price || 0);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    <header className="sticky top-0 z-40 backdrop-blur-2xl bg-apple-canvas/80 border-b border-apple-border transition-colors duration-200">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Brand & Platform Identity */}
        <div 
          onClick={() => {
            if (onGoToLanding) {
              playRetroSound('blip');
              onGoToLanding();
            }
          }}
          className={`flex items-center gap-3 ${onGoToLanding ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
          title="Return to Product Overview & Landing Page"
        >
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

        {/* Asset Switcher & Live Ticker Telemetry */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* 1-Click Asset Switcher (BTC / ETH) */}
          <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.06] p-1 rounded-2xl border border-black/[0.08] dark:border-white/[0.08] shadow-inner">
            <button
              onClick={() => {
                if (selectedAsset !== 'BTCUSDT' && onSelectAsset) {
                  playRetroSound('select');
                  onSelectAsset('BTCUSDT');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                selectedAsset === 'BTCUSDT'
                  ? 'bg-apple-blue text-white shadow-md scale-[1.02]'
                  : 'text-apple-muted hover:text-apple-text hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              }`}
              title="Switch to Bitcoin (BTC/USDT)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
              <span>BTC</span>
            </button>
            <button
              onClick={() => {
                if (selectedAsset !== 'ETHUSDT' && onSelectAsset) {
                  playRetroSound('select');
                  onSelectAsset('ETHUSDT');
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                selectedAsset === 'ETHUSDT'
                  ? 'bg-apple-blue text-white shadow-md scale-[1.02]'
                  : 'text-apple-muted hover:text-apple-text hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
              }`}
              title="Switch to Ethereum (ETH/USDT)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              <span>ETH</span>
            </button>
          </div>

          {/* Live Ticker Telemetry */}
          <div className="flex items-center gap-3 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.08] rounded-2xl px-3.5 py-1.5 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-apple-muted tracking-wide">
                {selectedAsset === 'ETHUSDT' ? 'ETH/USDT' : 'BTC/USDT'}
              </span>
              <span
                className={`font-mono text-sm md:text-base font-bold tabular-nums transition-colors duration-200 ${
                  priceFlash === 'up'
                    ? 'text-apple-green'
                    : priceFlash === 'down'
                    ? 'text-apple-red'
                    : 'text-apple-text'
                }`}
              >
                {formatPrice(ticker?.price || (selectedAsset === 'ETHUSDT' ? 2750 : 77300))}
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

            <div className="hidden xl:flex items-center gap-3 text-xs text-apple-muted border-l border-black/10 dark:border-white/10 pl-3">
              <div>
                <span className="text-apple-dim">High: </span>
                <span className="text-apple-text font-mono tabular-nums">
                  {formatPrice(ticker?.high_24h || (selectedAsset === 'ETHUSDT' ? 2850 : 79800))}
                </span>
              </div>
              <div>
                <span className="text-apple-dim">Low: </span>
                <span className="text-apple-text font-mono tabular-nums">
                  {formatPrice(ticker?.low_24h || (selectedAsset === 'ETHUSDT' ? 2680 : 76100))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Indicators & Tactile Controls */}
        <div className="flex items-center gap-2.5">
          {/* Binance WebSocket Status */}
          <div className="flex items-center gap-1.5 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-full px-3 py-1 text-xs">
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

          {/* Active Signal Notification Bell Menu */}
          <NotificationBell
            activeSignals={activeSignals}
            notifications={notifications}
            currentBtcPrice={ticker?.price || (selectedAsset === 'ETHUSDT' ? 2650 : 77300)}
            onSelectStrategy={onSelectStrategy}
            onSimulateSignal={onSimulateSignal}
            onCloseSignal={onCloseSignal}
            onClearNotifications={onClearNotifications}
            selectedAsset={selectedAsset}
          />

          {/* Return to Landing Page Overview */}
          {onGoToLanding && (
            <button
              onClick={() => {
                playRetroSound('blip');
                onGoToLanding();
              }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-apple-muted hover:text-apple-text bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] border border-black/[0.08] dark:border-white/[0.08] rounded-full transition-colors cursor-pointer"
              title="Return to Product Overview Landing Page"
            >
              <Compass className="w-3.5 h-3.5 text-apple-blue" />
              <span>Overview</span>
            </button>
          )}

          {/* Theme Switcher: Light / Dark Toggle */}
          <button
            onClick={onToggleTheme}
            className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.96] border border-black/10 dark:border-white/10 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer min-w-[34px] min-h-[34px]"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme mode"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-apple-orange animate-in spin-in-180 duration-200" />
            ) : (
              <Moon className="w-4 h-4 text-apple-blue animate-in spin-in-180 duration-200" />
            )}
          </button>

          {/* Audio Haptics Toggle */}
          <button
            onClick={handleAudioToggle}
            className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.96] border border-black/10 dark:border-white/10 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer min-w-[34px] min-h-[34px]"
            title={audioActive ? 'Mute haptic audio feedback' : 'Enable haptic audio feedback'}
            aria-label="Toggle audio"
          >
            {audioActive ? (
              <Volume2 className="w-4 h-4 text-apple-blue" />
            ) : (
              <VolumeX className="w-4 h-4 text-apple-dim" />
            )}
          </button>

          {/* User Account / Profile Menu (US-05, FR-21) */}
          <div className="relative" ref={userMenuRef}>
            {isAuthenticated ? (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    playRetroSound('blip');
                    setShowUserMenu((prev) => !prev);
                  }}
                  className="flex items-center gap-2 p-1 pl-2 pr-2.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] border border-black/[0.08] dark:border-white/[0.08] rounded-full text-xs transition-all cursor-pointer"
                  title="Menu Profil Trader"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-apple-blue/20 text-apple-blue flex items-center justify-center text-[10px] font-bold">
                      {user?.full_name?.charAt(0) || 'T'}
                    </div>
                  )}
                  <span className="hidden md:inline font-medium text-apple-text max-w-[100px] truncate">
                    {user?.full_name}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-apple-dim transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Card */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 p-3 bg-white dark:bg-[#0C0D12] border border-black/10 dark:border-white/[0.12] rounded-2xl shadow-2xl text-xs space-y-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-xl border border-black/[0.06] dark:border-white/[0.06] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-apple-text truncate">{user?.full_name}</span>
                        <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-apple-blue/15 text-apple-blue">
                          {user?.provider === 'google' ? 'Google' : user?.provider === 'demo' ? 'Demo' : 'Email'}
                        </span>
                      </div>
                      <p className="text-[11px] text-apple-muted truncate">{user?.email}</p>
                    </div>

                    <div className="border-t border-apple-border/60 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          playRetroSound('select');
                          setShowUserMenu(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-apple-red hover:bg-apple-red/10 transition-colors font-medium cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Keluar / Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('/app')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-apple-blue hover:bg-blue-600 text-white rounded-full text-xs font-medium transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Masuk</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </header>
  );
}

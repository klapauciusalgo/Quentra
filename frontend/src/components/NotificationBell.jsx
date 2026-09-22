import React, { useState, useEffect, useRef } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  Bell, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Target, 
  Crosshair, 
  X, 
  Clock, 
  Zap,
  Activity,
  Trash2
} from 'lucide-react';

export default function NotificationBell({
  activeSignals = [],
  notifications = [],
  currentBtcPrice = 77300,
  onSelectStrategy,
  onSimulateSignal,
  onCloseSignal,
  onClearNotifications,
  selectedAsset = 'BTCUSDT'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard accessibility: ESC closes menu
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const activeCount = activeSignals.length;
  const hasActiveSignals = activeCount > 0;

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => {
          playRetroSound('blip');
          setIsOpen(!isOpen);
        }}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer min-w-[34px] min-h-[34px] relative active:scale-[0.96] ${
          isOpen
            ? 'bg-black/[0.08] dark:bg-white/[0.15] border-apple-blue text-apple-blue shadow-sm'
            : hasActiveSignals
            ? 'bg-apple-blue/10 border-apple-blue/40 text-apple-blue dark:text-apple-cyan hover:bg-apple-blue/20'
            : 'bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] border-black/10 dark:border-white/10 text-apple-muted hover:text-apple-text'
        }`}
        title={
          hasActiveSignals
            ? `${activeCount} Active Signal(s) Working (BUY/SELL)`
            : 'Signal Notifications'
        }
        aria-label="Signal Notifications"
      >
        <Bell className={`w-4 h-4 ${hasActiveSignals ? 'animate-bounce' : ''}`} />

        {/* Pulsing Notification Badge when Active Signals Exist */}
        {hasActiveSignals && (
          <>
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-apple-red animate-ping opacity-75 pointer-events-none" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-apple-red text-white text-[9px] font-bold flex items-center justify-center shadow-md font-mono pointer-events-none">
              {activeCount}
            </span>
          </>
        )}
      </button>

      {/* Flyout Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-11 w-80 sm:w-96 rounded-2xl bg-white/95 dark:bg-[#0E1017]/95 backdrop-blur-2xl border border-black/10 dark:border-white/15 shadow-2xl p-4 z-50 text-xs text-apple-text animate-in fade-in zoom-in-95 duration-150">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] pb-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-apple-blue/15 text-apple-blue dark:text-apple-cyan flex items-center justify-center">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="font-semibold text-xs tracking-tight flex items-center gap-1.5">
                  <span>Signal Notifications</span>
                  {hasActiveSignals && (
                    <span className="w-2 h-2 rounded-full bg-apple-green animate-pulse" />
                  )}
                </div>
                <div className="text-[10px] text-apple-muted">
                  {hasActiveSignals
                    ? `${activeCount} active position working`
                    : 'Autonomous Engine: Monitoring Market'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {notifications.length > 0 && onClearNotifications && (
                <button
                  onClick={() => {
                    playRetroSound('blip');
                    onClearNotifications();
                  }}
                  className="p-1 text-apple-muted hover:text-apple-red rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                  title="Clear history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-apple-muted hover:text-apple-text rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[70vh] overflow-y-auto space-y-3 pr-0.5">
            
            {/* 1. ACTIVE LIVE SIGNALS SECTION (In-Position BUY / SELL) */}
            <div>
              <div className="text-[10px] font-semibold text-apple-dim uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Active Executions (Buy / Sell)</span>
                {hasActiveSignals && (
                  <span className="text-[10px] text-apple-green font-mono">
                    ● Live Position
                  </span>
                )}
              </div>

              {hasActiveSignals ? (
                <div className="space-y-2">
                  {activeSignals.map((sig) => {
                    const isBuy = sig.action === 'BUY' || sig.direction === 'LONG';
                    const entryPrice = sig.entry_price || currentBtcPrice;
                    const markPrice = currentBtcPrice || entryPrice;
                    
                    // Dynamic Live Floating PnL calculation
                    const floatingPnl = isBuy
                      ? ((markPrice - entryPrice) / entryPrice) * 100
                      : ((entryPrice - markPrice) / entryPrice) * 100;
                    
                    const isPnlPositive = floatingPnl >= 0;

                    return (
                      <div
                        key={sig.id || sig.strategy_id}
                        className={`rounded-xl border p-3 transition-all ${
                          isBuy
                            ? 'bg-apple-green/[0.04] border-apple-green/30 dark:bg-apple-green/[0.06]'
                            : 'bg-apple-red/[0.04] border-apple-red/30 dark:bg-apple-red/[0.06]'
                        }`}
                      >
                        {/* Signal Status & Direction */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                                isBuy
                                  ? 'bg-apple-green/15 text-apple-green border-apple-green/30'
                                  : 'bg-apple-red/15 text-apple-red border-apple-red/30'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" />
                              {isBuy ? '▲ BUY ACTIVE' : '▼ SELL ACTIVE'}
                            </span>
                            <span className="text-[10px] text-apple-muted font-medium px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06]">
                              {sig.timeframe || '1h'}
                            </span>
                          </div>

                          <div
                            className={`font-mono text-xs font-bold tabular-nums ${
                              isPnlPositive ? 'text-apple-green' : 'text-apple-red'
                            }`}
                          >
                            {isPnlPositive ? '+' : ''}
                            {floatingPnl.toFixed(2)}%
                          </div>
                        </div>

                        {/* Strategy Info */}
                        <div className="font-semibold text-apple-text text-xs tracking-tight mb-2">
                          {sig.strategy_name || 'Autonomous Strategy'}
                        </div>

                        {/* Price Execution Metrics */}
                        <div className="grid grid-cols-2 gap-2 bg-black/[0.03] dark:bg-white/[0.04] rounded-lg p-2 text-[11px] mb-2.5">
                          <div>
                            <span className="text-apple-dim text-[10px] block">Entry Price:</span>
                            <span className="font-mono font-medium text-apple-text tabular-nums">
                              {formatPrice(entryPrice)}
                            </span>
                          </div>
                          <div>
                            <span className="text-apple-dim text-[10px] block">Current Mark:</span>
                            <span className="font-mono font-medium text-apple-text tabular-nums">
                              {formatPrice(markPrice)}
                            </span>
                          </div>
                          {sig.stop_loss && (
                            <div>
                              <span className="text-apple-dim text-[10px] block">Stop Loss:</span>
                              <span className="font-mono text-apple-red tabular-nums">
                                {formatPrice(sig.stop_loss)}
                              </span>
                            </div>
                          )}
                          {sig.take_profit && (
                            <div>
                              <span className="text-apple-dim text-[10px] block">Take Profit:</span>
                              <span className="font-mono text-apple-green tabular-nums">
                                {formatPrice(sig.take_profit)}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              playRetroSound('select');
                              if (onSelectStrategy && sig.strategy_id) {
                                onSelectStrategy(sig.strategy_id);
                              }
                              setIsOpen(false);
                            }}
                            className="flex-1 py-1.5 px-2.5 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-[11px] font-semibold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer shadow-sm"
                          >
                            <Crosshair className="w-3 h-3" />
                            <span>Focus on Chart</span>
                          </button>
                          {onCloseSignal && (
                            <button
                              onClick={() => {
                                playRetroSound('alert');
                                onCloseSignal(sig.strategy_id);
                              }}
                              className="py-1.5 px-2.5 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-[0.98] border border-black/[0.08] dark:border-white/[0.08] text-apple-muted hover:text-apple-text text-[11px] font-medium rounded-lg transition-all cursor-pointer"
                              title="Simulate position close / exit"
                            >
                              Exit
                            </button>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (
                /* No Active Positions Standby Card */
                <div className="rounded-xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] p-3 text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-apple-green/10 text-apple-green mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-apple-text">
                      No Active Buy / Sell Positions
                    </div>
                    <div className="text-[11px] text-apple-muted mt-0.5 leading-relaxed">
                      Autonomous Engine is actively scanning real-time breakout / breakdown confirmation across 9 quantitative models.
                    </div>
                  </div>

                  {/* Trigger Test Signal Button */}
                  {onSimulateSignal && (
                    <button
                      onClick={() => {
                        playRetroSound('signal');
                        onSimulateSignal();
                      }}
                      className="mt-1 w-full py-1.5 px-3 bg-apple-blue/10 hover:bg-apple-blue/20 text-apple-blue dark:text-apple-cyan border border-apple-blue/25 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>Simulate Active Signal</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 2. RECENT NOTIFICATION EVENTS LOG */}
            {notifications.length > 0 && (
              <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
                <div className="text-[10px] font-semibold text-apple-dim uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Recent Signal Events</span>
                  <span className="font-mono text-apple-muted text-[10px]">
                    {notifications.length} logged
                  </span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {notifications.slice(0, 8).map((notif) => (
                    <div
                      key={notif.id}
                      className="p-2 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              notif.type === 'NEW_SIGNAL'
                                ? notif.direction === 'LONG'
                                  ? 'bg-apple-green'
                                  : 'bg-apple-red'
                                : notif.type === 'SIGNAL_EXIT'
                                ? 'bg-apple-orange'
                                : 'bg-apple-cyan'
                            }`}
                          />
                          <span className="font-semibold text-apple-text truncate text-[11px]">
                            {notif.title}
                          </span>
                        </div>
                        <div className="text-[10px] text-apple-muted truncate mt-0.5">
                          {notif.strategy}
                          {notif.price && ` @ $${Number(notif.price).toLocaleString()}`}
                          {notif.pnl && ` (${notif.pnl})`}
                        </div>
                      </div>

                      <div className="text-[10px] text-apple-dim font-mono tabular-nums whitespace-nowrap">
                        {notif.timestamp}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Footer Telemetry */}
          <div className="mt-3 pt-2.5 border-t border-black/[0.08] dark:border-white/[0.08] flex items-center justify-between text-[10px] text-apple-dim">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-apple-cyan" />
              <span>{selectedAsset === 'ETHUSDT' ? 'ETH' : 'BTC'}: {formatPrice(currentBtcPrice)}</span>
            </span>
            <span className="font-mono">Autonomous Core v2.4</span>
          </div>

        </div>
      )}
    </div>
  );
}

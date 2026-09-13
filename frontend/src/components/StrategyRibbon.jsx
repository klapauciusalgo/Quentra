import React from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  ShieldAlert, 
  Zap, 
  Activity, 
  Sliders, 
  ChevronRight,
  Clock,
  Compass,
  FileText
} from 'lucide-react';

export default function StrategyRibbon({ 
  strategies = [], 
  selectedStrategyId, 
  onSelectStrategy, 
  onOpenDetail,
  currentBtcPrice = 77300,
  floor = null
}) {
  const activeStrat = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];
  const isLong = activeStrat?.type === 'LONG';
  const m = activeStrat?.metrics || {};
  const params = activeStrat?.parameters || {};

  // Separate into Longs and Shorts
  const longStrategies = strategies.filter((s) => s.type === 'LONG');
  const shortStrategies = strategies.filter((s) => s.type === 'SHORT');

  const session = floor?.session || { name: 'London / NY Overlap', code: 'PEAK' };
  const regime = floor?.market_regime || { weekly_ma55: 82654, distance_pct: -6.5 };

  return (
    <div className="bg-floor-dark border-2 border-floor-border p-4 space-y-4 font-mono">
      
      {/* Top Strip: Macro Regime & Session Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-floor-border pb-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-signal-cyan animate-pulse"></span>
          <span className="font-pixel text-[11px] text-retro-text tracking-wider">
            QUANTITATIVE ALGO DISPATCH
          </span>
          <span className="text-retro-dim hidden md:inline">
            // BINANCE SPOT & FUTURES STRATEGY RUNTIME
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {/* Market Session */}
          <div className="flex items-center gap-1.5 bg-floor-darker border border-floor-border px-2.5 py-1 text-retro-muted">
            <Clock className="w-3.5 h-3.5 text-signal-warn" />
            <span>SESSION: {session.name || 'Asia / Global Market'}</span>
          </div>

          {/* Macro Regime */}
          <div className="flex items-center gap-1.5 bg-floor-darker border border-floor-border px-2.5 py-1">
            <Compass className="w-3.5 h-3.5 text-signal-purple" />
            <span className="text-retro-dim">WEEKLY MA55:</span>
            <span className="text-signal-purple font-bold">
              ${Number(regime.weekly_ma55 || 82654).toLocaleString()}
            </span>
            <span className={regime.distance_pct >= 0 ? 'text-signal-bull' : 'text-signal-warn'}>
              ({regime.distance_pct >= 0 ? '+' : ''}{regime.distance_pct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Strategy Quick Selector Tabs (5 Longs & 3 Shorts) */}
      <div className="space-y-2">
        {/* Long Strategies Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-pixel text-signal-bull w-14 shrink-0">
            LONG:
          </span>
          {longStrategies.map((s) => {
            const isSelected = s.id === selectedStrategyId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  playRetroSound('select');
                  onSelectStrategy(s.id);
                }}
                className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'border-signal-bull bg-signal-bull text-floor-darker font-bold shadow-pixel-green'
                    : 'border-floor-border bg-floor-darker text-retro-muted hover:text-retro-text hover:border-floor-borderLight'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                <span>{s.short_name || s.name}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded-none ${
                  isSelected ? 'bg-floor-darker text-signal-bull font-bold' : 'bg-floor-wall text-retro-dim'
                }`}>
                  {s.timeframe}
                </span>
              </button>
            );
          })}
        </div>

        {/* Short Strategies Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-pixel text-signal-bear w-14 shrink-0">
            SHORT:
          </span>
          {shortStrategies.map((s) => {
            const isSelected = s.id === selectedStrategyId;
            return (
              <button
                key={s.id}
                onClick={() => {
                  playRetroSound('select');
                  onSelectStrategy(s.id);
                }}
                className={`px-3 py-1.5 text-xs font-mono border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'border-signal-bear bg-signal-bear text-floor-darker font-bold shadow-pixel-red'
                    : 'border-floor-border bg-floor-darker text-retro-muted hover:text-retro-text hover:border-floor-borderLight'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                <span>{s.short_name || s.name}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded-none ${
                  isSelected ? 'bg-floor-darker text-signal-bear font-bold' : 'bg-floor-wall text-retro-dim'
                }`}>
                  {s.timeframe}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Strategy Intelligence Card */}
      {activeStrat && (
        <div className="bg-floor-darker border border-floor-border p-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          
          {/* Col 1: Selected Algo Overview */}
          <div className="lg:col-span-2 space-y-2 border-b lg:border-b-0 lg:border-r border-floor-border pb-3 lg:pb-0 lg:pr-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`font-pixel text-[10px] px-2 py-0.5 border ${
                  activeStrat.id === 'pure-macro-weekly-ma55'
                    ? 'border-signal-cyan text-signal-cyan bg-signal-cyan/10'
                    : isLong
                    ? 'border-signal-bull text-signal-bull bg-signal-bull/10'
                    : 'border-signal-bear text-signal-bear bg-signal-bear/10'
                }`}>
                  {activeStrat.id === 'pure-macro-weekly-ma55' ? 'MACRO DUAL (L/S)' : activeStrat.type}
                </span>
                <span className="text-xs text-signal-cyan font-bold uppercase">
                  {activeStrat.timeframe} TIMEFRAME
                </span>
              </div>
              {activeStrat.badge && (
                <span className="text-[10px] text-signal-warn bg-signal-warn/10 border border-signal-warn/30 px-2 py-0.5">
                  ★ {activeStrat.badge}
                </span>
              )}
            </div>

            <h3 className="font-pixel text-sm md:text-base text-retro-text tracking-wide">
              {activeStrat.name}
            </h3>

            <p className="text-xs text-retro-muted leading-relaxed font-sans line-clamp-2">
              {activeStrat.logic_summary}
            </p>

            <div className="flex items-center gap-4 pt-1 text-xs">
              <div>
                <span className="text-retro-dim">Total Return: </span>
                <span className="text-signal-bull font-bold">+{Number(m.total_return_pct || 0).toLocaleString()}%</span>
              </div>
              <div>
                <span className="text-retro-dim">Win Rate: </span>
                <span className="text-retro-text font-bold">{m.win_rate_pct}%</span>
              </div>
              <div>
                <span className="text-retro-dim">Profit Factor: </span>
                <span className="text-signal-cyan font-bold">{m.profit_factor}x</span>
              </div>
            </div>
          </div>

          {/* Col 2 & 3: Key Execution Targets (Entry, SL, BE, TP) */}
          <div className="lg:col-span-2 flex flex-col justify-between space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              
              {/* Entry Target */}
              <div className="bg-floor-bg border border-floor-border p-2">
                <div className="text-[10px] text-retro-dim flex items-center gap-1">
                  <Activity className="w-3 h-3 text-signal-cyan" /> ENTRY TARGET
                </div>
                <div className="font-bold text-retro-text mt-0.5 truncate" title={formatPrice(currentBtcPrice)}>
                  {formatPrice(currentBtcPrice)}
                </div>
                <div className="text-[10px] text-retro-muted">Bar Confirmation</div>
              </div>

              {/* Stop Loss */}
              <div className="bg-floor-bg border border-floor-border p-2">
                <div className="text-[10px] text-signal-bear flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> STOP LOSS
                </div>
                <div className="font-bold text-signal-bear mt-0.5 truncate" title={params.hard_stop_loss || '5.0%'}>
                  {params.hard_stop_loss || '5.0%'}
                </div>
                <div className="text-[10px] text-retro-dim">Capital Protection</div>
              </div>

              {/* Breakeven Trigger */}
              <div className="bg-floor-bg border border-floor-border p-2">
                <div className="text-[10px] text-signal-warn flex items-center gap-1">
                  <Zap className="w-3 h-3" /> BREAKEVEN
                </div>
                <div className="font-bold text-signal-warn mt-0.5 truncate" title={params.breakeven_lock || params.fast_breakeven || 'Lock at BE'}>
                  {params.breakeven_lock || params.fast_breakeven || 'Lock at BE'}
                </div>
                <div className="text-[10px] text-retro-dim">Zero Risk Trigger</div>
              </div>

              {/* Take Profit Target */}
              <div className="bg-floor-bg border border-floor-border p-2">
                <div className="text-[10px] text-signal-bull flex items-center gap-1">
                  <Target className="w-3 h-3" /> TAKE PROFIT
                </div>
                <div className="font-bold text-signal-bull mt-0.5 truncate" title={params.take_profit || '+75.0% Runner'}>
                  {params.take_profit || '+75.0% Runner'}
                </div>
                <div className="text-[10px] text-retro-dim">Target Runner</div>
              </div>

            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-retro-dim hidden sm:inline">
                Rules & parameters verified from Pine Script v5 backtest engine
              </div>
              <button
                onClick={() => {
                  playRetroSound('blip');
                  if (onOpenDetail) onOpenDetail(activeStrat.id);
                }}
                className="w-full sm:w-auto px-4 py-1.5 bg-floor-wall hover:bg-floor-border border border-signal-cyan/50 text-signal-cyan hover:text-retro-text font-mono text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>VIEW LOGIC & FULL TRADE HISTORY ({activeStrat.trades?.length || 0})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

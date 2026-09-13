import React from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  ShieldAlert, 
  Zap, 
  Activity, 
  ChevronRight,
  Clock, 
  Compass,
  ArrowRight,
  Sliders
} from 'lucide-react';

export function StrategySelectorBar({ 
  strategies = [], 
  selectedStrategyId, 
  onSelectStrategy, 
  floor = null
}) {
  const activeStrat = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];
  const m = activeStrat?.metrics || {};
  const totalReturn = m.total_return_pct ?? activeStrat?.total_return_pct ?? 0;
  const winRate = m.win_rate_pct ?? activeStrat?.win_rate_pct ?? 0;
  const profitFactor = m.profit_factor ?? activeStrat?.profit_factor ?? 1.0;

  const longStrategies = strategies.filter((s) => s.type === 'LONG');
  const shortStrategies = strategies.filter((s) => s.type === 'SHORT');

  const session = floor?.session || { name: 'London / NY Overlap', code: 'PEAK' };
  const regime = floor?.market_regime || { weekly_ma55: 82654, distance_pct: -6.5 };

  return (
    <div className="apple-glass rounded-3xl p-4 sm:p-5 space-y-3.5">
      {/* Top Telemetry Strip: Market Macro Regime & Session */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-apple-blue shadow-[0_0_8px_rgba(10,132,255,0.6)]" />
          <span className="font-semibold text-xs tracking-wider uppercase text-zinc-200">
            Algo Strategy Runtime
          </span>
          <span className="text-xs text-apple-dim hidden md:inline">
            / Verified Binance Historical Models
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          {/* Market Session Pill */}
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1 text-apple-muted">
            <Clock className="w-3.5 h-3.5 text-apple-orange" />
            <span>Session: {session.name || 'Asia / Global'}</span>
          </div>

          {/* Macro Regime Pill */}
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1">
            <Compass className="w-3.5 h-3.5 text-apple-purple" />
            <span className="text-apple-dim">Weekly MA55:</span>
            <span className="text-white font-medium tabular-nums">
              ${Number(regime.weekly_ma55 || 82654).toLocaleString()}
            </span>
            <span className={`font-medium tabular-nums ${regime.distance_pct >= 0 ? 'text-apple-green' : 'text-apple-orange'}`}>
              ({regime.distance_pct >= 0 ? '+' : ''}{regime.distance_pct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Strategy Switcher Pills Row + Active Quick Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2 flex-1">
          {/* Long Strategies */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-apple-muted uppercase tracking-wider w-12 shrink-0">
              Long
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {longStrategies.map((s) => {
                const isSelected = s.id === selectedStrategyId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      playRetroSound('select');
                      onSelectStrategy(s.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-apple-green/15 text-white border-apple-green/40 shadow-sm font-medium'
                        : 'bg-white/[0.03] text-apple-muted border-white/[0.06] hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.8)]' : 'bg-apple-dim'}`} />
                    <span>{s.short_name || s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-apple-green/20 text-apple-green font-medium' : 'bg-white/[0.05] text-apple-dim'
                    }`}>
                      {s.timeframe}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Short Strategies */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-apple-muted uppercase tracking-wider w-12 shrink-0">
              Short
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {shortStrategies.map((s) => {
                const isSelected = s.id === selectedStrategyId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      playRetroSound('select');
                      onSelectStrategy(s.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-apple-red/15 text-white border-apple-red/40 shadow-sm font-medium'
                        : 'bg-white/[0.03] text-apple-muted border-white/[0.06] hover:bg-white/[0.07] hover:text-white'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-apple-red shadow-[0_0_6px_rgba(255,69,58,0.8)]' : 'bg-apple-dim'}`} />
                    <span>{s.short_name || s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-apple-red/20 text-apple-red font-medium' : 'bg-white/[0.05] text-apple-dim'
                    }`}>
                      {s.timeframe}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Selected Strategy Quick Metrics Pill Strip */}
        {activeStrat && (
          <div className="hidden xl:flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-2xl px-3.5 py-2">
            <div className="text-right pr-2.5 border-r border-white/[0.08]">
              <div className="text-[10px] text-apple-dim uppercase tracking-wider">Active Algo</div>
              <div className="text-xs font-semibold text-white truncate max-w-[150px]">{activeStrat.short_name || activeStrat.name}</div>
            </div>
            <div className="px-2">
              <div className="text-[10px] text-apple-dim">Return</div>
              <div className="text-xs font-semibold text-apple-green tabular-nums">+{Number(totalReturn).toLocaleString()}%</div>
            </div>
            <div className="px-2">
              <div className="text-[10px] text-apple-dim">Win Rate</div>
              <div className="text-xs font-semibold text-white tabular-nums">{winRate}%</div>
            </div>
            <div className="px-2">
              <div className="text-[10px] text-apple-dim">Profit Factor</div>
              <div className="text-xs font-semibold text-apple-cyan tabular-nums">{profitFactor}x</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function StrategyDetailCard({
  activeStrat,
  currentBtcPrice = 77300,
  onOpenDetail
}) {
  if (!activeStrat) return null;
  const isLong = activeStrat?.type === 'LONG';
  const m = activeStrat?.metrics || {};
  const params = activeStrat?.parameters || {};
  const totalReturn = m.total_return_pct ?? activeStrat?.total_return_pct ?? 0;
  const winRate = m.win_rate_pct ?? activeStrat?.win_rate_pct ?? 0;
  const profitFactor = m.profit_factor ?? activeStrat?.profit_factor ?? 1.0;

  return (
    <div className="apple-glass rounded-3xl p-5 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Strategy Meta & Philosophy */}
      <div className="lg:col-span-6 space-y-3 lg:border-r border-white/[0.08] lg:pr-6">
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
            activeStrat.id === 'pure-macro-weekly-ma55'
              ? 'bg-apple-cyan/10 text-apple-cyan border-apple-cyan/30'
              : isLong
              ? 'bg-apple-green/10 text-apple-green border-apple-green/30'
              : 'bg-apple-red/10 text-apple-red border-apple-red/30'
          }`}>
            {activeStrat.id === 'pure-macro-weekly-ma55' ? 'Dual Long / Short' : activeStrat.type}
          </span>
          <span className="text-xs font-medium text-apple-blue">
            {activeStrat.timeframe} Chart Cadence
          </span>
          {activeStrat.badge && (
            <span className="text-xs text-apple-orange bg-apple-orange/10 border border-apple-orange/25 px-2.5 py-0.5 rounded-full font-medium">
              {activeStrat.badge}
            </span>
          )}
        </div>

        <div>
          <h2 className="text-lg md:text-xl font-semibold text-white tracking-tight">
            {activeStrat.name}
          </h2>
          <p className="text-xs md:text-sm text-apple-muted leading-relaxed mt-1 line-clamp-2">
            {activeStrat.logic_summary}
          </p>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Total Return</div>
            <div className="text-sm md:text-base font-semibold text-apple-green tabular-nums mt-0.5">
              +{Number(totalReturn).toLocaleString()}%
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Win Rate</div>
            <div className="text-sm md:text-base font-semibold text-white tabular-nums mt-0.5">
              {winRate}%
            </div>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Profit Factor</div>
            <div className="text-sm md:text-base font-semibold text-apple-cyan tabular-nums mt-0.5">
              {profitFactor}x
            </div>
          </div>
        </div>
      </div>

      {/* Execution Targets & Strategy Action */}
      <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Entry Target */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-muted flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-apple-blue" />
              <span>Entry Target</span>
            </div>
            <div className="font-semibold text-white text-sm mt-1 truncate tabular-nums">
              {formatPrice(currentBtcPrice)}
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5">Bar Confirmation</div>
          </div>

          {/* Stop Loss */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-red flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Stop Loss</span>
            </div>
            <div className="font-semibold text-apple-red text-sm mt-1 truncate tabular-nums">
              {params.hard_stop_loss || '5.0%'}
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5">Capital Shield</div>
          </div>

          {/* Breakeven Trigger */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-orange flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>Breakeven</span>
            </div>
            <div className="font-semibold text-apple-orange text-sm mt-1 truncate tabular-nums">
              {params.breakeven_lock || params.fast_breakeven || 'Lock at BE'}
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5">Zero Risk Lock</div>
          </div>

          {/* Take Profit Target */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-green flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              <span>Target Exit</span>
            </div>
            <div className="font-semibold text-apple-green text-sm mt-1 truncate tabular-nums">
              {params.take_profit || '+75.0% Runner'}
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5">Trend Runner</div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-apple-dim hidden sm:inline">
            Mathematical parameters verified via backtesting engine
          </span>
          <button
            onClick={() => {
              playRetroSound('select');
              if (onOpenDetail) onOpenDetail(activeStrat.id);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] active:scale-[0.98] border border-white/15 text-white text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[40px]"
          >
            <span>View Complete Performance & Trade Logs ({activeStrat.trades?.length || 0})</span>
            <ChevronRight className="w-4 h-4 text-apple-muted" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Default export StrategyRibbon for backward compatibility
export default function StrategyRibbon(props) {
  return (
    <div className="space-y-4">
      <StrategySelectorBar {...props} />
      {props.showDetailsCard !== false && (
        <StrategyDetailCard 
          activeStrat={props.strategies?.find((s) => s.id === props.selectedStrategyId) || props.strategies?.[0]} 
          currentBtcPrice={props.currentBtcPrice}
          onOpenDetail={props.onOpenDetail}
        />
      )}
    </div>
  );
}

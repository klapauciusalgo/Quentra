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

  const regime = floor?.market_regime || { weekly_ma55: 82654, distance_pct: -6.5 };

  return (
    <div className="apple-glass rounded-3xl p-4 sm:p-5 space-y-3.5">
      {/* Top Telemetry Strip: Market Macro Regime & Session */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-black/[0.08] dark:border-white/[0.08] pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-apple-blue shadow-[0_0_8px_rgba(10,132,255,0.6)]" />
          <span className="font-semibold text-xs tracking-wider uppercase text-apple-text">
            Algo Strategy Runtime
          </span>
          <span className="text-xs text-apple-dim hidden md:inline">
            / Autonomous Live Engine (On-The-Fly)
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs overflow-x-auto no-scrollbar max-w-full">
          {/* Macro Regime Pill */}
          <div className="flex items-center gap-1.5 bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-full px-2.5 py-1 whitespace-nowrap shrink-0">
            <Compass className="w-3.5 h-3.5 text-apple-purple" />
            <span className="text-apple-dim hidden sm:inline">Weekly MA55:</span>
            <span className="text-apple-text font-medium tabular-nums">
              ${Number(regime.weekly_ma55 || 82654).toLocaleString()}
            </span>
            <span className={`font-medium tabular-nums ${regime.distance_pct >= 0 ? 'text-apple-green' : 'text-apple-orange'}`}>
              ({regime.distance_pct >= 0 ? '+' : ''}{regime.distance_pct}%)
            </span>
          </div>
        </div>
      </div>

      {/* Strategy Switcher Pills Row + Active Quick Metrics */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="space-y-1.5 flex-1 min-w-0">
          {/* Long Strategies */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-semibold text-apple-muted uppercase tracking-wider w-10 shrink-0">
              Long
            </span>
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              {longStrategies.map((s) => {
                const isSelected = s.id === selectedStrategyId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      playRetroSound('select');
                      onSelectStrategy(s.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-apple-green/15 text-apple-green dark:text-white border-apple-green/40 shadow-sm font-semibold'
                        : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.8)]' : 'bg-apple-dim'}`} />
                    <span>{s.short_name || s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-apple-green/20 text-apple-green font-medium' : 'bg-black/[0.04] dark:bg-white/[0.05] text-apple-dim'
                    }`}>
                      {s.timeframe}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Short Strategies */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[10px] font-semibold text-apple-muted uppercase tracking-wider w-10 shrink-0">
              Short
            </span>
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
              {shortStrategies.map((s) => {
                const isSelected = s.id === selectedStrategyId;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      playRetroSound('select');
                      onSelectStrategy(s.id);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-apple-red/15 text-apple-red dark:text-white border-apple-red/40 shadow-sm font-semibold'
                        : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-apple-red shadow-[0_0_6px_rgba(255,69,58,0.8)]' : 'bg-apple-dim'}`} />
                    <span>{s.short_name || s.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${
                      isSelected ? 'bg-apple-red/20 text-apple-red font-medium' : 'bg-black/[0.04] dark:bg-white/[0.05] text-apple-dim'
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
          <div className="hidden xl:flex items-center gap-2 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl px-3.5 py-2">
            <div className="text-right pr-2.5 border-r border-black/[0.08] dark:border-white/[0.08]">
              <div className="text-[10px] text-apple-dim uppercase tracking-wider">Active Algo</div>
              <div className="text-xs font-semibold text-apple-text truncate max-w-[150px]">{activeStrat.short_name || activeStrat.name}</div>
            </div>
            <div className="px-2">
              <div className="text-[10px] text-apple-dim">Return</div>
              <div className="text-xs font-semibold text-apple-green tabular-nums">+{Number(totalReturn).toLocaleString()}%</div>
            </div>
            <div className="px-2">
              <div className="text-[10px] text-apple-dim">Win Rate</div>
              <div className="text-xs font-semibold text-apple-text tabular-nums">{winRate}%</div>
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

function getStrategyExecutionRules(strat) {
  const sid = strat?.id;
  const p = strat?.parameters || {};
  switch (sid) {
    case 'pippo-4h-original':
      return {
        trigger: '5-Bar Breakout',
        triggerSub: '4H Candle Close',
        regime: '> 4H SMA 111',
        regimeSub: 'Filter: Bearish Standby',
        isRegimeOk: false,
        stopLoss: '15.0%',
        breakeven: 'Structural CHoCH',
        takeProfit: '75.0%',
      };
    case 'pippo-30m-alpha':
      return {
        trigger: '36-Bar Breakout',
        triggerSub: '30M Candle Close',
        regime: 'SMA111 & EMA50',
        regimeSub: 'Filter: Bearish Standby',
        isRegimeOk: false,
        stopLoss: '5.0%',
        breakeven: '+3.0% -> BE',
        takeProfit: '75.0%',
      };
    case 'pippo-30m-new-gen':
      return {
        trigger: 'MA Squeeze & Dist < 0.8%',
        triggerSub: '30M Candle Close',
        regime: '1H MA25/50 + 4H MA111',
        regimeSub: 'Regime: Bullish Squeeze',
        isRegimeOk: true,
        stopLoss: '2.0%',
        breakeven: 'Force Close -0.5% MAs',
        takeProfit: '20.0%',
      };
    case 'pippo-30m-grd':
      return {
        trigger: 'MA Squeeze & Dist < 0.8%',
        triggerSub: '30M Candle Close',
        regime: '1H MA25/50 Dist < 1.5%',
        regimeSub: 'Regime: Bullish Squeeze',
        isRegimeOk: true,
        stopLoss: '2.0%',
        breakeven: 'Force Close -0.5% MAs',
        takeProfit: '20.0%',
      };
    case 'pippo-1h-enhanced':
      return {
        trigger: '16-Bar Breakout',
        triggerSub: '1H Candle Close',
        regime: '> 4H SMA 111',
        regimeSub: 'Filter: Bearish Standby',
        isRegimeOk: false,
        stopLoss: '8.0%',
        breakeven: '+5.0% -> BE',
        takeProfit: '75.0%',
      };
    case 'pippo-30m-scalp':
      return {
        trigger: '36-Bar Breakout',
        triggerSub: '30M Candle Close',
        regime: 'SMA111 & EMA50',
        regimeSub: 'Filter: Bearish Standby',
        isRegimeOk: false,
        stopLoss: '5.0%',
        breakeven: '+4.0% Partial & BE',
        takeProfit: '+4% / +75%',
      };
    case 'pure-macro-weekly-ma55':
      return {
        trigger: 'Weekly Close',
        triggerSub: 'Sunday Midnight UTC',
        regime: '>= Weekly MA55',
        regimeSub: 'CASH (Below MA55)',
        isRegimeOk: false,
        stopLoss: '< Weekly MA55',
        breakeven: 'Macro Wave',
        takeProfit: 'Macro Trend',
      };
    case 'pippo-30m-short-v2-a':
      return {
        trigger: '32-Bar Breakdown',
        triggerSub: '30M Candle Close',
        regime: '< MA55 & < SMA111',
        regimeSub: 'Aligned Bearish',
        isRegimeOk: true,
        stopLoss: '5.0%',
        breakeven: '+1.5% drop -> BE',
        takeProfit: '12.0%',
      };
    case 'pippo-30m-short-v2-b':
      return {
        trigger: '28-Bar Breakdown',
        triggerSub: '30M Candle Close',
        regime: '< Weekly MA55',
        regimeSub: 'Aligned Bearish',
        isRegimeOk: true,
        stopLoss: '5.0%',
        breakeven: '+2.5% drop -> BE',
        takeProfit: '20.0%',
      };
    case 'pippo-30m-short-v2-c':
      return {
        trigger: '32-Bar Breakdown',
        triggerSub: '30M (16b Rapid Exit)',
        regime: '< MA55 & < SMA111',
        regimeSub: 'Aligned Bearish',
        isRegimeOk: true,
        stopLoss: '6.0%',
        breakeven: '+2.5% drop -> BE',
        takeProfit: '50.0%',
      };
    default:
      return {
        trigger: p.entry_swing || p.internal_swing || 'Swing Trigger',
        triggerSub: `${strat?.timeframe?.toUpperCase() || ''} Close`,
        regime: p.regime_filter || 'Macro Filter',
        regimeSub: 'Standby',
        isRegimeOk: false,
        stopLoss: p.hard_stop_loss || '5.0%',
        breakeven: p.breakeven_lock || 'Lock at BE',
        takeProfit: p.take_profit || '75.0%',
      };
  }
}

export function StrategyDetailCard({
  activeStrat,
  currentBtcPrice = 77300,
  activeSignals = [],
  floor = null,
  onOpenDetail
}) {
  if (!activeStrat) return null;
  const isLong = activeStrat?.type === 'LONG';
  const m = activeStrat?.metrics || {};
  const params = activeStrat?.parameters || {};
  const totalReturn = m.total_return_pct ?? activeStrat?.total_return_pct ?? 0;
  const winRate = m.win_rate_pct ?? activeStrat?.win_rate_pct ?? 0;
  const profitFactor = m.profit_factor ?? activeStrat?.profit_factor ?? 1.0;

  const activeSignal = activeSignals.find(
    (s) => s.strategy_id === activeStrat?.id || s.id === activeStrat?.id
  );
  const isInPosition = !!activeSignal;
  const stratRules = getStrategyExecutionRules(activeStrat);

  return (
    <div className="apple-glass rounded-3xl p-5 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Strategy Meta & Philosophy */}
      <div className="lg:col-span-6 space-y-3 lg:border-r border-black/[0.08] dark:border-white/[0.08] lg:pr-6">
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
          <h2 className="text-lg md:text-xl font-semibold text-apple-text tracking-tight">
            {activeStrat.name}
          </h2>
          <p className="text-xs md:text-sm text-apple-muted leading-relaxed mt-1 line-clamp-2">
            {activeStrat.logic_summary}
          </p>
        </div>

        {/* Key Metrics Row */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Total Return</div>
            <div className="text-sm md:text-base font-semibold text-apple-green tabular-nums mt-0.5">
              +{Number(totalReturn).toLocaleString()}%
            </div>
          </div>
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Win Rate</div>
            <div className="text-sm md:text-base font-semibold text-apple-text tabular-nums mt-0.5">
              {winRate}%
            </div>
          </div>
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-2.5">
            <div className="text-[11px] text-apple-muted">Profit Factor</div>
            <div className="text-sm md:text-base font-semibold text-apple-cyan tabular-nums mt-0.5">
              {profitFactor}x
            </div>
          </div>
        </div>
      </div>

      {/* Execution Targets & Strategy Action */}
      <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
        {/* Real-time Execution Status Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] dark:border-white/[0.06] pb-2">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
              isInPosition
                ? isLong
                  ? 'bg-apple-green/15 text-apple-green border-apple-green/30 animate-pulse'
                  : 'bg-apple-red/15 text-apple-red border-apple-red/30 animate-pulse'
                : 'bg-black/[0.04] dark:bg-white/[0.06] text-apple-muted border-black/10 dark:border-white/10'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isInPosition ? (isLong ? 'bg-apple-green' : 'bg-apple-red') : 'bg-apple-dim'}`} />
              {isInPosition ? `IN POSITION (${activeSignal.action || (isLong ? 'BUY' : 'SELL')})` : 'STANDBY / FLAT (No Active Signal)'}
            </span>
            {isInPosition && (
              <span className={`text-xs font-semibold tabular-nums ${activeSignal.floating_pnl_pct >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>
                PnL: {activeSignal.floating_pnl_pct >= 0 ? '+' : ''}{activeSignal.floating_pnl_pct}%
              </span>
            )}
          </div>
          <div className="text-[11px] text-apple-dim tabular-nums flex items-center gap-1.5">
            <span>Spot BTC:</span>
            <span className="font-semibold text-apple-text">{formatPrice(currentBtcPrice)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Card 1: Entry Condition or Live Entry */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-muted flex items-center gap-1">
              <Activity className="w-3.5 h-3.5 text-apple-blue" />
              <span>{isInPosition ? 'Live Entry' : 'Entry Trigger'}</span>
            </div>
            <div className="font-semibold text-apple-text text-sm mt-1 truncate tabular-nums">
              {isInPosition ? formatPrice(activeSignal.entry_price) : stratRules.trigger}
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5 truncate">
              {isInPosition ? 'Confirmed Fill' : stratRules.triggerSub}
            </div>
          </div>

          {/* Card 2: Regime Filter or Active Stop Loss */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-muted flex items-center gap-1">
              <ShieldAlert className={`w-3.5 h-3.5 ${isInPosition ? 'text-apple-red' : 'text-apple-purple'}`} />
              <span>{isInPosition ? 'Active Stop Loss' : 'Regime Filter'}</span>
            </div>
            <div className={`font-semibold text-sm mt-1 truncate tabular-nums ${isInPosition ? 'text-apple-red' : 'text-apple-text'}`}>
              {isInPosition 
                ? (activeSignal.stop_loss ? formatPrice(activeSignal.stop_loss) : stratRules.stopLoss)
                : stratRules.regime
              }
            </div>
            <div className={`text-[10px] mt-0.5 truncate ${
              isInPosition 
                ? 'text-apple-dim' 
                : stratRules.isRegimeOk ? 'text-apple-green font-medium' : 'text-apple-orange font-medium'
            }`}>
              {isInPosition ? 'Capital Shield' : stratRules.regimeSub}
            </div>
          </div>

          {/* Card 3: Breakeven or Stop Loss Rule */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-orange flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>{isInPosition ? 'Breakeven' : 'Stop Loss Rule'}</span>
            </div>
            <div className="font-semibold text-apple-orange text-sm mt-1 truncate tabular-nums">
              {isInPosition
                ? (activeSignal.breakeven_trigger ? formatPrice(activeSignal.breakeven_trigger) : stratRules.breakeven)
                : stratRules.stopLoss
              }
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5 truncate">
              {isInPosition ? 'Zero Risk Lock' : 'Capital Shield'}
            </div>
          </div>

          {/* Card 4: Take Profit Target */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.06] rounded-xl p-3">
            <div className="text-[11px] text-apple-green flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              <span>{isInPosition ? 'Take Profit' : 'Target Exit'}</span>
            </div>
            <div className="font-semibold text-apple-green text-sm mt-1 truncate tabular-nums">
              {isInPosition
                ? (activeSignal.take_profit ? formatPrice(activeSignal.take_profit) : stratRules.takeProfit)
                : stratRules.takeProfit
              }
            </div>
            <div className="text-[10px] text-apple-dim mt-0.5 truncate">
              Trend Runner
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-apple-dim hidden sm:inline">
            {isInPosition
              ? 'Active position guarded by autonomous risk & trailing execution engine'
              : 'Standby mode: Signal fires automatically upon confirmed candle close meeting regime criteria'
            }
          </span>
          <button
            onClick={() => {
              playRetroSound('select');
              if (onOpenDetail) onOpenDetail(activeStrat.id);
            }}
            className="w-full sm:w-auto px-4 py-2 bg-black/[0.05] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14] active:scale-[0.98] border border-black/10 dark:border-white/15 text-apple-text text-xs font-medium rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[40px]"
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
          activeSignals={props.activeSignals}
          floor={props.floor}
          onOpenDetail={props.onOpenDetail}
        />
      )}
    </div>
  );
}

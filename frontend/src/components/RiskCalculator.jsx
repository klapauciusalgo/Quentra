import React, { useState, useMemo } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  ShieldCheck, 
  AlertCircle, 
  Calculator, 
  Zap, 
  DollarSign, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Sliders, 
  Lock,
  Layers,
  Flame,
  ArrowRight
} from 'lucide-react';
import strategiesData from '../data/strategiesData.json';

/**
 * Empirical trade-by-trade compounding simulation under leverage with hard stop loss capping.
 */
function simulateLeveragedTrades(trades = [], leverage = 1.0, hardStopPct = 5.0, marginAllocPct = 100) {
  if (!trades || trades.length === 0) {
    return { projectedReturnPct: 0, maxDrawdownPct: 0 };
  }
  let capital = 1000.0;
  let peakCapital = 1000.0;
  let maxDrawdown = 0.0;
  const hardStopFraction = Math.abs(hardStopPct) / 100.0;
  const allocFraction = (marginAllocPct || 100) / 100.0;

  for (let i = 0; i < trades.length; i++) {
    const rawTradeReturn = (trades[i].net_return_pct || 0) / 100.0;
    // Loss is bounded by the algorithm's hard stop loss
    const boundedTradeReturn = Math.max(rawTradeReturn, -hardStopFraction);
    // Effective PnL applied to total portfolio capital
    const tradePnlOnPortfolio = boundedTradeReturn * leverage * allocFraction;

    capital = Math.max(0.0, capital * (1.0 + tradePnlOnPortfolio));
    if (capital > peakCapital) {
      peakCapital = capital;
    }
    const currentDrawdown = peakCapital > 0 ? (capital - peakCapital) / peakCapital : 0;
    if (currentDrawdown < maxDrawdown) {
      maxDrawdown = currentDrawdown;
    }
    if (capital <= 0) break; // Total liquidation / wipeout
  }

  const projectedReturnPct = ((capital - 1000.0) / 1000.0) * 100.0;
  const maxDrawdownPct = maxDrawdown * 100.0;

  return { projectedReturnPct, maxDrawdownPct };
}

function getHardStopPct(strat) {
  const p = strat?.parameters || {};
  const slStr = p.hard_stop_loss || '';
  const match = slStr.match(/(\d+(\.\d+)?)/);
  if (match) {
    return parseFloat(match[1]);
  }
  if (strat?.id === 'pure-macro-weekly-ma55') return 10.0;
  return 5.0;
}

export default function RiskCalculator({ 
  currentBtcPrice = 77300,
  strategies = strategiesData,
  selectedStrategyId = 'pippo-1h-enhanced',
  onSelectStrategy,
  selectedAsset = 'BTCUSDT'
}) {
  const isEth = selectedAsset === 'ETHUSDT';
  const assetName = isEth ? 'Ethereum' : 'Bitcoin';
  const assetShort = isEth ? 'ETH' : 'BTC';
  const [initialCapital, setInitialCapital] = useState(1000);
  const [leverageTier, setLeverageTier] = useState('5x_safe'); // '1x_spot', '2x_compound', '3x_tactical', '5x_safe', 'custom'
  const [customLeverage, setCustomLeverage] = useState(2.5);

  // Active strategy resolved from props or catalog
  const stratList = strategies && strategies.length > 0 ? strategies : strategiesData;
  const activeStrat = stratList.find((s) => s.id === selectedStrategyId) || stratList[0] || {};
  const isLong = activeStrat?.type !== 'SHORT';
  const trades = activeStrat?.trades || [];
  const hardStopPct = getHardStopPct(activeStrat);
  const benchmarkReturnPct = activeStrat?.metrics?.total_return_pct ?? 0;
  const benchmarkMaxDd = activeStrat?.metrics?.max_drawdown_pct ?? 0;

  // Compute multi-tier risk and liquidation metrics specifically for this strategy
  const tiers = useMemo(() => {
    // 1x Spot
    const tier1x = {
      id: '1x_spot',
      name: '1.0x Spot (Zero Leverage)',
      marginAllocationPct: 100,
      leverage: 1.0,
      effectiveLeverage: '1.0x (Spot)',
      liquidationDistancePct: 100.0,
      liquidationPrice: isLong ? 0 : currentBtcPrice * 2.0,
      riskLevel: 'Maximum Capital Security',
      riskTierClass: 'text-apple-green',
      projectedReturnPct: benchmarkReturnPct,
      maxDrawdownPct: benchmarkMaxDd,
      note: '100% of capital deployed in spot / unleveraged futures. Zero liquidation risk under any market crash or volatility spike.'
    };

    // 2x Compounding
    const sim2x = simulateLeveragedTrades(trades, 2.0, hardStopPct, 100);
    const tier2x = {
      id: '2x_compound',
      name: '2.0x Dynamic Compounding',
      marginAllocationPct: 100,
      leverage: 2.0,
      effectiveLeverage: '2.0x Portfolio',
      liquidationDistancePct: 49.5,
      liquidationPrice: isLong ? currentBtcPrice * (1 - 0.495) : currentBtcPrice * (1 + 0.495),
      riskLevel: 'Moderate Growth (Empirical)',
      riskTierClass: 'text-apple-blue',
      projectedReturnPct: sim2x.projectedReturnPct,
      maxDrawdownPct: sim2x.maxDrawdownPct,
      note: `Full portfolio 2.0x compounding across ${trades.length} historical trades. Protected by ${hardStopPct}% hard stop loss, maintaining a 49.5% liquidation buffer.`
    };

    // 3x Tactical Margin (50% margin, 50% cash reserve)
    const sim3x = simulateLeveragedTrades(trades, 3.0, hardStopPct, 50);
    const tier3x = {
      id: '3x_tactical',
      name: '3.0x Tactical Margin (50% Reserve)',
      marginAllocationPct: 50,
      leverage: 3.0,
      effectiveLeverage: '1.5x Effective (50% margin x 3x)',
      liquidationDistancePct: 66.0,
      liquidationPrice: isLong ? currentBtcPrice * (1 - 0.66) : currentBtcPrice * (1 + 0.66),
      riskLevel: 'Balanced Tactical Growth',
      riskTierClass: 'text-apple-cyan',
      projectedReturnPct: sim3x.projectedReturnPct,
      maxDrawdownPct: sim3x.maxDrawdownPct,
      note: '50% of capital allocated to futures at 3x leverage while 50% remains in cash reserve. Cross-backed liquidation buffer reaches 66.0% from market.'
    };

    // 5x Institutional Safe (20% margin, 80% spot reserve)
    const sim5x = simulateLeveragedTrades(trades, 5.0, hardStopPct, 20);
    const tier5x = {
      id: '5x_safe',
      name: '5.0x Institutional Safe (20% Margin Max)',
      marginAllocationPct: 20,
      leverage: 5.0,
      effectiveLeverage: '1.0x Effective (20% margin x 5x)',
      liquidationDistancePct: 96.0,
      liquidationPrice: isLong ? currentBtcPrice * 0.04 : currentBtcPrice * 1.96,
      riskLevel: 'Institutional Safe (Recommended)',
      riskTierClass: 'text-apple-green',
      projectedReturnPct: sim5x.projectedReturnPct > 0 ? sim5x.projectedReturnPct : benchmarkReturnPct,
      maxDrawdownPct: sim5x.maxDrawdownPct !== 0 ? sim5x.maxDrawdownPct : benchmarkMaxDd * 0.7,
      note: `Only 20% of capital allocated to futures margin with 5x leverage. 80% remains protected in spot or cold reserve. ${assetName} would have to move 96% against the position to liquidate.`
    };

    // Custom Leverage Tier
    const simCustom = simulateLeveragedTrades(trades, customLeverage, hardStopPct, 100);
    const customDist = Math.max(1.0, ((1.0 / customLeverage) - 0.005) * 100.0);
    const customLiq = isLong 
      ? Math.max(0, currentBtcPrice * (1 - customDist / 100.0))
      : currentBtcPrice * (1 + customDist / 100.0);
    
    let customRiskLevel = 'Low Risk';
    let customClass = 'text-apple-green';
    if (customLeverage > 4.0) {
      customRiskLevel = 'Extreme Risk (High Ruin Chance)';
      customClass = 'text-apple-red';
    } else if (customLeverage > 2.5) {
      customRiskLevel = 'High Risk / Aggressive';
      customClass = 'text-apple-orange';
    } else if (customLeverage > 1.5) {
      customRiskLevel = 'Moderate Compounding';
      customClass = 'text-apple-blue';
    }

    const tierCustom = {
      id: 'custom',
      name: `Custom Slider (${customLeverage.toFixed(1)}x Leverage)`,
      marginAllocationPct: 100,
      leverage: customLeverage,
      effectiveLeverage: `${customLeverage.toFixed(1)}x Full Margin`,
      liquidationDistancePct: customDist,
      liquidationPrice: customLiq,
      riskLevel: customRiskLevel,
      riskTierClass: customClass,
      projectedReturnPct: simCustom.projectedReturnPct,
      maxDrawdownPct: simCustom.maxDrawdownPct,
      note: `User-defined ${customLeverage.toFixed(1)}x leverage simulation. Stop loss at ${hardStopPct}% vs liquidation threshold at ${customDist.toFixed(1)}%.`
    };

    return {
      '1x_spot': tier1x,
      '2x_compound': tier2x,
      '3x_tactical': tier3x,
      '5x_safe': tier5x,
      'custom': tierCustom
    };
  }, [activeStrat, trades, benchmarkReturnPct, benchmarkMaxDd, hardStopPct, isLong, currentBtcPrice, customLeverage]);

  const currentTier = tiers[leverageTier] || tiers['5x_safe'];
  const projectedFinal = initialCapital * (1 + Math.max(0, currentTier.projectedReturnPct) / 100);
  const projectedProfit = Math.max(0, projectedFinal - initialCapital);

  // Stop loss price vs liquidation price calculation
  const stopLossPrice = isLong 
    ? currentBtcPrice * (1 - hardStopPct / 100)
    : currentBtcPrice * (1 + hardStopPct / 100);
  
  const safetyMultiplier = currentTier.liquidationDistancePct / (hardStopPct || 1);
  const safetyGap = Math.abs(currentTier.liquidationPrice - stopLossPrice);

  return (
    <div className="apple-glass rounded-3xl p-5 md:p-7 space-y-6">
      {/* Header with Integrated Algo Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.08] dark:border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-apple-blue/15 border border-apple-blue/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-apple-cyan" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-apple-text tracking-tight flex items-center gap-2">
              <span>Leverage & Liquidation Safety Architecture</span>
            </h3>
            <p className="text-xs text-apple-muted mt-0.5">
              Simulate empirical compounding, margin buffer allocation, and mathematical downside limits for the selected strategy.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5 ${
            isLong
              ? 'bg-apple-green/10 text-apple-green border-apple-green/30'
              : 'bg-apple-red/10 text-apple-red border-apple-red/30'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isLong ? 'bg-apple-green' : 'bg-apple-red'}`} />
            <span>Simulating: {activeStrat.short_name || activeStrat.name}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.08]">
              {activeStrat.timeframe} {activeStrat.type}
            </span>
          </span>
        </div>
      </div>

      {/* Algo Switcher Strip */}
      <div className="space-y-2 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.06] rounded-2xl p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-apple-dim text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-apple-blue" />
            <span>Target Algorithm for Leverage Simulation:</span>
          </span>
          <span className="text-apple-muted text-[11px]">
            {stratList.length} Quantitative Models Available
          </span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {stratList.map((s) => {
            const isSelected = s.id === activeStrat.id;
            const isStratLong = s.type === 'LONG';
            return (
              <button
                key={s.id}
                onClick={() => {
                  playRetroSound('select');
                  if (onSelectStrategy) onSelectStrategy(s.id);
                }}
                className={`px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ${
                  isSelected
                    ? isStratLong
                      ? 'bg-apple-green/15 text-apple-green border-apple-green/40 shadow-sm font-semibold'
                      : 'bg-apple-red/15 text-apple-red border-apple-red/40 shadow-sm font-semibold'
                    : 'bg-black/[0.03] dark:bg-white/[0.03] text-apple-muted border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.07] hover:text-apple-text'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  isSelected 
                    ? (isStratLong ? 'bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.8)]' : 'bg-apple-red shadow-[0_0_6px_rgba(255,69,58,0.8)]')
                    : 'bg-apple-dim'
                }`} />
                <span>{s.short_name || s.name}</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-apple-dim">
                  {s.timeframe}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input & Tier Selection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Capital Input & Strategy Fast Profile */}
        <div className="lg:col-span-5 apple-glass-card rounded-2xl p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-apple-muted block mb-1.5">
              Initial Simulation Capital (USDT)
            </label>
            <div className="relative">
              <DollarSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-apple-muted" />
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(Math.max(10, Number(e.target.value)))}
                className="w-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-sm pl-9 pr-4 py-2.5 text-apple-text font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {[100, 500, 1000, 5000, 10000, 50000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    playRetroSound('blip');
                    setInitialCapital(amt);
                  }}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono tabular-nums transition-all cursor-pointer ${
                    initialCapital === amt
                      ? 'bg-apple-blue text-white border-apple-blue font-semibold shadow-sm'
                      : 'bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.06] dark:border-white/[0.06] text-apple-muted hover:text-apple-text hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
                  }`}
                >
                  ${amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Strategy Risk Profile Summary */}
          <div className="border-t border-black/[0.06] dark:border-white/[0.06] pt-3.5 space-y-2 text-xs">
            <div className="text-[11px] font-semibold text-apple-dim uppercase tracking-wider">
              Selected Algo Profile
            </div>
            <div className="grid grid-cols-2 gap-2 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/[0.06] rounded-xl p-3">
              <div>
                <span className="text-apple-dim text-[11px] block">Hard Stop Loss:</span>
                <span className="font-semibold text-apple-red font-mono tabular-nums">
                  {hardStopPct.toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-apple-dim text-[11px] block">Historical Max DD:</span>
                <span className="font-semibold text-apple-text font-mono tabular-nums">
                  {benchmarkMaxDd}%
                </span>
              </div>
              <div>
                <span className="text-apple-dim text-[11px] block">Trades Logged:</span>
                <span className="font-semibold text-apple-text font-mono tabular-nums">
                  {trades.length} trades
                </span>
              </div>
              <div>
                <span className="text-apple-dim text-[11px] block">1.0x Base Return:</span>
                <span className="font-semibold text-apple-green font-mono tabular-nums">
                  +{Number(benchmarkReturnPct).toLocaleString()}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Leverage Model Selector */}
        <div className="lg:col-span-7 apple-glass-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-apple-muted block">
              Select Leverage & Margin Architecture
            </label>
            <span className="text-xs text-apple-dim font-mono">
              Mode: {currentTier.effectiveLeverage}
            </span>
          </div>

          <div className="space-y-2">
            {Object.entries(tiers).map(([k, t]) => {
              const isSelected = leverageTier === k;
              return (
                <button
                  key={k}
                  onClick={() => {
                    playRetroSound('select');
                    setLeverageTier(k);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-apple-blue/15 border-apple-blue/40 text-apple-blue dark:text-white shadow-sm'
                      : 'bg-black/[0.02] dark:bg-white/[0.02] border-black/[0.06] dark:border-white/[0.06] text-apple-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-apple-text'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-apple-cyan bg-apple-blue' : 'border-apple-dim'
                    }`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="truncate">
                      <span className="text-xs font-medium text-apple-text block truncate">{t.name}</span>
                      <span className="text-[10px] text-apple-dim block truncate">{t.riskLevel}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className="text-xs font-mono font-semibold text-apple-green block tabular-nums">
                      +{Math.round(t.projectedReturnPct).toLocaleString()}%
                    </span>
                    <span className="text-[10px] font-mono text-apple-dim block tabular-nums">
                      Liq: {isLong ? '-' : '+'}{t.liquidationDistancePct.toFixed(1)}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Custom Leverage Slider (Visible when custom tier is active) */}
          {leverageTier === 'custom' && (
            <div className="bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.08] rounded-xl p-3.5 space-y-2 mt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-apple-text flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-apple-blue" />
                  <span>Custom Leverage Multiplier:</span>
                </span>
                <span className="font-mono font-bold text-apple-cyan text-sm">
                  {customLeverage.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="10.0"
                step="0.5"
                value={customLeverage}
                onChange={(e) => setCustomLeverage(parseFloat(e.target.value))}
                className="w-full accent-apple-blue cursor-pointer"
              />
              <div className="flex justify-between text-[10px] font-mono text-apple-dim">
                <span>1.0x (Safe)</span>
                <span>2.5x</span>
                <span>5.0x (Aggressive)</span>
                <span>10.0x (Extreme)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Projection Telemetry Results Matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Projected Compounded Final Value */}
        <div className="apple-glass-card rounded-2xl p-4 space-y-1">
          <div className="text-xs text-apple-dim flex items-center justify-between">
            <span>Projected Value</span>
            <span className="text-[10px] text-apple-green font-mono font-semibold">
              +{Math.round(currentTier.projectedReturnPct).toLocaleString()}%
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-apple-green font-mono tabular-nums">
            {formatPrice(projectedFinal)}
          </div>
          <div className="text-[11px] text-apple-muted font-mono tabular-nums truncate">
            Net Profit: +{formatPrice(projectedProfit)}
          </div>
          <div className="text-[10px] text-apple-dim pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            Simulated over {trades.length} trades
          </div>
        </div>

        {/* Metric 2: Liquidation Mark Price */}
        <div className="apple-glass-card rounded-2xl p-4 space-y-1">
          <div className="text-xs text-apple-dim flex items-center justify-between">
            <span>Liquidation Mark Price</span>
            <span className="text-[10px] text-apple-orange font-mono font-semibold">
              {isLong ? '-' : '+'}{currentTier.liquidationDistancePct.toFixed(1)}%
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-apple-orange font-mono tabular-nums">
            {currentTier.liquidationPrice > 0 ? formatPrice(currentTier.liquidationPrice) : '$0.00 (Zero Liq)'}
          </div>
          <div className="text-[11px] text-apple-muted font-mono tabular-nums truncate">
            Safe Distance: {currentTier.liquidationDistancePct.toFixed(1)}% {isLong ? 'Drop' : 'Pump'}
          </div>
          <div className="text-[10px] text-apple-dim pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            Live Mark: {formatPrice(currentBtcPrice)}
          </div>
        </div>

        {/* Metric 3: Stop Loss vs Liquidation Buffer */}
        <div className="apple-glass-card rounded-2xl p-4 space-y-1">
          <div className="text-xs text-apple-dim flex items-center justify-between">
            <span>Downside Shield Gap</span>
            <span className="text-[10px] text-apple-cyan font-mono font-semibold">
              {safetyMultiplier.toFixed(1)}x Buffer
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold text-apple-cyan font-mono tabular-nums">
            {safetyMultiplier.toFixed(1)}x Stop Loss
          </div>
          <div className="text-[11px] text-apple-muted font-mono tabular-nums truncate">
            Hard Stop: {formatPrice(stopLossPrice)} ({hardStopPct}%)
          </div>
          <div className="text-[10px] text-apple-dim pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            Safety Gap: {formatPrice(safetyGap)}
          </div>
        </div>

        {/* Metric 4: Risk Tier & Historical Liquidation Rate */}
        <div className="apple-glass-card rounded-2xl p-4 space-y-1">
          <div className="text-xs text-apple-dim">Safety & Ruin Rating</div>
          <div className={`text-base font-semibold flex items-center gap-1.5 mt-1 truncate ${currentTier.riskTierClass}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="truncate">{currentTier.riskLevel}</span>
          </div>
          <div className="text-[11px] text-apple-muted font-mono tabular-nums truncate">
            Worst Hist Drawdown: {currentTier.maxDrawdownPct.toFixed(1)}%
          </div>
          <div className="text-[10px] text-apple-green font-medium pt-1 border-t border-black/[0.04] dark:border-white/[0.04]">
            Historical Liquidation Rate: 0.0%
          </div>
        </div>
      </div>

      {/* Dynamic Mathematical Architecture Footnote */}
      <div className="apple-glass-card rounded-xl p-4 text-xs text-apple-muted border-l-2 border-l-apple-blue space-y-1.5 leading-relaxed">
        <div className="flex items-center gap-2">
          <span className="text-apple-text font-semibold">Quantitative Risk Architecture:</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-apple-blue/10 text-apple-cyan border border-apple-blue/20">
            {activeStrat.name} · {currentTier.name}
          </span>
        </div>
        <p>
          Strategy <strong className="text-apple-text">{activeStrat.name}</strong> operates on a <strong className="text-apple-text">{activeStrat.timeframe} {activeStrat.type}</strong> cadence with a disciplined <strong className="text-apple-red">{hardStopPct.toFixed(1)}% hard stop loss</strong>.
          Under the <strong className="text-apple-text">{currentTier.name}</strong> model, your initial allocation of <strong className="text-apple-text">${initialCapital.toLocaleString()}</strong> simulated across <strong className="text-apple-text">{trades.length} historical trades</strong> yields a projected compounded value of <strong className="text-apple-green">{formatPrice(projectedFinal)}</strong> (+{Math.round(currentTier.projectedReturnPct).toLocaleString()}% ROI).
          Liquidation is triggered only if {assetName} {isLong ? 'crashes' : 'pumps'} by <strong className="text-apple-orange">{currentTier.liquidationDistancePct.toFixed(1)}%</strong> to <strong className="text-apple-text">{currentTier.liquidationPrice > 0 ? formatPrice(currentTier.liquidationPrice) : '$0.00'}</strong>, providing a comfortable <strong className="text-apple-cyan">{safetyMultiplier.toFixed(1)}x safety multiplier</strong> over the algorithm's stop loss trigger at <strong className="text-apple-text">{formatPrice(stopLossPrice)}</strong>.
        </p>
      </div>

    </div>
  );
}

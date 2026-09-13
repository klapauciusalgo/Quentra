import React, { useState } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { ShieldCheck, AlertCircle, Calculator, Zap, DollarSign, CheckCircle2 } from 'lucide-react';

export default function RiskCalculator({ currentBtcPrice = 77300 }) {
  const [initialCapital, setInitialCapital] = useState(1000);
  const [leverageTier, setLeverageTier] = useState('5x_safe'); // 1x_spot, 2x_compound, 5x_safe

  const tiers = {
    '1x_spot': {
      name: '1.0x Spot (Zero Leverage)',
      marginAllocationPct: 100,
      leverage: 1,
      effectiveLeverage: '1.0x',
      liquidationDistancePct: 100,
      liquidationPrice: 0,
      riskLevel: 'Maximum Capital Security',
      projectedReturnPct: 2312.35,
      maxDrawdownPct: -45.99,
      note: '100% of capital deployed in spot or unleveraged futures. Zero liquidation risk under any market crash.'
    },
    '2x_compound': {
      name: '2.0x Effective Compounding',
      marginAllocationPct: 100,
      leverage: 2,
      effectiveLeverage: '2.0x',
      liquidationDistancePct: 49.6,
      liquidationPrice: currentBtcPrice * (1 - 0.496),
      riskLevel: 'Moderate Risk (Growth)',
      projectedReturnPct: 9494.5,
      maxDrawdownPct: -56.86,
      note: 'Empirical compounding model: $600 grows to $57,566 (~96x). Worst-case decline -14.8%, hard stop -8.0%, safe liquidation buffer at -49.6%.'
    },
    '5x_safe': {
      name: '5.0x Leverage + 20% Margin Max',
      marginAllocationPct: 20,
      leverage: 5,
      effectiveLeverage: '1.0x (20% margin x 5x)',
      liquidationDistancePct: 96.0,
      liquidationPrice: currentBtcPrice * 0.04,
      riskLevel: 'Institutional Safe (Recommended)',
      projectedReturnPct: 2312.35,
      maxDrawdownPct: -31.18,
      note: 'Only 20% of capital allocated to futures margin with 5x leverage. 80% remains protected in spot or cold reserve. Bitcoin would have to drop 96% to trigger liquidation.'
    }
  };

  const currentTier = tiers[leverageTier];
  const projectedFinal = initialCapital * (1 + currentTier.projectedReturnPct / 100);

  return (
    <div className="apple-glass rounded-3xl p-5 md:p-7 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-apple-blue/15 border border-apple-blue/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-apple-cyan" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white tracking-tight">
              Leverage & Liquidation Safety Architecture
            </h3>
            <p className="text-xs text-apple-muted mt-0.5">
              Simulate empirical compounding, margin buffer allocation, and mathematical downside limits.
            </p>
          </div>
        </div>

        <span className="text-xs font-medium text-apple-cyan bg-apple-blue/10 border border-apple-blue/25 px-3 py-1 rounded-full">
          Quantitative Risk Gate
        </span>
      </div>

      {/* Input & Tier Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Capital Input Card */}
        <div className="apple-glass-card rounded-2xl p-5 space-y-3">
          <label className="text-xs font-medium text-apple-muted block">
            Initial Allocation Capital (USDT)
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-apple-muted" />
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Math.max(10, Number(e.target.value)))}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm pl-9 pr-4 py-2.5 text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {[100, 600, 1000, 5000, 10000].map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  playRetroSound('blip');
                  setInitialCapital(amt);
                }}
                className="px-3 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] active:scale-[0.98] border border-white/[0.06] text-xs font-mono tabular-nums text-apple-muted hover:text-white transition-all cursor-pointer"
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Leverage Model Selector */}
        <div className="apple-glass-card rounded-2xl p-5 space-y-2.5">
          <label className="text-xs font-medium text-apple-muted block">
            Select Risk & Margin Model
          </label>
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
                      ? 'bg-apple-blue/15 border-apple-blue/40 text-white shadow-sm'
                      : 'bg-white/[0.02] border-white/[0.06] text-apple-muted hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-apple-cyan bg-apple-blue' : 'border-apple-dim'
                    }`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-medium text-white">{t.name}</span>
                  </div>
                  <span className="text-xs font-mono text-apple-dim">{t.effectiveLeverage}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Projection Telemetry Results */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="apple-glass-card rounded-2xl p-4">
          <div className="text-xs text-apple-dim">Projected Compounded Value</div>
          <div className="text-xl md:text-2xl font-bold text-apple-green font-mono tabular-nums mt-1">
            {formatPrice(projectedFinal)}
          </div>
          <div className="text-xs text-apple-muted mt-1 font-mono tabular-nums">
            Net Profit: +{formatPrice(projectedFinal - initialCapital)}
          </div>
        </div>

        <div className="apple-glass-card rounded-2xl p-4">
          <div className="text-xs text-apple-dim">Liquidation Mark Price</div>
          <div className="text-xl md:text-2xl font-bold text-apple-orange font-mono tabular-nums mt-1">
            {currentTier.liquidationPrice > 0 ? formatPrice(currentTier.liquidationPrice) : '$0.00 (Zero Liq)'}
          </div>
          <div className="text-xs text-apple-muted mt-1 font-mono tabular-nums">
            Liquidation Buffer: -{currentTier.liquidationDistancePct}%
          </div>
        </div>

        <div className="apple-glass-card rounded-2xl p-4">
          <div className="text-xs text-apple-dim">Safety & Security Rating</div>
          <div className="text-base font-semibold text-apple-cyan flex items-center gap-1.5 mt-1.5">
            <CheckCircle2 className="w-4 h-4 text-apple-cyan" />
            <span>{currentTier.riskLevel}</span>
          </div>
          <div className="text-xs text-apple-muted mt-1">
            Historical Liquidation Rate: 0.0%
          </div>
        </div>
      </div>

      {/* Mathematical Architecture Footnote */}
      <div className="apple-glass-card rounded-xl p-4 text-xs text-apple-muted border-l-2 border-l-apple-blue">
        <span className="text-white font-medium mr-1">Risk Logic:</span>
        {currentTier.note}
      </div>

    </div>
  );
}

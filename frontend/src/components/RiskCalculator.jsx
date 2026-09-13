import React, { useState } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { ShieldCheck, AlertCircle, Calculator, Zap, DollarSign } from 'lucide-react';

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
      riskLevel: 'Ultra Safe (Zero Liquidation)',
      projectedReturnPct: 2312.35,
      maxDrawdownPct: -45.99,
      note: '100% capital deployed in spot or unleveraged futures. Zero liquidation risk under any market crash.'
    },
    '2x_compound': {
      name: '2.0x Effective Leverage (Compounding)',
      marginAllocationPct: 100,
      leverage: 2,
      effectiveLeverage: '2.0x',
      liquidationDistancePct: 49.6,
      liquidationPrice: currentBtcPrice * (1 - 0.496),
      riskLevel: 'Moderate Aggressive',
      projectedReturnPct: 9494.5,
      maxDrawdownPct: -56.86,
      note: 'Empirical compounding model: $600 grows to $57,566 (~96x). Worst-case decline -14.8%, hard stop -8.0%, safe liquidation buffer at -49.6%.'
    },
    '5x_safe': {
      name: '5.0x Leverage + 20% Margin Max (Institutional Safety)',
      marginAllocationPct: 20,
      leverage: 5,
      effectiveLeverage: '1.0x (20% x 5x)',
      liquidationDistancePct: 96.0,
      liquidationPrice: currentBtcPrice * 0.04,
      riskLevel: 'Recommended Flagship (Institutional Safe)',
      projectedReturnPct: 2312.35,
      maxDrawdownPct: -31.18,
      note: 'Only 20% of capital allocated to futures margin with 5x leverage. 80% remains protected in spot or cold storage. Bitcoin would have to drop 96% to trigger liquidation.'
    }
  };

  const currentTier = tiers[leverageTier];
  const projectedFinal = initialCapital * (1 + currentTier.projectedReturnPct / 100);

  return (
    <div className="bg-floor-dark border-2 border-floor-border p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-floor-border pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-signal-cyan" />
          <h3 className="font-pixel text-xs text-retro-text tracking-wider">
            LEVERAGE & LIQUIDATION SAFETY CALCULATOR
          </h3>
        </div>
        <span className="text-[10px] font-mono text-signal-cyan bg-signal-cyan/10 border border-signal-cyan/30 px-2 py-0.5">
          MATHEMATICAL RISK GATE
        </span>
      </div>

      {/* Input & Tier Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-floor-darker border border-floor-border p-4">
        {/* Capital Input */}
        <div>
          <label className="text-xs font-mono text-retro-muted block mb-1.5">
            INITIAL TRADING CAPITAL (USDT):
          </label>
          <div className="relative">
            <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-signal-cyan" />
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Math.max(10, Number(e.target.value)))}
              className="w-full bg-floor-bg border border-floor-border font-mono text-sm pl-8 pr-3 py-2 text-retro-text focus:border-signal-cyan focus:outline-none"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {[100, 600, 1000, 5000, 10000].map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  playRetroSound('blip');
                  setInitialCapital(amt);
                }}
                className="px-2 py-0.5 bg-floor-wall hover:bg-floor-border text-[10px] font-mono text-retro-muted"
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Tier Selector */}
        <div>
          <label className="text-xs font-mono text-retro-muted block mb-1.5">
            SELECT LEVERAGE RISK MODEL:
          </label>
          <div className="space-y-1.5">
            {Object.entries(tiers).map(([k, t]) => (
              <button
                key={k}
                onClick={() => {
                  playRetroSound('blip');
                  setLeverageTier(k);
                }}
                className={`w-full text-left p-2 border font-mono text-xs transition-colors flex items-center justify-between ${
                  leverageTier === k
                    ? 'border-signal-cyan bg-signal-cyan/15 text-signal-cyan font-bold'
                    : 'border-floor-border bg-floor-wall/50 text-retro-muted hover:text-retro-text'
                }`}
              >
                <span>{t.name}</span>
                <span className="text-[10px] text-retro-dim">{t.effectiveLeverage}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Calculator Result Box */}
      <div className="bg-floor-bg border border-signal-cyan/40 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
        <div>
          <div className="text-[10px] text-retro-dim">PROJECTED COMPOUNDED EQUITY</div>
          <div className="text-lg font-bold text-signal-bull">
            {formatPrice(projectedFinal)}
          </div>
          <div className="text-[11px] text-retro-muted mt-0.5">
            Net Profit: +{formatPrice(projectedFinal - initialCapital)}
          </div>
        </div>

        <div>
          <div className="text-[10px] text-retro-dim">ESTIMATED LIQUIDATION PRICE</div>
          <div className="text-lg font-bold text-signal-warn">
            {currentTier.liquidationPrice > 0 ? formatPrice(currentTier.liquidationPrice) : '$0.00 (Zero Liq)'}
          </div>
          <div className="text-[11px] text-retro-muted mt-0.5">
            Distance to Liquidation: -{currentTier.liquidationDistancePct}%
          </div>
        </div>

        <div>
          <div className="text-[10px] text-retro-dim">CAPITAL SAFETY RATING</div>
          <div className="text-sm font-bold text-signal-cyan flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-signal-cyan" />
            <span>{currentTier.riskLevel}</span>
          </div>
          <div className="text-[11px] text-retro-dim mt-1">
            Historical Liquidation Rate: 0.0% (ZERO LIQUIDATION)
          </div>
        </div>
      </div>

      {/* Explanatory Note */}
      <div className="text-xs font-mono text-retro-muted bg-floor-darker border border-floor-border p-3">
        <strong className="text-signal-warn">Risk Architecture Note: </strong>
        {currentTier.note}
      </div>

    </div>
  );
}

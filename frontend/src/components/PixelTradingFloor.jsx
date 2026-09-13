import React, { useState } from 'react';
import { playRetroSound, formatPrice, formatPercent } from '../utils/formatters';
import SignalTicket from './SignalTicket';
import { Shield, Activity, Cpu, Compass, Radio, ChevronRight, Zap, Info, Layers } from 'lucide-react';

export default function PixelTradingFloor({ floor, onSelectAgent, onSelectStrategy, currentBtcPrice }) {
  const [hoveredAgent, setHoveredAgent] = useState(null);
  const activeAgentId = floor?.active_agent_id || 'trader';
  const signalTicket = floor?.signal_ticket;

  const handleAgentClick = (agentId) => {
    playRetroSound('desk_click');
    if (onSelectAgent) onSelectAgent(agentId);
  };

  const agents = [
    {
      id: 'trader',
      name: 'Trader Desk',
      role: 'Signal Dispatcher & Execution',
      icon: <Activity className="w-5 h-5 text-apple-cyan" />,
      accentColor: 'border-apple-cyan/30 text-apple-cyan',
      tag: 'Lead Execution',
      headline: 'Flagship Signal Dispatch Primed',
      metricLabel: 'Target Model',
      metricValue: 'Pippo 1H Enhanced',
      secondaryLabel: 'Take Profit',
      secondaryValue: '+75.0% Runner',
      bubble: 'Pippo 1H Enhanced setup primed. Limit orders standing by for breakout close.'
    },
    {
      id: 'quant',
      name: 'Quant Engine',
      role: 'SMC & Algorithmic Indicators',
      icon: <Cpu className="w-5 h-5 text-apple-green" />,
      accentColor: 'border-apple-green/30 text-apple-green',
      tag: 'Algorithmic Model',
      headline: '16-Bar Internal Breakout Bullish',
      metricLabel: 'RSI14 Momentum',
      metricValue: '56.4 (Bull Territory)',
      secondaryLabel: '48H Support Floor',
      secondaryValue: '$74,800',
      bubble: '1H internal structure broke bullish. 48-hour structural floor intact.'
    },
    {
      id: 'researcher',
      name: 'Researcher Desk',
      role: 'Macro & On-Chain Intelligence',
      icon: <Compass className="w-5 h-5 text-apple-blue" />,
      accentColor: 'border-apple-blue/30 text-apple-blue',
      tag: 'On-Chain Scout',
      headline: 'Long-Term Accumulation Steady',
      metricLabel: 'Circulating Supply',
      metricValue: '74% Long-Term Holders',
      secondaryLabel: 'Derivatives Funding',
      secondaryValue: 'Neutral (-0.002%)',
      bubble: 'Global liquidity index +2.4%. On-chain UTXO accumulation steady.'
    },
    {
      id: 'informan',
      name: 'Informan Station',
      role: 'Macro Stance & Cycle Regime',
      icon: <Radio className="w-5 h-5 text-apple-orange" />,
      accentColor: 'border-apple-orange/30 text-apple-orange',
      tag: 'Regime Monitor',
      headline: `Weekly MA55 Anchor $${Number(floor?.market_regime?.weekly_ma55 || 82654).toLocaleString()}`,
      metricLabel: 'Macro Discount',
      metricValue: `${floor?.market_regime?.distance_pct || -6.5}% to MA55`,
      secondaryLabel: 'Market Session',
      secondaryValue: floor?.session?.code || 'LDN / NY',
      bubble: `Weekly MA55 at $${Number(floor?.market_regime?.weekly_ma55 || 82654).toLocaleString()}. Macro accumulation floor validated.`
    },
    {
      id: 'risk_officer',
      name: 'Risk Officer',
      role: 'Capital Preservation & Volatility Guard',
      icon: <Shield className="w-5 h-5 text-apple-purple" />,
      accentColor: 'border-apple-purple/30 text-apple-purple',
      tag: 'Liquidation Guard',
      headline: 'Liquidation Buffer: -96% Safe Distance',
      metricLabel: 'Max Leverage',
      metricValue: '1.0x Spot Safe',
      secondaryLabel: 'Cash Buffer',
      secondaryValue: '80% Free Capital',
      bubble: 'Liquidation buffer verified -96% from market. Drawdown stop locked.'
    }
  ];

  return (
    <div className="apple-glass rounded-3xl border border-white/[0.08] p-5 sm:p-7 space-y-6 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
      
      {/* Top Command Center Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-apple-cyan/10 border border-apple-cyan/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-apple-cyan" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                Autonomous Agent Desk
              </h2>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-apple-green/10 border border-apple-green/20 text-apple-green flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-apple-green animate-pulse" />
                5 Models Active
              </span>
            </div>
            <p className="text-xs text-apple-muted">
              Multi-agent quantitative execution and real-time market regime oversight
            </p>
          </div>
        </div>

        {/* Global Macro Telemetry Pills */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-2 bg-black/40 border border-white/[0.08] rounded-full px-3.5 py-1.5">
            <span className="text-apple-dim">Weekly MA55:</span>
            <span className={`font-mono font-medium ${floor?.market_regime?.distance_pct >= 0 ? 'text-apple-green' : 'text-apple-orange'}`}>
              ${Number(floor?.market_regime?.weekly_ma55 || 82654).toLocaleString()}
            </span>
            <span className="text-apple-muted tabular-nums">
              ({floor?.market_regime?.distance_pct >= 0 ? '+' : ''}{floor?.market_regime?.distance_pct || -6.5}%)
            </span>
          </div>

          <div className="flex items-center gap-2 bg-black/40 border border-white/[0.08] rounded-full px-3.5 py-1.5 text-zinc-300">
            <span className="text-apple-dim">Active Session:</span>
            <span className="font-medium text-white">{floor?.session?.name || 'Asia Session (Tokyo / HK)'}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: 5 Agent Bento Cards + Central Signal Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column: Macro & Quant Agents (2 cards) */}
        <div className="space-y-4">
          {agents.slice(2, 4).map((agent) => {
            const isActive = activeAgentId === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => handleAgentClick(agent.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-white/[0.06] border-white/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] scale-[1.01]'
                    : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                      {agent.icon}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-apple-cyan transition-colors">
                        {agent.name}
                      </div>
                      <div className="text-[10px] text-apple-dim">
                        {agent.role}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-medium px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-apple-muted">
                    {agent.tag}
                  </span>
                </div>

                <div className="bg-black/30 rounded-xl p-2.5 border border-white/[0.04] mb-3 text-[11px] text-zinc-300 italic leading-relaxed">
                  "{agent.bubble}"
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-white/[0.04] pt-2">
                  <div>
                    <span className="text-apple-dim block">{agent.metricLabel}</span>
                    <span className="font-mono font-medium text-zinc-200">{agent.metricValue}</span>
                  </div>
                  <div>
                    <span className="text-apple-dim block">{agent.secondaryLabel}</span>
                    <span className="font-mono font-medium text-zinc-200">{agent.secondaryValue}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center Column: Flagship Execution Desk & Active Signal Ticket */}
        <div className="space-y-4 flex flex-col justify-between">
          {/* Trader Desk Lead Card */}
          <div
            onClick={() => handleAgentClick('trader')}
            className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
              activeAgentId === 'trader'
                ? 'bg-apple-cyan/[0.08] border-apple-cyan/40 shadow-[0_4px_24px_rgba(100,210,255,0.15)] scale-[1.01]'
                : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-apple-cyan/15 border border-apple-cyan/30 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-apple-cyan" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    Trader Desk
                    <span className="w-1.5 h-1.5 rounded-full bg-apple-cyan animate-pulse" />
                  </div>
                  <div className="text-[10px] text-apple-muted">
                    Execution Desk & Signal Dispatcher
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-apple-cyan/30 bg-apple-cyan/10 text-apple-cyan">
                Lead Model
              </span>
            </div>

            <div className="bg-black/40 rounded-xl p-3 border border-white/[0.06] mb-3 text-xs text-zinc-200 font-medium leading-relaxed">
              "Pippo 1H Enhanced setup primed. Limit orders standing by for breakout close."
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/[0.06] pt-2.5">
              <div>
                <span className="text-apple-dim text-[10px] block">Execution Target</span>
                <span className="font-semibold text-white">Pippo 1H Enhanced</span>
              </div>
              <div className="text-right">
                <span className="text-apple-dim text-[10px] block">Profit Target</span>
                <span className="font-semibold text-apple-green">+75.0% Runner</span>
              </div>
            </div>
          </div>

          {/* Integrated Live Signal Ticket */}
          <SignalTicket
            ticket={signalTicket}
            onSelectStrategy={onSelectStrategy}
          />
        </div>

        {/* Right Column: Quant Engine & Risk Officer (2 cards) */}
        <div className="space-y-4">
          {[agents[1], agents[4]].map((agent) => {
            const isActive = activeAgentId === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => handleAgentClick(agent.id)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-white/[0.06] border-white/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] scale-[1.01]'
                    : 'bg-black/30 border-white/[0.06] hover:bg-white/[0.04] hover:border-white/15'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                      {agent.icon}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white group-hover:text-apple-cyan transition-colors">
                        {agent.name}
                      </div>
                      <div className="text-[10px] text-apple-dim">
                        {agent.role}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-medium px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-apple-muted">
                    {agent.tag}
                  </span>
                </div>

                <div className="bg-black/30 rounded-xl p-2.5 border border-white/[0.04] mb-3 text-[11px] text-zinc-300 italic leading-relaxed">
                  "{agent.bubble}"
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] border-t border-white/[0.04] pt-2">
                  <div>
                    <span className="text-apple-dim block">{agent.metricLabel}</span>
                    <span className="font-mono font-medium text-zinc-200">{agent.metricValue}</span>
                  </div>
                  <div>
                    <span className="text-apple-dim block">{agent.secondaryLabel}</span>
                    <span className="font-mono font-medium text-zinc-200">{agent.secondaryValue}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {/* Bottom Hint Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-apple-muted bg-black/30 rounded-xl p-3 border border-white/[0.04]">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-apple-cyan shrink-0" />
          <span>Select any agent desk to inspect live quantitative reasoning, on-chain metrics, and risk limits.</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-apple-dim">Selected Desk:</span>
          <span className="font-semibold text-apple-cyan capitalize">
            {activeAgentId.replace('_', ' ')}
          </span>
        </div>
      </div>

    </div>
  );
}

import React from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { ArrowUpRight, ArrowDownRight, Zap, Target, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function SignalTicket({ ticket, compact = false, onSelectStrategy }) {
  if (!ticket) return null;

  const isLong = ticket.direction === 'LONG';
  const isShort = ticket.direction === 'SHORT';

  const badgeStyles = isLong 
    ? 'text-apple-green bg-apple-green/10 border-apple-green/20' 
    : isShort 
    ? 'text-apple-red bg-apple-red/10 border-apple-red/20' 
    : 'text-apple-orange bg-apple-orange/10 border-apple-orange/20';

  const totalBlocks = 10;
  const activeBlocks = ticket.confidence_blocks || 8;

  return (
    <div className="apple-glass rounded-2xl border border-white/[0.08] p-4 text-xs font-sans shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-all hover:border-white/20">
      
      {/* Top Apple Header & Status */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-apple-cyan shadow-[0_0_6px_rgba(100,210,255,0.7)]" />
          <span className="text-[11px] font-semibold tracking-wider text-apple-muted uppercase">
            Live Signal Activity
          </span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-apple-dim">
          {ticket.status || 'Active Watch'}
        </span>
      </div>

      {/* Symbol & Direction Pill */}
      <div className="flex items-center justify-between gap-3 mb-3.5">
        <div>
          <div className="text-sm font-semibold text-white tracking-tight">
            {ticket.symbol}
          </div>
          <div className="text-[11px] text-apple-muted truncate max-w-[160px]">
            {ticket.strategy_name}
          </div>
        </div>

        <div className={`px-2.5 py-1 rounded-full border text-xs font-semibold flex items-center gap-1 tabular-nums ${badgeStyles}`}>
          {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          <span>{ticket.direction}</span>
        </div>
      </div>

      {/* Confidence Segmented Gauge */}
      <div className="mb-3.5 bg-black/40 rounded-xl p-2.5 border border-white/[0.04]">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-apple-dim font-medium">Model Confidence</span>
          <span className="text-apple-cyan font-semibold tabular-nums">{ticket.confidence_pct || 88}%</span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalBlocks }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                i < activeBlocks 
                  ? (isLong ? 'bg-apple-green shadow-[0_0_4px_rgba(48,209,88,0.5)]' : 'bg-apple-red shadow-[0_0_4px_rgba(255,69,58,0.5)]') 
                  : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Key Order Execution Targets */}
      <div className="space-y-2 text-xs bg-black/25 rounded-xl p-3 border border-white/[0.04] mb-3.5">
        <div className="flex items-center justify-between">
          <span className="text-apple-dim">Entry Target</span>
          <span className="font-mono font-medium text-white tabular-nums">{formatPrice(ticket.entry_price)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-apple-red flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-apple-red" />
            <span>Stop Loss</span>
          </span>
          <span className="font-mono font-medium text-apple-red tabular-nums">
            {formatPrice(ticket.stop_loss)} ({ticket.stop_loss_pct}%)
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-apple-orange flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-apple-orange" />
            <span>Breakeven</span>
          </span>
          <span className="font-mono font-medium text-apple-orange tabular-nums">
            {formatPrice(ticket.breakeven_trigger)} (+{ticket.breakeven_trigger_pct}%)
          </span>
        </div>

        <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.06]">
          <span className="text-apple-green flex items-center gap-1.5 font-medium">
            <Target className="w-3.5 h-3.5 text-apple-green" />
            <span>Take Profit</span>
          </span>
          <span className="font-mono font-semibold text-apple-green tabular-nums">
            {formatPrice(ticket.take_profit)} (+{ticket.take_profit_pct}%)
          </span>
        </div>
      </div>

      {/* Contributing Agents & Action */}
      <div className="flex items-center justify-between pt-1 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-apple-dim">Desk:</span>
          <div className="flex -space-x-1">
            <span className="w-5 h-5 rounded-full bg-apple-cyan/20 border border-apple-cyan/40 text-[9px] flex items-center justify-center text-apple-cyan font-semibold" title="Quant Desk">Q</span>
            <span className="w-5 h-5 rounded-full bg-apple-green/20 border border-apple-green/40 text-[9px] flex items-center justify-center text-apple-green font-semibold" title="Trader Execution">T</span>
            <span className="w-5 h-5 rounded-full bg-apple-orange/20 border border-apple-orange/40 text-[9px] flex items-center justify-center text-apple-orange font-semibold" title="Intelligence Desk">I</span>
          </div>
        </div>

        {onSelectStrategy && (
          <button
            onClick={() => {
              playRetroSound('select');
              onSelectStrategy(ticket.strategy_id || 'pippo-1h-enhanced');
            }}
            className="text-apple-cyan hover:text-white font-medium transition-colors cursor-pointer"
          >
            Inspect Algo →
          </button>
        )}
      </div>

    </div>
  );
}

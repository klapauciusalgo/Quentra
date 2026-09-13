import React from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { ArrowUpRight, ArrowDownRight, Zap, Target, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function SignalTicket({ ticket, compact = false, onSelectStrategy }) {
  if (!ticket) return null;

  const isLong = ticket.direction === 'LONG';
  const isShort = ticket.direction === 'SHORT';

  const badgeColor = isLong 
    ? 'text-signal-bull border-signal-bull bg-signal-bull/10 shadow-pixel-green' 
    : isShort 
    ? 'text-signal-bear border-signal-bear bg-signal-bear/10 shadow-pixel-red' 
    : 'text-signal-warn border-signal-warn bg-signal-warn/10 shadow-pixel-amber';

  const totalBlocks = 10;
  const activeBlocks = ticket.confidence_blocks || 8;

  return (
    <div 
      className={`bg-floor-darker border-2 border-pixel ${
        isLong ? 'border-signal-bull/50' : 'border-signal-bear/50'
      } p-3 relative font-mono shadow-arcade transition-all duration-200 hover:border-signal-cyan`}
    >
      {/* Top Arcade High-Score Header */}
      <div className="flex items-center justify-between border-b border-floor-border pb-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 bg-signal-cyan animate-pulse"></span>
          <span className="font-pixel text-[9px] text-signal-cyan tracking-wider">
            TERMINAL TICKET
          </span>
        </div>
        <div className="text-[10px] text-retro-muted font-pixel">
          {ticket.status || 'ACTIVE'}
        </div>
      </div>

      {/* Coin & Direction Badge */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div>
          <div className="font-pixel text-xs md:text-sm text-retro-text tracking-wide">
            {ticket.symbol}
          </div>
          <div className="text-[10px] text-retro-muted truncate max-w-[150px]">
            {ticket.strategy_name}
          </div>
        </div>

        <div className={`font-pixel text-xs px-2.5 py-1 border-2 ${badgeColor} flex items-center gap-1`}>
          {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          <span>{ticket.direction}</span>
        </div>
      </div>

      {/* Confidence Segmented Health-Bar */}
      <div className="mb-3 bg-floor-wall p-1.5 border border-floor-border">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-retro-muted font-pixel text-[8px]">CONFIDENCE</span>
          <span className="text-signal-cyan font-bold">{ticket.confidence_pct || 88}%</span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalBlocks }).map((_, i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 border border-floor-darker ${
                i < activeBlocks 
                  ? (isLong ? 'bg-signal-bull' : 'bg-signal-bear') 
                  : 'bg-floor-border'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Key Order Levels */}
      <div className="space-y-1.5 text-xs bg-floor-bg border border-floor-border p-2 mb-3">
        <div className="flex items-center justify-between">
          <span className="text-retro-dim text-[11px]">ENTRY TARGET</span>
          <span className="font-bold text-retro-text">{formatPrice(ticket.entry_price)}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-signal-bear text-[11px] flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> STOP LOSS
          </span>
          <span className="font-bold text-signal-bear">
            {formatPrice(ticket.stop_loss)} ({ticket.stop_loss_pct}%)
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-signal-warn text-[11px] flex items-center gap-1">
            <Zap className="w-3 h-3" /> BREAKEVEN
          </span>
          <span className="font-bold text-signal-warn">
            {formatPrice(ticket.breakeven_trigger)} (+{ticket.breakeven_trigger_pct}%)
          </span>
        </div>

        <div className="flex items-center justify-between border-t border-floor-border pt-1">
          <span className="text-signal-bull text-[11px] flex items-center gap-1">
            <Target className="w-3 h-3" /> TAKE PROFIT
          </span>
          <span className="font-bold text-signal-bull">
            {formatPrice(ticket.take_profit)} (+{ticket.take_profit_pct}%)
          </span>
        </div>
      </div>

      {/* Contributing Agent Icons & Action */}
      <div className="flex items-center justify-between pt-1 border-t border-floor-border text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-retro-dim text-[9px]">AGENTS:</span>
          <div className="flex -space-x-1">
            <span className="w-4 h-4 rounded-none bg-signal-cyan/20 border border-signal-cyan text-[8px] flex items-center justify-center text-signal-cyan font-bold" title="Quant">Q</span>
            <span className="w-4 h-4 rounded-none bg-signal-bull/20 border border-signal-bull text-[8px] flex items-center justify-center text-signal-bull font-bold" title="Trader">T</span>
            <span className="w-4 h-4 rounded-none bg-signal-warn/20 border border-signal-warn text-[8px] flex items-center justify-center text-signal-warn font-bold" title="Intelligence">I</span>
          </div>
        </div>

        {onSelectStrategy && (
          <button
            onClick={() => {
              playRetroSound('select');
              onSelectStrategy(ticket.strategy_id || 'pippo-1h-enhanced');
            }}
            className="text-[9px] font-pixel text-signal-cyan hover:underline"
          >
            VIEW ALGO &gt;
          </button>
        )}
      </div>

    </div>
  );
}

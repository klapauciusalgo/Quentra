import React, { useState } from 'react';
import { playRetroSound } from '../utils/formatters';
import SignalTicket from './SignalTicket';
import { Terminal, Shield, Activity, Cpu, Compass, MessageSquare, Info } from 'lucide-react';

export default function PixelTradingFloor({ floor, onSelectAgent, onSelectStrategy, currentBtcPrice }) {
  const [hoveredAgent, setHoveredAgent] = useState(null);
  const activeAgentId = floor?.active_agent_id || 'trader';
  const signalTicket = floor?.signal_ticket;

  const handleAgentClick = (agentId) => {
    playRetroSound('desk_click');
    if (onSelectAgent) onSelectAgent(agentId);
  };

  return (
    <div className="relative bg-floor-dark border-2 border-floor-border p-4 md:p-6 overflow-hidden">
      
      {/* Top Floor Header & Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-floor-border pb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-signal-cyan animate-pulse"></div>
          <span className="font-pixel text-xs text-signal-cyan tracking-wider">
            PIXEL TRADING FLOOR
          </span>
          <span className="text-retro-dim font-mono text-xs hidden sm:inline">
            // 16-BIT AUTONOMOUS SIGNAL DESK
          </span>
        </div>

        {/* Market Regime Stance */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="bg-floor-wall border border-floor-border px-2.5 py-1 flex items-center gap-2">
            <span className="text-retro-muted">MACRO REGIME:</span>
            <span className={`font-bold ${floor?.market_regime?.distance_pct >= 0 ? 'text-signal-bull' : 'text-signal-warn'}`}>
              WEEKLY MA55 (${Number(floor?.market_regime?.weekly_ma55 || 82654).toLocaleString()})
            </span>
            <span className="text-retro-dim">
              ({floor?.market_regime?.distance_pct >= 0 ? '+' : ''}{floor?.market_regime?.distance_pct || -6.5}%)
            </span>
          </div>
        </div>
      </div>

      {/* Isometric 2.5D Trading Floor Viewport */}
      <div className="relative w-full min-h-[440px] md:min-h-[500px] bg-[#161822] border-2 border-floor-wall overflow-hidden flex items-center justify-center p-4">
        
        {/* Ambient Isometric Grid Floor Background */}
        <div 
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(30deg, #2D344B 12%, transparent 12.5%, transparent 87%, #2D344B 87.5%, #2D344B),
              linear-gradient(150deg, #2D344B 12%, transparent 12.5%, transparent 87%, #2D344B 87.5%, #2D344B),
              linear-gradient(30deg, #2D344B 12%, transparent 12.5%, transparent 87%, #2D344B 87.5%, #2D344B),
              linear-gradient(150deg, #2D344B 12%, transparent 12.5%, transparent 87%, #2D344B 87.5%, #2D344B),
              linear-gradient(60deg, #2D344B77 25%, transparent 25.5%, transparent 75%, #2D344B77 75%, #2D344B77),
              linear-gradient(60deg, #2D344B77 25%, transparent 25.5%, transparent 75%, #2D344B77 75%, #2D344B77)
            `,
            backgroundSize: '40px 70px',
            backgroundPosition: '0 0, 0 0, 20px 35px, 20px 35px, 0 0, 20px 35px'
          }}
        />

        {/* Back Wall Windows & Skyline */}
        <div className="absolute top-0 left-0 right-0 h-20 bg-floor-wall border-b-2 border-floor-border flex justify-around items-end pb-1 px-8 opacity-90">
          <div className="w-24 h-12 bg-[#0d1017] border border-floor-borderLight flex flex-col justify-end p-1">
            <div className="h-4 bg-signal-cyan/20 w-3 self-start mb-1"></div>
            <div className="text-[8px] font-pixel text-signal-cyan/60">TOKYO</div>
          </div>
          <div className="w-32 h-14 bg-[#0d1017] border border-floor-borderLight flex flex-col justify-end p-1">
            <div className="flex gap-1 mb-1">
              <div className="h-6 bg-signal-bull/30 w-3"></div>
              <div className="h-8 bg-signal-warn/20 w-4"></div>
            </div>
            <div className="text-[8px] font-pixel text-signal-warn/60">LONDON</div>
          </div>
          <div className="w-28 h-12 bg-[#0d1017] border border-floor-borderLight flex flex-col justify-end p-1">
            <div className="h-5 bg-signal-purple/30 w-3 mb-1"></div>
            <div className="text-[8px] font-pixel text-signal-purple/60">NEW YORK</div>
          </div>
        </div>

        {/* Floor Scene Container */}
        <div className="relative z-10 w-full max-w-[1000px] h-[450px]">

          {/* =========================================================
              1. INFORMAN DESK (Back Wall Center, Elevated Outlook)
             ========================================================= */}
          <div 
            onClick={() => handleAgentClick('informan')}
            onMouseEnter={() => setHoveredAgent('informan')}
            onMouseLeave={() => setHoveredAgent(null)}
            className={`absolute top-6 left-1/2 -translate-x-1/2 cursor-pointer transition-all duration-300 group ${
              activeAgentId === 'informan' ? 'scale-105 z-30' : 'hover:scale-102 z-20'
            }`}
            style={{ width: '220px' }}
          >
            {/* Speech Bubble */}
            <div className="relative mb-1 text-center">
              <div className="inline-block bg-floor-darker border border-signal-warn text-signal-warn font-mono text-[10px] px-2 py-0.5 shadow-pixel-amber">
                Weekly MA55 Stance: Bearish Discount
              </div>
              <div className="w-1.5 h-1.5 bg-signal-warn rotate-45 mx-auto -mt-0.5"></div>
            </div>

            {/* Pixel Desk Unit */}
            <div className={`p-2 bg-floor-desk border-2 ${
              activeAgentId === 'informan' ? 'border-signal-cyan shadow-pixel-cyan' : 'border-floor-deskBorder'
            }`}>
              {/* Agent Sprite & Board */}
              <div className="flex items-center justify-between gap-2">
                {/* Informan Pixel Character */}
                <div className="w-8 h-8 bg-[#D4A373] border-2 border-[#8C5E32] flex flex-col items-center justify-center pixelated relative">
                  <div className="w-4 h-2 bg-[#2D344B]"></div>
                  <div className="w-6 h-3 bg-[#E76F51] mt-0.5"></div>
                </div>
                {/* Outlook Wall Board */}
                <div className="flex-1 bg-floor-darker border border-floor-border p-1 text-[9px] font-mono text-signal-warn text-right">
                  <div>REGIME: MACRO</div>
                  <div className="text-[8px] text-retro-muted">W-MA55 $82.6k</div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-pixel text-retro-text pt-1 border-t border-floor-deskBorder">
                <span className="text-signal-warn">INFORMAN</span>
                <span className="text-[8px] text-retro-muted">MACRO</span>
              </div>
            </div>
          </div>

          {/* =========================================================
              2. RESEARCHER DESK (Mid-Room Left)
             ========================================================= */}
          <div 
            onClick={() => handleAgentClick('researcher')}
            onMouseEnter={() => setHoveredAgent('researcher')}
            onMouseLeave={() => setHoveredAgent(null)}
            className={`absolute top-28 left-4 md:left-12 cursor-pointer transition-all duration-300 group ${
              activeAgentId === 'researcher' ? 'scale-105 z-30' : 'hover:scale-102 z-20'
            }`}
            style={{ width: '200px' }}
          >
            {/* Speech Bubble */}
            <div className="relative mb-1">
              <div className="inline-block bg-floor-darker border border-signal-cyan text-signal-cyan font-mono text-[10px] px-2 py-0.5 shadow-pixel-cyan">
                On-Chain: Long-term Accumulation
              </div>
              <div className="w-1.5 h-1.5 bg-signal-cyan rotate-45 ml-6 -mt-0.5"></div>
            </div>

            {/* Desk Visual */}
            <div className={`p-2 bg-floor-desk border-2 ${
              activeAgentId === 'researcher' ? 'border-signal-cyan shadow-pixel-cyan' : 'border-floor-deskBorder'
            }`}>
              <div className="flex items-center gap-2">
                {/* Researcher Sprite */}
                <div className="w-8 h-8 bg-[#E9C46A] border-2 border-[#B08947] flex flex-col items-center justify-center pixelated relative">
                  <div className="w-4 h-2 bg-[#264653]"></div>
                  <div className="w-5 h-3 bg-[#2A9D8F] mt-0.5"></div>
                </div>
                {/* Papers & Magnifying Glass */}
                <div className="flex-1 bg-floor-darker border border-floor-border p-1 text-[9px] font-mono text-signal-cyan">
                  <div>DATA: UTXO +2.4%</div>
                  <div className="text-[8px] text-retro-muted">DERIV: NEUTRAL</div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-pixel text-retro-text pt-1 border-t border-floor-deskBorder">
                <span className="text-signal-cyan">RESEARCHER</span>
                <span className="text-[8px] text-retro-muted">ON-CHAIN</span>
              </div>
            </div>
          </div>

          {/* =========================================================
              3. QUANT DESK (Mid-Room Right)
             ========================================================= */}
          <div 
            onClick={() => handleAgentClick('quant')}
            onMouseEnter={() => setHoveredAgent('quant')}
            onMouseLeave={() => setHoveredAgent(null)}
            className={`absolute top-28 right-4 md:right-12 cursor-pointer transition-all duration-300 group ${
              activeAgentId === 'quant' ? 'scale-105 z-30' : 'hover:scale-102 z-20'
            }`}
            style={{ width: '210px' }}
          >
            {/* Speech Bubble */}
            <div className="relative mb-1 text-right">
              <div className="inline-block bg-floor-darker border border-signal-bull text-signal-bull font-mono text-[10px] px-2 py-0.5 shadow-pixel-green">
                SMC 16-bar Breakout Bullish
              </div>
              <div className="w-1.5 h-1.5 bg-signal-bull rotate-45 ml-auto mr-6 -mt-0.5"></div>
            </div>

            {/* Desk Visual */}
            <div className={`p-2 bg-floor-desk border-2 ${
              activeAgentId === 'quant' ? 'border-signal-cyan shadow-pixel-cyan' : 'border-floor-deskBorder'
            }`}>
              <div className="flex items-center gap-2">
                {/* Multi-monitors */}
                <div className="flex-1 bg-floor-darker border border-floor-border p-1 text-[9px] font-mono text-signal-bull">
                  <div>RSI14: 56.4 (BULL)</div>
                  <div className="text-[8px] text-retro-muted">48H FLOOR: $74.8K</div>
                </div>
                {/* Quant Sprite */}
                <div className="w-8 h-8 bg-[#F4A261] border-2 border-[#E76F51] flex flex-col items-center justify-center pixelated relative">
                  <div className="w-4 h-2 bg-[#2D344B]"></div>
                  <div className="w-5 h-3 bg-[#39FF88] mt-0.5"></div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-pixel text-retro-text pt-1 border-t border-floor-deskBorder">
                <span className="text-signal-bull">QUANT</span>
                <span className="text-[8px] text-retro-muted">SMC / RSI</span>
              </div>
            </div>
          </div>

          {/* =========================================================
              4. RISK OFFICER DESK (Far Left Guard)
             ========================================================= */}
          <div 
            onClick={() => handleAgentClick('risk_officer')}
            onMouseEnter={() => setHoveredAgent('risk_officer')}
            onMouseLeave={() => setHoveredAgent(null)}
            className={`absolute bottom-6 left-4 md:left-8 cursor-pointer transition-all duration-300 group hidden sm:block ${
              activeAgentId === 'risk_officer' ? 'scale-105 z-30' : 'hover:scale-102 z-20'
            }`}
            style={{ width: '190px' }}
          >
            {/* Speech Bubble */}
            <div className="relative mb-1">
              <div className="inline-block bg-floor-darker border border-signal-purple text-signal-purple font-mono text-[10px] px-2 py-0.5">
                Liquidation Buffer: -96% Safe
              </div>
              <div className="w-1.5 h-1.5 bg-signal-purple rotate-45 ml-6 -mt-0.5"></div>
            </div>

            {/* Desk Visual */}
            <div className={`p-2 bg-floor-desk border-2 ${
              activeAgentId === 'risk_officer' ? 'border-signal-cyan shadow-pixel-cyan' : 'border-floor-deskBorder'
            }`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#A855F7]/30 border-2 border-signal-purple flex flex-col items-center justify-center pixelated">
                  <Shield className="w-4 h-4 text-signal-purple" />
                </div>
                <div className="flex-1 bg-floor-darker border border-floor-border p-1 text-[9px] font-mono text-signal-purple">
                  <div>LEVERAGE: 1.0X</div>
                  <div className="text-[8px] text-retro-muted">FREE CASH: 80%</div>
                </div>
              </div>
              <div className="mt-1 flex items-center justify-between text-[9px] font-pixel text-retro-text pt-1 border-t border-floor-deskBorder">
                <span className="text-signal-purple">RISK OFFICER</span>
                <span className="text-[8px] text-retro-muted">GUARD</span>
              </div>
            </div>
          </div>

          {/* =========================================================
              5. TRADER DESK (Front-and-Center Standing Station)
             ========================================================= */}
          <div 
            onClick={() => handleAgentClick('trader')}
            onMouseEnter={() => setHoveredAgent('trader')}
            onMouseLeave={() => setHoveredAgent(null)}
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 cursor-pointer transition-all duration-300 group ${
              activeAgentId === 'trader' ? 'scale-105 z-30' : 'hover:scale-102 z-20'
            }`}
            style={{ width: '260px' }}
          >
            {/* Speech Bubble */}
            <div className="relative mb-1 text-center">
              <div className="inline-block bg-floor-darker border-2 border-signal-cyan text-signal-cyan font-mono text-[11px] px-3 py-1 shadow-pixel-cyan font-bold">
                FLAGSHIP SIGNAL DISPATCH ACTIVE
              </div>
              <div className="w-2 h-2 bg-signal-cyan rotate-45 mx-auto -mt-1"></div>
            </div>

            {/* Standing Workstation */}
            <div className={`p-2.5 bg-floor-desk border-2 ${
              activeAgentId === 'trader' ? 'border-signal-cyan shadow-pixel-cyan' : 'border-floor-deskBorder'
            }`}>
              <div className="flex items-center justify-between gap-3">
                {/* Standing Trader Sprite */}
                <div className="w-10 h-10 bg-[#E76F51] border-2 border-[#F4A261] flex flex-col items-center justify-center pixelated relative shadow-pixel-cyan">
                  <div className="w-5 h-2 bg-[#2D344B]"></div>
                  <div className="w-7 h-4 bg-[#4FE0FF] mt-0.5"></div>
                  {/* Headset indicator */}
                  <div className="absolute -top-1 w-6 h-1 bg-signal-cyan"></div>
                </div>

                {/* Ticker Tape */}
                <div className="flex-1 bg-floor-darker border border-signal-cyan/60 p-1.5 font-mono text-[10px]">
                  <div className="text-signal-bull font-bold flex items-center justify-between">
                    <span>CALL: LONG BTC</span>
                    <span className="text-[9px] text-signal-cyan">TP +75%</span>
                  </div>
                  <div className="text-[9px] text-retro-muted truncate">
                    Pippo 1H Enhanced Engine
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] font-pixel text-retro-text pt-1.5 border-t border-floor-deskBorder">
                <span className="text-signal-cyan flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-signal-cyan animate-pulse"></span>
                  HEAD TRADER
                </span>
                <span className="text-[8px] text-signal-bull bg-signal-bull/10 border border-signal-bull/30 px-1">
                  READY
                </span>
              </div>
            </div>
          </div>

          {/* Central Floor Signal Ticket Display (Arcade Terminal Ticket) */}
          <div className="hidden lg:block absolute top-28 left-1/2 -translate-x-1/2 z-20 w-[240px]">
            <SignalTicket 
              ticket={signalTicket}
              compact={true}
              onSelectStrategy={onSelectStrategy}
            />
          </div>

        </div>

      </div>

      {/* Floor Interaction Hint Strip */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-retro-muted bg-floor-darker border border-floor-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-signal-cyan" />
          <span>Klik salah satu meja agent (Researcher, Quant, Trader, Informan, Risk) untuk membuka catatan analisis mendalam.</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-retro-dim">Active Desk:</span>
          <span className="font-bold text-signal-cyan uppercase font-pixel text-[10px]">
            {activeAgentId}
          </span>
        </div>
      </div>

    </div>
  );
}

import React from 'react';
import { playRetroSound } from '../utils/formatters';
import { X, Terminal, CheckCircle2, ChevronRight, Activity, Shield, Cpu, Compass } from 'lucide-react';

export default function AgentDrawer({ agent, isOpen, onClose, onSelectStrategy }) {
  if (!isOpen || !agent) return null;

  const getAgentIcon = (id) => {
    switch (id) {
      case 'researcher': return <Compass className="w-5 h-5 text-signal-cyan" />;
      case 'quant': return <Cpu className="w-5 h-5 text-signal-bull" />;
      case 'trader': return <Activity className="w-5 h-5 text-signal-cyan" />;
      case 'informan': return <Terminal className="w-5 h-5 text-signal-warn" />;
      case 'risk_officer': return <Shield className="w-5 h-5 text-signal-purple" />;
      default: return <Activity className="w-5 h-5 text-signal-cyan" />;
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-floor-dark border-l-2 border-signal-cyan/80 shadow-2xl p-5 flex flex-col font-mono animate-in slide-in-from-right duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-floor-border pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-floor-wall border border-floor-border">
            {getAgentIcon(agent.id)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-pixel text-xs text-retro-text tracking-wide">
                {agent.name}
              </h2>
              <span className="text-[9px] px-1.5 py-0.2 border text-signal-cyan border-signal-cyan/40 bg-signal-cyan/10">
                {agent.status_badge || 'ACTIVE'}
              </span>
            </div>
            <p className="text-[11px] text-retro-muted font-sans">
              {agent.role}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            playRetroSound('blip');
            onClose();
          }}
          className="p-1.5 hover:bg-floor-wall text-retro-muted hover:text-retro-text border border-transparent hover:border-floor-border transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Desk Visual & Speech Bubble */}
      <div className="mb-4 bg-floor-darker border border-floor-border p-3">
        <div className="text-[10px] text-retro-dim mb-1 font-pixel">STATION DESK</div>
        <p className="text-xs text-retro-muted mb-2.5 italic">
          "{agent.desk_visual}"
        </p>

        <div className="bg-floor-bg border border-signal-cyan/40 p-2.5 text-xs text-signal-cyan">
          <div className="text-[9px] text-retro-dim mb-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-signal-cyan animate-pulse"></span>
            LIVE THOUGHT LOG
          </div>
          <p className="font-medium font-sans">
            "{agent.speech_bubble}"
          </p>
        </div>
      </div>

      {/* Intelligence & Quantitative Reasoning Log */}
      <div className="flex-1 overflow-y-auto pr-1 mb-4 space-y-2">
        <div className="text-[10px] font-pixel text-retro-muted border-b border-floor-border pb-1">
          REASONING BRIEFING (PLAIN TEXT)
        </div>

        {agent.reasoning_log && agent.reasoning_log.map((log, idx) => (
          <div 
            key={idx} 
            className="flex items-start gap-2 text-xs bg-floor-darker/60 border border-floor-border p-2.5 hover:border-floor-borderLight transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5 text-signal-cyan mt-0.5 shrink-0" />
            <span className="text-retro-text leading-relaxed font-sans text-[12px]">
              {log}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="border-t border-floor-border pt-3 space-y-2">
        <button
          onClick={() => {
            playRetroSound('select');
            onSelectStrategy('pippo-1h-enhanced');
            onClose();
          }}
          className="w-full py-2.5 bg-signal-cyan/15 hover:bg-signal-cyan/25 border border-signal-cyan text-signal-cyan font-pixel text-xs transition-all shadow-pixel-cyan text-center"
        >
          VIEW FLAGSHIP PIPPO 1H ALGO
        </button>
        <button
          onClick={() => {
            playRetroSound('blip');
            onClose();
          }}
          className="w-full py-2 bg-floor-wall hover:bg-floor-border text-retro-muted hover:text-retro-text font-mono text-xs transition-colors text-center border border-floor-border"
        >
          CLOSE PANEL
        </button>
      </div>

    </div>
  );
}

import React, { useEffect } from 'react';
import { playRetroSound } from '../utils/formatters';
import { X, ChevronRight, Activity, Shield, Cpu, Compass, Radio } from 'lucide-react';

export default function AgentDrawer({ agent, isOpen, onClose, onSelectStrategy }) {
  // Close on Escape key press (R-32)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !agent) return null;

  const getAgentIcon = (id) => {
    switch (id) {
      case 'researcher': return <Compass className="w-5 h-5 text-apple-cyan" />;
      case 'quant': return <Cpu className="w-5 h-5 text-apple-green" />;
      case 'trader': return <Activity className="w-5 h-5 text-apple-cyan" />;
      case 'informan': return <Radio className="w-5 h-5 text-apple-orange" />;
      case 'risk_officer': return <Shield className="w-5 h-5 text-apple-purple" />;
      default: return <Activity className="w-5 h-5 text-apple-cyan" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      
      {/* Background click dismiss */}
      <div className="fixed inset-0 cursor-pointer" onClick={onClose} />

      {/* macOS Slide-over Inspector Sheet */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-sheet-title"
        className="relative z-10 w-full max-w-md bg-[#0F1015]/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-[0_0_50px_rgba(0,0,0,0.7)] p-6 flex flex-col font-sans animate-in slide-in-from-right duration-300 h-full overflow-hidden"
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
              {getAgentIcon(agent.id)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="agent-sheet-title" className="text-base font-semibold text-white tracking-tight">
                  {agent.name}
                </h2>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-apple-cyan border-apple-cyan/30 bg-apple-cyan/10 tabular-nums">
                  {agent.status_badge || 'Active'}
                </span>
              </div>
              <p className="text-xs text-apple-muted">
                {agent.role}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playRetroSound('blip');
              onClose();
            }}
            className="w-9 h-9 rounded-full bg-white/[0.04] hover:bg-white/[0.1] active:scale-95 border border-white/[0.08] flex items-center justify-center text-apple-muted hover:text-white transition-all cursor-pointer min-w-[44px] min-h-[44px]"
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Thought Stream Card */}
        <div className="mb-4 bg-black/40 rounded-2xl border border-white/[0.06] p-4">
          <div className="flex items-center justify-between text-[11px] text-apple-dim mb-2">
            <span className="font-semibold uppercase tracking-wider">Live Agent Telemetry</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-apple-cyan animate-ping" />
              <span className="text-apple-cyan font-medium">Real-time</span>
            </div>
          </div>

          <div className="bg-white/[0.03] rounded-xl border border-white/[0.04] p-3 text-xs text-zinc-200 leading-relaxed font-medium">
            "{agent.speech_bubble}"
          </div>
        </div>

        {/* Intelligence & Quantitative Reasoning Log */}
        <div className="flex-1 overflow-y-auto pr-1 mb-4 space-y-2.5">
          <div className="text-[11px] font-semibold text-apple-dim uppercase tracking-wider pb-1">
            Reasoning Briefing
          </div>

          {agent.reasoning_log && agent.reasoning_log.map((log, idx) => (
            <div 
              key={idx} 
              className="flex items-start gap-2.5 text-xs bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/[0.05] p-3 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-apple-cyan mt-0.5 shrink-0" />
              <span className="text-zinc-300 leading-relaxed text-[13px]">
                {log}
              </span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="border-t border-white/[0.08] pt-4 space-y-2.5">
          <button
            onClick={() => {
              playRetroSound('select');
              if (onSelectStrategy) onSelectStrategy('pippo-1h-enhanced');
              onClose();
            }}
            className="w-full py-2.5 bg-apple-blue hover:bg-apple-blue/90 text-white font-medium text-xs rounded-xl transition-all shadow-[0_4px_16px_rgba(10,132,255,0.3)] active:scale-[0.98] cursor-pointer min-h-[44px]"
          >
            Inspect Flagship Pippo Algo
          </button>
          <button
            onClick={() => {
              playRetroSound('blip');
              onClose();
            }}
            className="w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.08] text-apple-muted hover:text-white font-medium text-xs rounded-xl transition-colors text-center border border-white/[0.06] cursor-pointer min-h-[44px]"
          >
            Dismiss Sheet
          </button>
        </div>

      </div>

    </div>
  );
}

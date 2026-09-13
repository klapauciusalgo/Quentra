import React, { useState, useEffect } from 'react';
import { formatPrice, formatPercent, formatDateTime, playRetroSound } from '../utils/formatters';
import { 
  X, 
  TrendingUp, 
  Shield, 
  Zap, 
  Target, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  FileText,
  Sliders
} from 'lucide-react';

export default function StrategyDetail({ 
  strategyId, 
  isOpen, 
  onClose, 
  onSelectStrategy 
}) {
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tradeFilter, setTradeFilter] = useState('ALL'); // ALL, WINS, LOSSES
  const [tradeSearch, setTradeSearch] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview, yearly, trades

  useEffect(() => {
    if (!strategyId || !isOpen) return;
    setLoading(true);
    fetch(`/api/strategies/${strategyId}`)
      .then((res) => res.json())
      .then((data) => {
        setStrategy(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error loading strategy detail:', err);
        setLoading(false);
      });
  }, [strategyId, isOpen]);

  if (!isOpen) return null;

  const isLong = strategy?.type === 'LONG';
  const m = strategy?.metrics || {};
  const params = strategy?.parameters || {};
  const trades = strategy?.trades || [];
  const yearly = strategy?.yearly_stats || [];

  // Filtered trades
  const filteredTrades = trades.filter((t) => {
    if (tradeFilter === 'WINS' && (t.net_return_pct || 0) <= 0) return false;
    if (tradeFilter === 'LOSSES' && (t.net_return_pct || 0) > 0) return false;
    if (tradeSearch.trim()) {
      const q = tradeSearch.toLowerCase();
      const reason = (t.exit_reason || '').toLowerCase();
      const entryTime = (t.entry_time || '').toLowerCase();
      if (!reason.includes(q) && !entryTime.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-floor-dark border-2 border-floor-border shadow-2xl flex flex-col max-h-[92vh] font-mono animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-floor-border p-4 bg-floor-darker">
          <div className="flex items-center gap-3">
            <div className={`p-2 border ${isLong ? 'border-signal-bull text-signal-bull bg-signal-bull/10' : 'border-signal-bear text-signal-bear bg-signal-bear/10'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-pixel text-xs md:text-sm text-retro-text tracking-wide">
                  {strategy?.name || 'Strategy Detail'}
                </h2>
                <span className={`text-[10px] font-pixel px-2 py-0.5 border ${
                  strategy?.id === 'pure-macro-weekly-ma55'
                    ? 'text-signal-cyan border-signal-cyan/50 bg-signal-cyan/10'
                    : isLong
                    ? 'text-signal-bull border-signal-bull/50'
                    : 'text-signal-bear border-signal-bear/50'
                }`}>
                  {strategy?.id === 'pure-macro-weekly-ma55' ? 'MACRO DUAL (LONG / SHORT)' : strategy?.type}
                </span>
                <span className="text-xs font-bold px-1.5 py-0.5 bg-floor-wall text-retro-muted uppercase">
                  {strategy?.timeframe}
                </span>
              </div>
              <p className="text-xs text-signal-cyan font-sans mt-0.5">
                {strategy?.category} // {strategy?.archetype}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playRetroSound('select');
                if (onSelectStrategy && strategy) onSelectStrategy(strategy.id);
                onClose();
              }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-signal-cyan text-floor-darker font-pixel text-[10px] hover:bg-signal-cyan/90 transition-colors shadow-pixel-cyan font-bold"
            >
              PLOT TO CHART
            </button>
            <button
              onClick={() => {
                playRetroSound('blip');
                onClose();
              }}
              className="p-1.5 hover:bg-floor-wall text-retro-muted hover:text-retro-text border border-floor-border"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-floor-border bg-floor-bg px-4 pt-2 gap-2 text-xs">
          {[
            { id: 'overview', label: '📊 OVERVIEW & LOGIC' },
            { id: 'yearly', label: '📅 YEAR-BY-YEAR (YoY)' },
            { id: 'trades', label: `📑 TRADE HISTORY (${trades.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                playRetroSound('blip');
                setActiveTab(tab.id);
              }}
              className={`pb-2.5 px-3 border-b-2 font-pixel text-[10px] transition-colors ${
                activeTab === tab.id
                  ? 'border-signal-cyan text-signal-cyan font-bold'
                  : 'border-transparent text-retro-muted hover:text-retro-text'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center font-pixel text-xs text-signal-cyan animate-pulse">
              LOADING STRATEGY INTELLIGENCE...
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & LOGIC */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Performance Scorecard */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-floor-darker border border-floor-border p-4">
                    <div>
                      <div className="text-[10px] text-retro-dim">TOTAL NET RETURN</div>
                      <div className="text-base sm:text-xl font-bold text-signal-bull">
                        +{Number(m.total_return_pct || 0).toLocaleString()}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-retro-dim">WIN RATE</div>
                      <div className="text-base sm:text-xl font-bold text-retro-text">
                        {m.win_rate_pct || 0}%
                        <span className="text-xs text-retro-muted font-normal ml-1">
                          ({m.win_trades || 0}W / {m.loss_trades || 0}L)
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-retro-dim">PROFIT FACTOR</div>
                      <div className="text-base sm:text-xl font-bold text-signal-cyan">
                        {m.profit_factor || 0}x
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-retro-dim">MAX DRAWDOWN</div>
                      <div className="text-base sm:text-xl font-bold text-signal-bear">
                        {m.max_drawdown_pct || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Rationale & Logic */}
                  <div className="bg-floor-darker border border-floor-border p-4 space-y-2">
                    <div className="text-xs font-pixel text-signal-cyan flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      <span>STRATEGY LOGIC & THESIS</span>
                    </div>
                    <p className="text-xs text-retro-text leading-relaxed font-sans">
                      {strategy.logic_summary}
                    </p>
                    <p className="text-xs text-retro-muted leading-relaxed font-sans pt-1">
                      <strong className="text-signal-warn">Recommended Profile:</strong> {strategy.recommended_for}
                    </p>
                  </div>

                  {/* Exact Parameter Matrix */}
                  <div className="bg-floor-darker border border-floor-border p-4 space-y-3">
                    <div className="text-xs font-pixel text-signal-warn flex items-center gap-1.5">
                      <Sliders className="w-4 h-4" />
                      <span>EXECUTION PARAMETERS & RULES</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {Object.entries(params).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between border-b border-floor-border/60 pb-1.5">
                          <span className="text-retro-dim uppercase text-[11px]">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-retro-text font-bold text-right max-w-[240px] truncate">
                            {String(val)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: YEAR-BY-YEAR (YoY) */}
              {activeTab === 'yearly' && (
                <div className="space-y-4">
                  <div className="text-xs text-retro-muted">
                    Historical year-over-year performance (2020 – 2026) showing algorithmic consistency across market regimes (Bull Cycles, Bear Markets, Consolidation).
                  </div>

                  <div className="overflow-x-auto border border-floor-border bg-floor-darker">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead>
                        <tr className="bg-floor-wall text-retro-dim border-b border-floor-border text-[11px]">
                          <th className="p-3">YEAR</th>
                          <th className="p-3 text-right">RETURN</th>
                          <th className="p-3 text-right">WIN RATE</th>
                          <th className="p-3 text-right">PROFIT FACTOR</th>
                          <th className="p-3 text-right">TRADE COUNT</th>
                          <th className="p-3 text-right">W / L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-floor-border">
                        {yearly.map((y) => (
                          <tr key={y.year} className="hover:bg-floor-wall/40">
                            <td className="p-3 font-bold text-retro-text">{y.year}</td>
                            <td className={`p-3 text-right font-bold ${
                              (y.total_return_pct || 0) >= 0 ? 'text-signal-bull' : 'text-signal-bear'
                            }`}>
                              {formatPercent(y.total_return_pct || 0)}
                            </td>
                            <td className="p-3 text-right text-retro-text">{y.win_rate || 0}%</td>
                            <td className="p-3 text-right text-signal-cyan font-bold">{y.profit_factor || 0}x</td>
                            <td className="p-3 text-right text-retro-muted">{y.trades || 0}</td>
                            <td className="p-3 text-right text-retro-dim">
                              {y.wins || 0}W / {y.losses || 0}L
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: COMPLETE TRADE HISTORY */}
              {activeTab === 'trades' && (
                <div className="space-y-4">
                  {/* Trade Search & Filter Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-floor-darker border border-floor-border p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-retro-dim mr-1">FILTER:</span>
                      {['ALL', 'WINS', 'LOSSES'].map((f) => (
                        <button
                          key={f}
                          onClick={() => setTradeFilter(f)}
                          className={`px-2 py-0.5 border text-xs ${
                            tradeFilter === f
                              ? 'border-signal-cyan bg-signal-cyan/15 text-signal-cyan font-bold'
                              : 'border-floor-border bg-floor-wall text-retro-muted'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>

                    <div className="relative min-w-[200px]">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-retro-dim" />
                      <input
                        type="text"
                        placeholder="Filter by exit reason or date..."
                        value={tradeSearch}
                        onChange={(e) => setTradeSearch(e.target.value)}
                        className="w-full bg-floor-bg border border-floor-border text-xs pl-8 pr-3 py-1 text-retro-text focus:border-signal-cyan focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Trades Table */}
                  <div className="overflow-x-auto border border-floor-border bg-floor-darker max-h-[380px]">
                    <table className="w-full text-left font-mono text-xs border-collapse">
                      <thead className="sticky top-0 bg-floor-wall text-retro-dim border-b border-floor-border text-[11px]">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5 text-center">SIDE</th>
                          <th className="p-2.5">ENTRY TIME</th>
                          <th className="p-2.5">EXIT TIME</th>
                          <th className="p-2.5 text-right">ENTRY PRICE</th>
                          <th className="p-2.5 text-right">EXIT PRICE</th>
                          <th className="p-2.5 text-right">NET RETURN</th>
                          <th className="p-2.5">EXIT REASON</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-floor-border">
                        {filteredTrades.slice(0, 100).map((t) => {
                          const isWin = (t.net_return_pct || 0) > 0;
                          const side = t.side || t.type || strategy.type;
                          return (
                            <tr key={t.trade_no} className="hover:bg-floor-wall/40 text-[11px]">
                              <td className="p-2.5 text-retro-dim">#{t.trade_no}</td>
                              <td className="p-2.5 text-center">
                                <span className={`text-[10px] font-pixel px-1.5 py-0.5 border ${
                                  side === 'LONG'
                                    ? 'border-signal-bull/50 text-signal-bull bg-signal-bull/10'
                                    : 'border-signal-bear/50 text-signal-bear bg-signal-bear/10'
                                }`}>
                                  {side}
                                </span>
                              </td>
                              <td className="p-2.5 text-retro-text">{String(t.entry_time).substring(0, 16)}</td>
                              <td className="p-2.5 text-retro-muted">{String(t.exit_time).substring(0, 16)}</td>
                              <td className="p-2.5 text-right text-retro-text">{formatPrice(t.entry_price)}</td>
                              <td className="p-2.5 text-right text-retro-text">{formatPrice(t.exit_price)}</td>
                              <td className={`p-2.5 text-right font-bold ${isWin ? 'text-signal-bull' : 'text-signal-bear'}`}>
                                {formatPercent(t.net_return_pct || 0)}
                              </td>
                              <td className="p-2.5 text-retro-muted truncate max-w-[200px]">
                                {t.exit_reason || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filteredTrades.length > 100 && (
                    <div className="text-[11px] text-retro-dim text-center">
                      Displaying recent 100 trades of {filteredTrades.length} total.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t-2 border-floor-border p-3.5 bg-floor-darker flex items-center justify-between">
          <div className="text-xs text-retro-muted hidden sm:block">
            Ground-truth verified from 2020–2026 Binance spot & futures execution logs.
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => {
                playRetroSound('select');
                if (onSelectStrategy && strategy) onSelectStrategy(strategy.id);
                onClose();
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-signal-cyan text-floor-darker font-pixel text-xs font-bold hover:bg-signal-cyan/90 transition-colors shadow-pixel-cyan"
            >
              PLOT STRATEGY ON BTCUSDT CHART
            </button>
            <button
              onClick={() => {
                playRetroSound('blip');
                onClose();
              }}
              className="px-4 py-2 bg-floor-wall hover:bg-floor-border border border-floor-border text-retro-text text-xs"
            >
              CLOSE
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

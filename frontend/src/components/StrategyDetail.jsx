import React, { useState, useEffect, useMemo } from 'react';
import { formatPrice, formatPercent, formatDateTime, playRetroSound } from '../utils/formatters';
import strategiesData from '../data/strategiesData.json';
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
  Sliders, 
  ChevronRight,
  ArrowUpDown,
  LineChart
} from 'lucide-react';
import AlgoVsBtcVisualizer from './AlgoVsBtcVisualizer';

export default function StrategyDetail({ 
  strategyId, 
  isOpen, 
  onClose, 
  onSelectStrategy 
}) {
  const [strategy, setStrategy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tradeFilter, setTradeFilter] = useState('ALL'); // ALL, WINS, LOSSES
  const [yearFilter, setYearFilter] = useState('ALL'); // ALL, 2026, 2025, etc.
  const [sortOrder, setSortOrder] = useState('DESC'); // DESC (Newest First), ASC (Oldest First)
  const [tradeSearch, setTradeSearch] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview, yearly, trades

  // Keyboard accessibility: ESC key closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        playRetroSound('blip');
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!strategyId || !isOpen) return;
    setLoading(true);

    // Immediate baseline fallback
    const localStrat = strategiesData.find((s) => s.id === strategyId);
    if (localStrat) {
      setStrategy(localStrat);
    }

    fetch(`/api/strategies/${strategyId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) {
          setStrategy(data);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [strategyId, isOpen]);

  const isLong = strategy?.type === 'LONG';
  const m = strategy?.metrics || {};
  const params = strategy?.parameters || {};
  const trades = strategy?.trades || [];
  const yearly = strategy?.yearly_stats || [];

  const totalReturn = m.total_return_pct ?? strategy?.total_return_pct ?? 0;
  const winRate = m.win_rate_pct ?? strategy?.win_rate_pct ?? 0;
  const profitFactor = m.profit_factor ?? strategy?.profit_factor ?? 1.0;
  const maxDrawdown = m.max_drawdown_pct ?? strategy?.max_drawdown_pct ?? 0;
  const totalTrades = m.total_trades ?? strategy?.trades_count ?? trades.length;
  const winTrades = m.win_trades ?? Math.round((winRate / 100) * totalTrades);
  const lossTrades = m.loss_trades ?? (totalTrades - winTrades);

  // Available unique years in trades
  const availableYears = useMemo(() => {
    const setY = new Set();
    trades.forEach((t) => {
      const y = String(t.entry_time || '').substring(0, 4);
      if (y && !isNaN(Number(y))) setY.add(y);
    });
    return Array.from(setY).sort((a, b) => Number(b) - Number(a));
  }, [trades]);

  // Filtered & sorted trades
  const filteredTrades = useMemo(() => {
    let result = trades.filter((t) => {
      if (tradeFilter === 'WINS' && (t.net_return_pct || 0) <= 0) return false;
      if (tradeFilter === 'LOSSES' && (t.net_return_pct || 0) > 0) return false;
      if (yearFilter !== 'ALL') {
        const y = String(t.entry_time || '').substring(0, 4);
        if (y !== yearFilter) return false;
      }
      if (tradeSearch.trim()) {
        const q = tradeSearch.toLowerCase();
        const reason = (t.exit_reason || '').toLowerCase();
        const entryTime = (t.entry_time || '').toLowerCase();
        const tradeNo = String(t.trade_no || '');
        if (!reason.includes(q) && !entryTime.includes(q) && !tradeNo.includes(q)) return false;
      }
      return true;
    });

    // Default to Newest First (DESC) so latest 2026 trades are prominently at the top
    return result.sort((a, b) => {
      const diff = (a.trade_no || 0) - (b.trade_no || 0);
      return sortOrder === 'DESC' ? -diff : diff;
    });
  }, [trades, tradeFilter, yearFilter, tradeSearch, sortOrder]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/80 backdrop-blur-2xl flex items-center justify-center p-3 md:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl rounded-3xl border border-black/10 dark:border-white/[0.12] bg-white dark:bg-[#0C0D12] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.08] p-5 bg-black/[0.02] dark:bg-[#101117]/80">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              isLong 
                ? 'border-apple-green/30 text-apple-green bg-apple-green/10' 
                : 'border-apple-red/30 text-apple-red bg-apple-red/10'
            }`}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-semibold text-apple-text tracking-tight">
                  {strategy?.name || 'Strategy Detail'}
                </h2>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                  strategy?.id === 'pure-macro-weekly-ma55'
                    ? 'text-apple-cyan border-apple-cyan/30 bg-apple-cyan/10'
                    : isLong
                    ? 'text-apple-green border-apple-green/30 bg-apple-green/10'
                    : 'text-apple-red border-apple-red/30 bg-apple-red/10'
                }`}>
                  {strategy?.id === 'pure-macro-weekly-ma55' ? 'Macro Dual (Long / Short)' : strategy?.type}
                </span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-lg bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] text-apple-muted uppercase">
                  {strategy?.timeframe}
                </span>
              </div>
              <p className="text-xs text-apple-blue font-medium mt-0.5">
                {strategy?.category} / {strategy?.archetype}
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
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl transition-all shadow-sm cursor-pointer"
            >
              Plot to Chart
            </button>
            <button
              onClick={() => {
                playRetroSound('blip');
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] active:scale-[0.96] border border-black/10 dark:border-white/10 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-[#0E0F14] px-5 pt-3 gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Overview & Logic' },
            { id: 'yearly', label: 'Year-by-Year (YoY)' },
            { id: 'trades', label: `Trade Logs (${trades.length})` },
            { id: 'vs-btc', label: 'Algo vs Bitcoin Price' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  playRetroSound('blip');
                  setActiveTab(tab.id);
                }}
                className={`pb-3 px-3.5 border-b-2 text-xs font-semibold shrink-0 transition-colors duration-150 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'border-apple-blue text-apple-blue dark:text-white'
                    : 'border-transparent text-apple-muted hover:text-apple-text'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 md:p-7 space-y-6">
          {loading ? (
            <div className="py-24 text-center text-xs text-apple-muted animate-pulse">
              Loading quantitative intelligence...
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW & LOGIC */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Performance Scorecard */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="apple-glass-card rounded-2xl p-4">
                      <div className="text-[11px] text-apple-dim uppercase tracking-wider">Total Net Return</div>
                      <div className="text-xl md:text-2xl font-bold text-apple-green font-mono tabular-nums mt-1">
                        +{Number(totalReturn).toLocaleString()}%
                      </div>
                    </div>

                    <div className="apple-glass-card rounded-2xl p-4">
                      <div className="text-[11px] text-apple-dim uppercase tracking-wider">Win Rate</div>
                      <div className="text-xl md:text-2xl font-bold text-apple-text font-mono tabular-nums mt-1">
                        {winRate}%
                        <span className="text-xs text-apple-muted font-normal ml-1.5">
                          ({winTrades}W / {lossTrades}L)
                        </span>
                      </div>
                    </div>

                    <div className="apple-glass-card rounded-2xl p-4">
                      <div className="text-[11px] text-apple-dim uppercase tracking-wider">Profit Factor</div>
                      <div className="text-xl md:text-2xl font-bold text-apple-cyan font-mono tabular-nums mt-1">
                        {profitFactor}x
                      </div>
                    </div>

                    <div className="apple-glass-card rounded-2xl p-4">
                      <div className="text-[11px] text-apple-dim uppercase tracking-wider">Max Drawdown</div>
                      <div className="text-xl md:text-2xl font-bold text-apple-red font-mono tabular-nums mt-1">
                        {maxDrawdown}%
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Rationale & Logic */}
                  <div className="apple-glass-card rounded-2xl p-5 space-y-2.5">
                    <div className="text-xs font-semibold text-apple-blue flex items-center gap-1.5 uppercase tracking-wider">
                      <FileText className="w-4 h-4" />
                      <span>Strategy Logic & Thesis</span>
                    </div>
                    <p className="text-xs md:text-sm text-apple-text leading-relaxed">
                      {strategy.logic_summary}
                    </p>
                    <div className="text-xs text-apple-muted leading-relaxed pt-1">
                      <span className="text-apple-text font-medium">Recommended Profile:</span> {strategy.recommended_for}
                    </div>
                  </div>

                  {/* Exact Parameter Matrix */}
                  <div className="apple-glass-card rounded-2xl p-5 space-y-3.5">
                    <div className="text-xs font-semibold text-apple-orange flex items-center gap-1.5 uppercase tracking-wider">
                      <Sliders className="w-4 h-4" />
                      <span>Execution Parameters & Mathematical Rules</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {Object.entries(params).map(([key, val]) => (
                        <div key={key} className="flex items-center justify-between border-b border-black/[0.04] dark:border-white/[0.04] pb-2">
                          <span className="text-apple-dim uppercase text-[11px]">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className="text-apple-text font-semibold font-mono tabular-nums text-right max-w-[260px] truncate">
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
                  <p className="text-xs text-apple-muted">
                    Historical year-over-year performance (2020-2026) demonstrating algorithmic consistency across market regimes (bull cycles, bear drawdowns, and structural consolidation).
                  </p>

                  <div className="overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-black/[0.03] dark:bg-white/[0.04] text-apple-muted border-b border-black/[0.08] dark:border-white/[0.08] text-[11px] font-medium">
                          <th className="p-3.5">Year</th>
                          <th className="p-3.5 text-right">Return</th>
                          <th className="p-3.5 text-right">Win Rate</th>
                          <th className="p-3.5 text-right">Profit Factor</th>
                          <th className="p-3.5 text-right">Trade Count</th>
                          <th className="p-3.5 text-right">W / L Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                        {yearly.map((y) => (
                          <tr key={y.year} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors">
                            <td className="p-3.5 font-semibold text-apple-text font-mono">{y.year}</td>
                            <td className={`p-3.5 text-right font-semibold font-mono tabular-nums ${
                              (y.total_return_pct || 0) >= 0 ? 'text-apple-green' : 'text-apple-red'
                            }`}>
                              {formatPercent(y.total_return_pct || 0)}
                            </td>
                            <td className="p-3.5 text-right text-apple-text font-mono tabular-nums">{y.win_rate || 0}%</td>
                            <td className="p-3.5 text-right text-apple-cyan font-semibold font-mono tabular-nums">{y.profit_factor || 0}x</td>
                            <td className="p-3.5 text-right text-apple-muted font-mono tabular-nums">{y.trades || 0}</td>
                            <td className="p-3.5 text-right text-apple-dim font-mono tabular-nums">
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
                  <div className="flex flex-wrap items-center justify-between gap-3 apple-glass-card rounded-2xl p-3.5">
                    
                    {/* W/L Filter */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-apple-dim mr-1">Filter:</span>
                      <div className="flex items-center bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] p-0.5 rounded-xl">
                        {['ALL', 'WINS', 'LOSSES'].map((f) => (
                          <button
                            key={f}
                            onClick={() => setTradeFilter(f)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                              tradeFilter === f
                                ? 'bg-white dark:bg-white/15 text-apple-text shadow-sm font-semibold'
                                : 'text-apple-muted hover:text-apple-text'
                            }`}
                          >
                            {f === 'ALL' ? 'All' : f === 'WINS' ? 'Wins' : 'Losses'}
                          </button>
                        ))}
                      </div>

                      {/* Year Selector */}
                      {availableYears.length > 0 && (
                        <div className="flex items-center gap-1 ml-2">
                          <span className="text-xs text-apple-dim">Year:</span>
                          <select
                            value={yearFilter}
                            onChange={(e) => setYearFilter(e.target.value)}
                            className="bg-black/[0.04] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs px-2.5 py-1 text-apple-text focus:outline-none focus:ring-1 focus:ring-apple-blue font-mono"
                          >
                            <option value="ALL">All Years (2020-2026)</option>
                            {availableYears.map((yr) => (
                              <option key={yr} value={yr}>{yr}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 flex-1 min-w-[260px] justify-end">
                      {/* Sort Order Toggle */}
                      <button
                        onClick={() => {
                          playRetroSound('select');
                          setSortOrder(sortOrder === 'DESC' ? 'ASC' : 'DESC');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.03] dark:bg-white/[0.04] text-xs font-medium text-apple-text hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-all cursor-pointer shrink-0"
                        title="Toggle newest first vs oldest first"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-apple-blue" />
                        <span>{sortOrder === 'DESC' ? 'Newest First' : 'Oldest First'}</span>
                      </button>

                      {/* Search Bar */}
                      <div className="relative min-w-[180px] max-w-[280px] w-full">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-apple-dim" />
                        <input
                          type="text"
                          placeholder="Search reason, date, or #..."
                          value={tradeSearch}
                          onChange={(e) => setTradeSearch(e.target.value)}
                          className="w-full bg-black/[0.04] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] rounded-xl text-xs pl-8 pr-3 py-1.5 text-apple-text placeholder:text-apple-dim focus:outline-none focus:ring-2 focus:ring-apple-blue/50"
                        />
                      </div>
                    </div>

                  </div>

                  {/* Summary Telemetry Line */}
                  <div className="flex items-center justify-between text-xs text-apple-dim px-1 font-mono">
                    <div>
                      Showing <span className="text-apple-text font-semibold">{filteredTrades.length}</span> of <span className="text-apple-text font-semibold">{trades.length}</span> verified executions
                    </div>
                    <div>
                      Dataset Horizon: <span className="text-apple-blue font-semibold">2020 - 2026 Ground Truth</span>
                    </div>
                  </div>

                  {/* Trades Table */}
                  <div className="overflow-x-auto rounded-2xl border border-black/[0.08] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] max-h-[440px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-white dark:bg-[#15161F] text-apple-muted border-b border-black/[0.08] dark:border-white/[0.08] text-[11px] font-medium z-10">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3 text-center">Side</th>
                          <th className="p-3">Entry Time</th>
                          <th className="p-3">Exit Time</th>
                          <th className="p-3 text-right">Entry Price</th>
                          <th className="p-3 text-right">Exit Price</th>
                          <th className="p-3 text-right">Net Return</th>
                          <th className="p-3">Exit Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                        {filteredTrades.map((t) => {
                          const isWin = (t.net_return_pct || 0) > 0;
                          return (
                            <tr key={t.trade_no} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors">
                              <td className="p-3 font-mono text-apple-dim font-semibold">#{t.trade_no}</td>
                              <td className="p-3 text-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  (t.side || strategy?.type) === 'LONG'
                                    ? 'bg-apple-green/10 text-apple-green'
                                    : 'bg-apple-red/10 text-apple-red'
                                }`}>
                                  {t.side || strategy?.type}
                                </span>
                              </td>
                              <td className="p-3 font-mono text-apple-muted text-[11px]">
                                {String(t.entry_time).substring(0, 16).replace('T', ' ')}
                              </td>
                              <td className="p-3 font-mono text-apple-muted text-[11px]">
                                {t.exit_time && !String(t.exit_time).includes('RUNNING')
                                  ? String(t.exit_time).substring(0, 16).replace('T', ' ')
                                  : <span className="text-apple-cyan font-semibold">Running</span>}
                              </td>
                              <td className="p-3 text-right font-mono tabular-nums text-apple-text">
                                {formatPrice(t.entry_price)}
                              </td>
                              <td className="p-3 text-right font-mono tabular-nums text-apple-text">
                                {t.exit_price ? formatPrice(t.exit_price) : '-'}
                              </td>
                              <td className={`p-3 text-right font-mono font-semibold tabular-nums ${
                                isWin ? 'text-apple-green' : 'text-apple-red'
                              }`}>
                                {formatPercent(t.net_return_pct || 0)}
                              </td>
                              <td className="p-3 text-[11px] text-apple-muted truncate max-w-[180px]">
                                {t.exit_reason || 'Exit Rule'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 4: ALGO VS BITCOIN BENCHMARK VISUALIZER */}
              {activeTab === 'vs-btc' && (
                <AlgoVsBtcVisualizer strategy={strategy} />
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

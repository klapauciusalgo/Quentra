import React, { useState, useMemo } from 'react';
import { formatPrice, formatPercent, playRetroSound } from '../utils/formatters';
import { 
  SlidersHorizontal, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  ShieldAlert, 
  Percent, 
  Activity, 
  Check, 
  Eye, 
  Sparkles, 
  Table, 
  LayoutGrid,
  Filter,
  Search
} from 'lucide-react';

export default function AlgoExplorer({ 
  strategies = [], 
  selectedStrategyId, 
  onSelectStrategy, 
  onOpenDetail 
}) {
  const [directionFilter, setDirectionFilter] = useState('ALL'); // ALL, LONG, SHORT
  const [timeframeFilter, setTimeframeFilter] = useState('ALL'); // ALL, 30m, 1h, 4h, 1w
  const [archetypeFilter, setArchetypeFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('return'); // return, winrate, pf, dd, trades
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // cards or table

  // Filter & Sort Strategies
  const filteredStrategies = useMemo(() => {
    return strategies
      .filter((s) => {
        if (directionFilter !== 'ALL' && s.type !== directionFilter) return false;
        if (timeframeFilter !== 'ALL' && s.timeframe.toLowerCase() !== timeframeFilter.toLowerCase()) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = s.name.toLowerCase().includes(q);
          const matchShort = (s.short_name || '').toLowerCase().includes(q);
          const matchArch = (s.archetype || '').toLowerCase().includes(q);
          const matchDesc = (s.recommended_for || '').toLowerCase().includes(q);
          if (!matchName && !matchShort && !matchArch && !matchDesc) return false;
        }
        if (archetypeFilter !== 'ALL') {
          if (archetypeFilter === 'HIGH_WINRATE' && (s.metrics?.win_rate_pct || 0) < 65) return false;
          if (archetypeFilter === 'RUNNER' && (s.metrics?.total_return_pct || 0) < 1000) return false;
          if (archetypeFilter === 'DEFENSIVE' && Math.abs(s.metrics?.max_drawdown_pct || 100) > 30) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'return') return (b.metrics?.total_return_pct || 0) - (a.metrics?.total_return_pct || 0);
        if (sortBy === 'winrate') return (b.metrics?.win_rate_pct || 0) - (a.metrics?.win_rate_pct || 0);
        if (sortBy === 'pf') return (b.metrics?.profit_factor || 0) - (a.metrics?.profit_factor || 0);
        if (sortBy === 'dd') return Math.abs(a.metrics?.max_drawdown_pct || 0) - Math.abs(b.metrics?.max_drawdown_pct || 0);
        if (sortBy === 'trades') return (b.metrics?.total_trades || 0) - (a.metrics?.total_trades || 0);
        return 0;
      });
  }, [strategies, directionFilter, timeframeFilter, archetypeFilter, sortBy, searchQuery]);

  return (
    <div className="bg-floor-dark border-2 border-floor-border p-4 md:p-6 space-y-6">
      
      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-floor-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-signal-bull animate-pulse"></span>
            <h2 className="font-pixel text-xs md:text-sm text-retro-text tracking-wider">
              ALGO STRATEGY EXPLORER
            </h2>
            <span className="bg-signal-cyan/10 border border-signal-cyan/40 text-signal-cyan font-mono text-[10px] px-1.5 py-0.5">
              {strategies.length} STRATEGIES READY
            </span>
          </div>
          <p className="text-xs text-retro-muted font-mono mt-1">
            Discover quantitative trading strategies calibrated for your risk profile, timeframe, and profit targets.
          </p>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 bg-floor-darker border border-floor-border p-1">
          <button
            onClick={() => {
              playRetroSound('blip');
              setViewMode('cards');
            }}
            className={`p-1.5 flex items-center gap-1 font-mono text-xs ${
              viewMode === 'cards' ? 'bg-signal-cyan text-floor-darker font-bold' : 'text-retro-muted hover:text-retro-text'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            onClick={() => {
              playRetroSound('blip');
              setViewMode('table');
            }}
            className={`p-1.5 flex items-center gap-1 font-mono text-xs ${
              viewMode === 'table' ? 'bg-signal-cyan text-floor-darker font-bold' : 'text-retro-muted hover:text-retro-text'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Matrix</span>
          </button>
        </div>
      </div>

      {/* Filter & Preference Matcher Toolbar */}
      <div className="bg-floor-darker border border-floor-border p-3.5 space-y-3">
        {/* Row 1: Direction & Timeframe */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Direction Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-pixel text-retro-dim mr-1">TYPE:</span>
            {['ALL', 'LONG', 'SHORT'].map((type) => (
              <button
                key={type}
                onClick={() => {
                  playRetroSound('blip');
                  setDirectionFilter(type);
                }}
                className={`font-pixel text-[10px] px-2.5 py-1 border transition-all ${
                  directionFilter === type
                    ? type === 'LONG'
                      ? 'border-signal-bull bg-signal-bull text-floor-darker font-bold'
                      : type === 'SHORT'
                      ? 'border-signal-bear bg-signal-bear text-floor-darker font-bold'
                      : 'border-signal-cyan bg-signal-cyan text-floor-darker font-bold'
                    : 'border-floor-border bg-floor-wall text-retro-muted hover:text-retro-text'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-pixel text-retro-dim mr-1">TF:</span>
            {['ALL', '30m', '1h', '4h', '1w'].map((tf) => (
              <button
                key={tf}
                onClick={() => {
                  playRetroSound('blip');
                  setTimeframeFilter(tf);
                }}
                className={`font-mono text-xs px-2.5 py-0.5 border uppercase transition-all ${
                  timeframeFilter.toLowerCase() === tf.toLowerCase()
                    ? 'border-signal-cyan bg-signal-cyan/15 text-signal-cyan font-bold'
                    : 'border-floor-border bg-floor-wall text-retro-muted hover:text-retro-text'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-retro-dim" />
            <input
              type="text"
              placeholder="Search algorithms (e.g. Scalp, Alpha, V2)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-floor-bg border border-floor-border text-xs font-mono pl-8 pr-3 py-1.5 text-retro-text placeholder:text-retro-dim focus:border-signal-cyan focus:outline-none"
            />
          </div>

        </div>

        {/* Row 2: Archetype Quick Filters & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-floor-border pt-2.5">
          {/* Quick Style Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-mono text-retro-dim mr-1">PREFERENCE:</span>
            {[
              { id: 'ALL', label: 'All Profiles' },
              { id: 'HIGH_WINRATE', label: '🎯 High Win Rate (65%+)' },
              { id: 'RUNNER', label: '🚀 Mega Runners (+1,000%+)' },
              { id: 'DEFENSIVE', label: '🛡️ Low Drawdown (<30%)' },
            ].map((pref) => (
              <button
                key={pref.id}
                onClick={() => {
                  playRetroSound('blip');
                  setArchetypeFilter(pref.id);
                }}
                className={`font-mono text-[11px] px-2 py-0.5 border transition-all ${
                  archetypeFilter === pref.id
                    ? 'border-signal-warn bg-signal-warn/15 text-signal-warn font-semibold'
                    : 'border-floor-border bg-floor-wall/50 text-retro-muted hover:text-retro-text'
                }`}
              >
                {pref.label}
              </button>
            ))}
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-retro-dim">SORT BY:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                playRetroSound('blip');
                setSortBy(e.target.value);
              }}
              className="bg-floor-bg border border-floor-border text-retro-text font-mono text-xs px-2.5 py-1 focus:border-signal-cyan focus:outline-none cursor-pointer"
            >
              <option value="return">Total Return (Highest)</option>
              <option value="winrate">Win Rate (Highest)</option>
              <option value="pf">Profit Factor (Highest)</option>
              <option value="dd">Max Drawdown (Lowest)</option>
              <option value="trades">Trade Count (Most)</option>
            </select>
          </div>
        </div>

      </div>

      {/* View Mode: Cards Grid */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredStrategies.map((algo) => {
            const isSelected = selectedStrategyId === algo.id;
            const isLong = algo.type === 'LONG';
            const m = algo.metrics || {};

            return (
              <div
                key={algo.id}
                className={`relative bg-floor-darker border-2 transition-all duration-200 p-4 flex flex-col justify-between group ${
                  isSelected
                    ? 'border-signal-cyan shadow-pixel-cyan bg-floor-darker/95'
                    : 'border-floor-border hover:border-floor-borderLight'
                }`}
              >
                {/* Card Top: Badges & Title */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {/* Direction & Timeframe */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-pixel text-[9px] px-2 py-0.5 border flex items-center gap-1 ${
                          isLong
                            ? 'border-signal-bull/60 text-signal-bull bg-signal-bull/10'
                            : 'border-signal-bear/60 text-signal-bear bg-signal-bear/10'
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {algo.type}
                      </span>
                      <span className="font-mono text-xs px-1.5 py-0.5 bg-floor-wall border border-floor-border text-retro-muted uppercase font-bold">
                        {algo.timeframe}
                      </span>
                    </div>

                    {/* Highlight Badge */}
                    {algo.badge && (
                      <span className="font-mono text-[10px] text-signal-warn bg-signal-warn/10 border border-signal-warn/30 px-2 py-0.5 truncate max-w-[170px]">
                        ★ {algo.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="font-pixel text-xs text-retro-text tracking-wide mb-1 group-hover:text-signal-cyan transition-colors">
                    {algo.name}
                  </h3>

                  <div className="text-[11px] font-mono text-signal-cyan/90 mb-3">
                    // {algo.category || algo.archetype}
                  </div>

                  {/* 4 Core Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 bg-floor-bg border border-floor-border p-2.5 mb-3 font-mono">
                    {/* Return */}
                    <div>
                      <div className="text-[10px] text-retro-dim">TOTAL RETURN</div>
                      <div className="font-bold text-sm text-signal-bull">
                        +{Number(m.total_return_pct || 0).toLocaleString()}%
                      </div>
                    </div>

                    {/* Win Rate */}
                    <div>
                      <div className="text-[10px] text-retro-dim">WIN RATE</div>
                      <div className="font-bold text-sm text-retro-text">
                        {m.win_rate_pct || 0}%
                        <span className="text-[10px] text-retro-muted font-normal ml-1">
                          ({m.total_trades || 0}T)
                        </span>
                      </div>
                    </div>

                    {/* Profit Factor */}
                    <div>
                      <div className="text-[10px] text-retro-dim">PROFIT FACTOR</div>
                      <div className="font-bold text-sm text-signal-cyan">
                        {m.profit_factor || 0}x
                      </div>
                    </div>

                    {/* Max Drawdown */}
                    <div>
                      <div className="text-[10px] text-retro-dim">MAX DRAWDOWN</div>
                      <div className="font-bold text-sm text-signal-bear">
                        {m.max_drawdown_pct || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Recommended Thesis */}
                  <p className="text-xs text-retro-muted leading-relaxed font-sans mb-4 line-clamp-2">
                    {algo.recommended_for}
                  </p>
                </div>

                {/* Card Actions */}
                <div className="border-t border-floor-border pt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      playRetroSound('select');
                      if (onSelectStrategy) onSelectStrategy(algo.id);
                    }}
                    className={`flex-1 py-2 font-pixel text-[10px] border transition-all flex items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'bg-signal-cyan border-signal-cyan text-floor-darker font-bold shadow-pixel-cyan'
                        : 'bg-floor-wall hover:bg-floor-border border-floor-border text-retro-text'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>CHART ACTIVE</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>PLOT TO CHART</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      playRetroSound('blip');
                      if (onOpenDetail) onOpenDetail(algo.id);
                    }}
                    className="px-3 py-2 bg-floor-bg hover:bg-floor-wall border border-floor-border text-signal-cyan font-mono text-xs transition-colors"
                    title="View full parameters & trade history"
                  >
                    DETAIL &gt;
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* View Mode: Comparison Matrix Table */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto border border-floor-border bg-floor-darker">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-floor-wall text-retro-dim border-b border-floor-border text-[11px]">
                <th className="p-3">STRATEGY</th>
                <th className="p-3 text-center">TYPE</th>
                <th className="p-3 text-center">TIMEFRAME</th>
                <th className="p-3 text-right">TOTAL RETURN</th>
                <th className="p-3 text-right">WIN RATE</th>
                <th className="p-3 text-right">PROFIT FACTOR</th>
                <th className="p-3 text-right">MAX DRAWDOWN</th>
                <th className="p-3 text-right">TRADES</th>
                <th className="p-3 text-center">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-floor-border">
              {filteredStrategies.map((algo) => {
                const isSelected = selectedStrategyId === algo.id;
                const isLong = algo.type === 'LONG';
                const m = algo.metrics || {};

                return (
                  <tr
                    key={algo.id}
                    className={`hover:bg-floor-wall/50 transition-colors ${
                      isSelected ? 'bg-signal-cyan/5 border-l-4 border-l-signal-cyan' : ''
                    }`}
                  >
                    <td className="p-3">
                      <div className="font-pixel text-xs text-retro-text">{algo.name}</div>
                      <div className="text-[11px] text-retro-muted">{algo.archetype}</div>
                    </td>
                    <td className="p-3 text-center">
                      <span
                        className={`text-[10px] font-pixel px-2 py-0.5 border ${
                          isLong
                            ? 'text-signal-bull border-signal-bull/40 bg-signal-bull/10'
                            : 'text-signal-bear border-signal-bear/40 bg-signal-bear/10'
                        }`}
                      >
                        {algo.type}
                      </span>
                    </td>
                    <td className="p-3 text-center uppercase font-bold text-retro-text">
                      {algo.timeframe}
                    </td>
                    <td className="p-3 text-right font-bold text-signal-bull">
                      +{Number(m.total_return_pct || 0).toLocaleString()}%
                    </td>
                    <td className="p-3 text-right text-retro-text">
                      {m.win_rate_pct || 0}%
                    </td>
                    <td className="p-3 text-right text-signal-cyan font-bold">
                      {m.profit_factor || 0}x
                    </td>
                    <td className="p-3 text-right text-signal-bear">
                      {m.max_drawdown_pct || 0}%
                    </td>
                    <td className="p-3 text-right text-retro-muted">
                      {m.total_trades || 0}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectStrategy && onSelectStrategy(algo.id)}
                          className={`px-2 py-1 text-[10px] font-pixel border ${
                            isSelected
                              ? 'bg-signal-cyan text-floor-darker border-signal-cyan font-bold'
                              : 'bg-floor-wall border-floor-border text-retro-text hover:bg-floor-border'
                          }`}
                        >
                          {isSelected ? 'ACTIVE' : 'PLOT'}
                        </button>
                        <button
                          onClick={() => onOpenDetail && onOpenDetail(algo.id)}
                          className="px-2 py-1 text-[11px] bg-floor-bg border border-floor-border text-signal-cyan hover:bg-floor-wall"
                        >
                          DETAIL
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

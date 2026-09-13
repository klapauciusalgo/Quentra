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
  Table, 
  LayoutGrid,
  Filter,
  Search,
  ChevronRight
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
    <div className="apple-glass rounded-3xl p-5 md:p-7 space-y-6">
      
      {/* Header & Title */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-apple-green shadow-[0_0_8px_rgba(48,209,88,0.6)]" />
            <h2 className="font-semibold text-lg md:text-xl text-white tracking-tight">
              Algorithm Strategy Directory
            </h2>
            <span className="bg-apple-blue/15 border border-apple-blue/30 text-apple-cyan text-[11px] font-medium px-2.5 py-0.5 rounded-full">
              {strategies.length} Verified Models
            </span>
          </div>
          <p className="text-xs md:text-sm text-apple-muted mt-1 max-w-2xl">
            Explore quantitative trading systems calibrated with empirical backtest performance and disciplined risk limits.
          </p>
        </div>

        {/* View Mode Segmented Control */}
        <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] p-1 rounded-xl">
          <button
            onClick={() => {
              playRetroSound('blip');
              setViewMode('cards');
            }}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              viewMode === 'cards' ? 'bg-white/15 text-white shadow-sm font-semibold' : 'text-apple-muted hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            onClick={() => {
              playRetroSound('blip');
              setViewMode('table');
            }}
            className={`px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
              viewMode === 'table' ? 'bg-white/15 text-white shadow-sm font-semibold' : 'text-apple-muted hover:text-white'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Matrix</span>
          </button>
        </div>
      </div>

      {/* Filter & Preference Matcher Toolbar */}
      <div className="apple-glass-card rounded-2xl p-4 space-y-3.5">
        {/* Row 1: Direction, Timeframe, Search */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          
          {/* Direction Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-apple-dim font-medium mr-1">Type:</span>
            <div className="flex items-center bg-white/[0.04] border border-white/[0.08] p-0.5 rounded-xl">
              {['ALL', 'LONG', 'SHORT'].map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    playRetroSound('blip');
                    setDirectionFilter(type);
                  }}
                  className={`text-xs px-3 py-1 rounded-lg transition-all font-medium cursor-pointer ${
                    directionFilter === type
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-apple-muted hover:text-white'
                  }`}
                >
                  {type === 'ALL' ? 'All' : type === 'LONG' ? 'Long' : 'Short'}
                </button>
              ))}
            </div>
          </div>

          {/* Timeframe Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-apple-dim font-medium mr-1">Timeframe:</span>
            <div className="flex items-center bg-white/[0.04] border border-white/[0.08] p-0.5 rounded-xl">
              {['ALL', '30m', '1h', '4h', '1w'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => {
                    playRetroSound('blip');
                    setTimeframeFilter(tf);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg uppercase transition-all font-medium cursor-pointer ${
                    timeframeFilter.toLowerCase() === tf.toLowerCase()
                      ? 'bg-white/15 text-white font-semibold shadow-sm'
                      : 'text-apple-muted hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-apple-dim" />
            <input
              type="text"
              placeholder="Search by name, archetype, or logic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs pl-9 pr-3.5 py-2 text-white placeholder:text-apple-dim focus:outline-none focus:ring-2 focus:ring-apple-blue/50 transition-all"
            />
          </div>

        </div>

        {/* Row 2: Archetype Quick Filters & Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          {/* Quick Style Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-apple-dim font-medium mr-1">Profile:</span>
            {[
              { id: 'ALL', label: 'All Profiles' },
              { id: 'HIGH_WINRATE', label: 'High Win Rate (65%+)' },
              { id: 'RUNNER', label: 'Trend Runners (+1,000%+)' },
              { id: 'DEFENSIVE', label: 'Low Drawdown (<30%)' },
            ].map((pref) => (
              <button
                key={pref.id}
                onClick={() => {
                  playRetroSound('blip');
                  setArchetypeFilter(pref.id);
                }}
                className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer ${
                  archetypeFilter === pref.id
                    ? 'bg-apple-orange/15 text-apple-orange border-apple-orange/40 font-medium'
                    : 'bg-white/[0.02] border-white/[0.06] text-apple-muted hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {pref.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-apple-dim font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                playRetroSound('blip');
                setSortBy(e.target.value);
              }}
              className="bg-white/[0.05] border border-white/[0.08] text-white rounded-xl text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-apple-blue/50 cursor-pointer"
            >
              <option value="return" className="bg-zinc-900 text-white">Total Return (Highest)</option>
              <option value="winrate" className="bg-zinc-900 text-white">Win Rate (Highest)</option>
              <option value="pf" className="bg-zinc-900 text-white">Profit Factor (Highest)</option>
              <option value="dd" className="bg-zinc-900 text-white">Max Drawdown (Lowest)</option>
              <option value="trades" className="bg-zinc-900 text-white">Trade Count (Most)</option>
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
                className={`apple-glass-card rounded-2xl p-5 flex flex-col justify-between transition-all duration-200 group ${
                  isSelected
                    ? 'ring-2 ring-apple-blue/60 bg-[#161724]/90 border-white/20'
                    : 'hover:border-white/20'
                }`}
              >
                {/* Card Top: Badges & Title */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                          isLong
                            ? 'border-apple-green/40 text-apple-green bg-apple-green/10'
                            : 'border-apple-red/40 text-apple-red bg-apple-red/10'
                        }`}
                      >
                        {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                        <span>{algo.type}</span>
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-apple-muted uppercase font-medium">
                        {algo.timeframe}
                      </span>
                    </div>

                    {algo.badge && (
                      <span className="text-[11px] text-apple-orange bg-apple-orange/10 border border-apple-orange/25 px-2.5 py-0.5 rounded-full font-medium truncate max-w-[170px]">
                        {algo.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-white tracking-tight mb-1 group-hover:text-apple-cyan transition-colors">
                    {algo.name}
                  </h3>

                  <div className="text-xs text-apple-blue font-medium mb-3">
                    {algo.category || algo.archetype}
                  </div>

                  {/* 4 Core Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2.5 bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 mb-3">
                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">Total Return</div>
                      <div className="font-semibold text-sm text-apple-green font-mono tabular-nums mt-0.5">
                        +{Number(m.total_return_pct || 0).toLocaleString()}%
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">Win Rate</div>
                      <div className="font-semibold text-sm text-white font-mono tabular-nums mt-0.5">
                        {m.win_rate_pct || 0}%
                        <span className="text-[10px] text-apple-muted font-normal ml-1">
                          ({m.total_trades || 0}T)
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">Profit Factor</div>
                      <div className="font-semibold text-sm text-apple-cyan font-mono tabular-nums mt-0.5">
                        {m.profit_factor || 0}x
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] text-apple-dim uppercase tracking-wider">Max Drawdown</div>
                      <div className="font-semibold text-sm text-apple-red font-mono tabular-nums mt-0.5">
                        {m.max_drawdown_pct || 0}%
                      </div>
                    </div>
                  </div>

                  {/* Recommended Thesis */}
                  <p className="text-xs text-apple-muted leading-relaxed mb-4 line-clamp-2">
                    {algo.recommended_for}
                  </p>
                </div>

                {/* Card Actions */}
                <div className="border-t border-white/[0.06] pt-3 flex items-center gap-2">
                  <button
                    onClick={() => {
                      playRetroSound('select');
                      if (onSelectStrategy) onSelectStrategy(algo.id);
                    }}
                    className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px] ${
                      isSelected
                        ? 'bg-apple-blue text-white border-apple-blue shadow-sm font-semibold'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/[0.08] text-white'
                    }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Active on Chart</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 text-apple-muted" />
                        <span>Plot to Chart</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      playRetroSound('blip');
                      if (onOpenDetail) onOpenDetail(algo.id);
                    }}
                    className="px-3 py-2 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] text-white text-xs font-medium rounded-xl transition-colors cursor-pointer min-h-[38px] flex items-center gap-1"
                    title="View full parameters & trade history"
                  >
                    <span>Details</span>
                    <ChevronRight className="w-3.5 h-3.5 text-apple-muted" />
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* View Mode: Comparison Matrix Table */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-white/[0.04] text-apple-muted border-b border-white/[0.08] text-[11px] font-medium">
                <th className="p-3.5">Strategy</th>
                <th className="p-3.5 text-center">Type</th>
                <th className="p-3.5 text-center">Timeframe</th>
                <th className="p-3.5 text-right">Total Return</th>
                <th className="p-3.5 text-right">Win Rate</th>
                <th className="p-3.5 text-right">Profit Factor</th>
                <th className="p-3.5 text-right">Max Drawdown</th>
                <th className="p-3.5 text-right">Trades</th>
                <th className="p-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredStrategies.map((algo) => {
                const isSelected = selectedStrategyId === algo.id;
                const isLong = algo.type === 'LONG';
                const m = algo.metrics || {};

                return (
                  <tr
                    key={algo.id}
                    className={`hover:bg-white/[0.04] transition-colors ${
                      isSelected ? 'bg-apple-blue/10 border-l-2 border-l-apple-blue' : ''
                    }`}
                  >
                    <td className="p-3.5">
                      <div className="font-semibold text-white">{algo.name}</div>
                      <div className="text-[11px] text-apple-muted">{algo.archetype}</div>
                    </td>
                    <td className="p-3.5 text-center">
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                          isLong
                            ? 'text-apple-green border-apple-green/30 bg-apple-green/10'
                            : 'text-apple-red border-apple-red/30 bg-apple-red/10'
                        }`}
                      >
                        {algo.type}
                      </span>
                    </td>
                    <td className="p-3.5 text-center uppercase font-medium text-white">
                      {algo.timeframe}
                    </td>
                    <td className="p-3.5 text-right font-semibold font-mono tabular-nums text-apple-green">
                      +{Number(m.total_return_pct || 0).toLocaleString()}%
                    </td>
                    <td className="p-3.5 text-right text-white font-mono tabular-nums">
                      {m.win_rate_pct || 0}%
                    </td>
                    <td className="p-3.5 text-right text-apple-cyan font-semibold font-mono tabular-nums">
                      {m.profit_factor || 0}x
                    </td>
                    <td className="p-3.5 text-right text-apple-red font-mono tabular-nums">
                      {m.max_drawdown_pct || 0}%
                    </td>
                    <td className="p-3.5 text-right text-apple-muted font-mono tabular-nums">
                      {m.total_trades || 0}
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => onSelectStrategy && onSelectStrategy(algo.id)}
                          className={`px-3 py-1 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-apple-blue text-white border-apple-blue font-semibold'
                              : 'bg-white/[0.04] border-white/[0.08] text-white hover:bg-white/[0.1]'
                          }`}
                        >
                          {isSelected ? 'Active' : 'Plot'}
                        </button>
                        <button
                          onClick={() => onOpenDetail && onOpenDetail(algo.id)}
                          className="px-3 py-1 text-xs font-medium bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] text-apple-muted hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                          Details
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

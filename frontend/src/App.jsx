import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import StrategyRibbon from './components/StrategyRibbon';
import TradingChart from './components/TradingChart';
import PixelTradingFloor from './components/PixelTradingFloor';
import AlgoExplorer from './components/AlgoExplorer';
import StrategyDetail from './components/StrategyDetail';
import RiskCalculator from './components/RiskCalculator';
import AgentDrawer from './components/AgentDrawer';
import { playRetroSound } from './utils/formatters';
import { Bell, BarChart3, Layers, Compass, ShieldCheck, Grid } from 'lucide-react';
import { API_BASE, getWsUrl } from './config';
import strategiesData from './data/strategiesData.json';

// Default floor state for offline or standalone edge deployments
const DEFAULT_FLOOR_STATE = {
  active_agent_id: 'trader',
  market_regime: {
    status: 'MACRO_DISCOUNT',
    weekly_ma55: 82654,
    distance_pct: -6.5,
    stance_description: 'Weekly MA55 Anchor at $82,654 (-6.5% discount)'
  },
  session: {
    name: 'London / New York Overlap (Peak Volume)',
    active: true,
    code: 'LDN_NY',
    time_utc: '15:00 UTC'
  },
  signal_ticket: {
    symbol: 'BTC/USDT',
    direction: 'LONG',
    strategy_name: 'Pippo 1h Enhanced',
    strategy_id: 'pippo-1h-enhanced',
    confidence_pct: 88,
    confidence_blocks: 8,
    entry_price: 77293.0,
    stop_loss: 71109.0,
    stop_loss_pct: -8.0,
    breakeven_trigger: 81157.0,
    breakeven_trigger_pct: 5.0,
    take_profit: 135262.0,
    take_profit_pct: 75.0,
    risk_reward_ratio: '9.37x',
    timestamp: '2026-09-13 16:00 UTC',
    contributing_agents: ['quant', 'trader', 'informan'],
    status: 'ACTIVE WATCH'
  },
  agents: [
    {
      id: 'researcher',
      name: 'Researcher',
      role: 'Macro & On-Chain Scout',
      status_badge: 'ANALYZING',
      speech_bubble: 'Global liquidity index +2.4%. On-chain UTXO accumulation steady.',
      reasoning_log: [
        'Macro Liquidity: Global central bank balance sheets showing mild expansion.',
        'On-Chain Health: Long-term holder supply holding above 74% total circulating BTC.',
        'Derivatives Funding: Neutral-to-negative (-0.002%), indicating healthy short-squeeze potential.',
        'ETF Flows: Net inflows over the trailing 5-day cycle totaling $420M.',
        'Cycle Thesis: 4-year halving trajectory in prime expansion phase; macro dips remain high-conviction accumulation zones.'
      ]
    },
    {
      id: 'quant',
      name: 'Quant',
      role: 'SMC & Algorithmic Indicators',
      status_badge: 'COMPUTING',
      speech_bubble: '1H 16-bar internal structure broke bullish. 48h floor intact.',
      reasoning_log: [
        'BTC Price: Momentum holding above 1H EMA50 ($76,920).',
        'Smart Money Concepts (SMC): 50-bar major swing high validated; 16-bar internal CHoCH confirmed.',
        'Structural Exit Floor: 48-hour swing low set at $74,800. Any candle close below terminates runner.',
        'Volatility Compression: Bollinger Band bandwidth down to 2.8%, signaling incoming expansion impulse.'
      ]
    },
    {
      id: 'trader',
      name: 'Trader',
      role: 'Signal Dispatcher & Execution',
      status_badge: 'SIGNAL DISPATCH',
      speech_bubble: 'Pippo 1H Enhanced setup primed. Limit orders standing by.',
      reasoning_log: [
        'Active Setup: Pippo 1h Enhanced (Historical Win Rate 65.6%, Profit Factor 3.81).',
        'Order Routing: Limit fill protocol on bar close confirmation (0.09% taker fee modeled).',
        'Risk Gate: Hard stop loss fixed at -8.0% ($71,109).',
        'Dynamic Breakeven: At +5.0% profit ($81,157), stop loss will automatically jump to entry + 0.2% for risk-free run.',
        'Target Runner: +75.0% take profit ladder ($135,262) with 48h trailing structural floor.'
      ]
    },
    {
      id: 'informan',
      name: 'Informan',
      role: 'Market Regime & Sentiment',
      status_badge: 'REGIME WATCH',
      speech_bubble: 'Weekly MA55 at $82,654 (-6.5%). Macro accumulation floor validated.',
      reasoning_log: [
        'Macro Regime: Price operating in accumulation band below Weekly MA55 ($82,654).',
        'Historical Comp: Similar cyclical setups in Q4 2020 yielded multi-month trending rallies.',
        'Liquidity Vacuum: Thin sell-side liquidity above $80,000 creates accelerated path to new highs once resistance breaks.'
      ]
    },
    {
      id: 'risk_officer',
      name: 'Risk Officer',
      role: 'Capital Preservation & Volatility Guard',
      status_badge: 'GUARDED',
      speech_bubble: 'Liquidation buffer verified -96% from market. Drawdown stop locked.',
      reasoning_log: [
        'Leverage Cap: Spot-equivalent 1.0x modeled. Zero liquidation danger.',
        'Drawdown Ceiling: Historical max drawdown capped at -19.7% across 6-year test suite.',
        'Capital Allocation: 80% free cash held in reserve; 20% max deployed per isolated trade.'
      ]
    }
  ]
};

export default function App() {
  const [status, setStatus] = useState({
    binance_ws_connected: false,
    ticker_status: 'INITIALIZING',
  });
  const [ticker, setTicker] = useState({
    price: 77379.6,
    change_24h_pct: 0.12,
    high_24h: 79890.0,
    low_24h: 76046.58,
    volume_24h: 18905.45,
  });
  const [floor, setFloor] = useState(DEFAULT_FLOOR_STATE);
  const [strategies, setStrategies] = useState(strategiesData || []);
  const [selectedStrategyId, setSelectedStrategyId] = useState('pippo-1h-enhanced');
  const [timeframe, setTimeframe] = useState('1h');
  
  // View Filter Segment: 'all' | 'chart' | 'desk' | 'catalog' | 'risk'
  const [activeView, setActiveView] = useState('all');

  // Modals, Drawers & Banners
  const [detailStrategyId, setDetailStrategyId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [bannerAlert, setBannerAlert] = useState(null);

  const wsRef = useRef(null);
  const directBinanceWsRef = useRef(null);

  // 1. Fetch initial platform data with automatic fallbacks
  useEffect(() => {
    // Status
    fetch(`${API_BASE}/api/status`)
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.latest_btc_price) {
          setTicker((prev) => ({ ...prev, price: data.latest_btc_price }));
        }
      })
      .catch((err) => {
        console.warn('Status endpoint unavailable, using direct edge telemetry');
      });

    // Ticker
    fetch(`${API_BASE}/api/ticker`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.price) setTicker(data);
      })
      .catch(() => {});

    // Floor state for market regime and sessions
    fetch(`${API_BASE}/api/floor`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.agents) setFloor(data);
      })
      .catch(() => {
        // Keep default rich floor state
      });

    // Strategies
    fetch(`${API_BASE}/api/strategies`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setStrategies(data);
        }
      })
      .catch(() => {
        // Already initialized with bundled strategiesData
      });
  }, []);

  // 2. Establish WebSocket connection to backend or fallback to Binance Direct
  useEffect(() => {
    let reconnectTimeout = null;
    let fallbackTimeout = null;

    function connectDirectBinance() {
      if (directBinanceWsRef.current) return;
      try {
        const binanceWs = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');
        directBinanceWsRef.current = binanceWs;

        binanceWs.onopen = () => {
          setStatus((prev) => ({ ...prev, binance_ws_connected: true, ticker_status: 'DIRECT_LIVE' }));
        };

        binanceWs.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.c) {
              const curPrice = parseFloat(data.c);
              const openPrice = parseFloat(data.o);
              const changePct = ((curPrice - openPrice) / openPrice) * 100;
              setTicker({
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(data.h),
                low_24h: parseFloat(data.l),
                volume_24h: parseFloat(data.v),
              });
            }
          } catch (e) {}
        };

        binanceWs.onerror = () => {
          setStatus((prev) => ({ ...prev, binance_ws_connected: false }));
        };
      } catch (e) {}
    }

    function connectBackend() {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // If backend WS does not establish within 2.5s, activate direct Binance stream
      fallbackTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          connectDirectBinance();
        }
      }, 2500);

      ws.onopen = () => {
        if (fallbackTimeout) clearTimeout(fallbackTimeout);
        if (directBinanceWsRef.current) {
          directBinanceWsRef.current.close();
          directBinanceWsRef.current = null;
        }
        setStatus((prev) => ({ ...prev, binance_ws_connected: true }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TICKER') {
            setTicker(msg.data);
          } else if (msg.type === 'STATUS') {
            setStatus((prev) => ({
              ...prev,
              binance_ws_connected: msg.binance_connected,
              ticker_status: msg.status,
            }));
          } else if (msg.type === 'FLOOR_UPDATE') {
            setFloor(msg.floor);
          } else if (msg.type === 'NEW_SIGNAL') {
            playRetroSound('signal');
            setFloor(msg.floor);
            setBannerAlert({
              title: `NEW ${msg.ticket?.direction} SIGNAL DISPATCHED!`,
              strategy: msg.ticket?.strategy_name,
              price: msg.ticket?.entry_price,
            });
            setTimeout(() => setBannerAlert(null), 6000);
          }
        } catch (err) {
          console.error('Error handling WS message:', err);
        }
      };

      ws.onclose = () => {
        connectDirectBinance();
        reconnectTimeout = setTimeout(connectBackend, 8000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connectBackend();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (fallbackTimeout) clearTimeout(fallbackTimeout);
      if (wsRef.current) wsRef.current.close();
      if (directBinanceWsRef.current) directBinanceWsRef.current.close();
    };
  }, []);

  // Switch strategy AND automatically adapt chart timeframe
  const handleSelectStrategy = (stratId) => {
    setSelectedStrategyId(stratId);
    const strat = strategies.find((s) => s.id === stratId);
    if (strat?.timeframe) {
      setTimeframe(strat.timeframe.toLowerCase());
    }
  };

  // Open strategy detail modal
  const handleOpenDetail = (stratId) => {
    setDetailStrategyId(stratId);
    setIsDetailOpen(true);
  };

  // Open agent inspector drawer
  const handleSelectAgent = (agentId) => {
    const foundAgent = floor?.agents?.find((a) => a.id === agentId) || DEFAULT_FLOOR_STATE.agents.find((a) => a.id === agentId);
    if (foundAgent) {
      setSelectedAgent(foundAgent);
      setIsAgentDrawerOpen(true);
    }
  };

  // Dispatch simulated test signal
  const handleSimulateSignal = () => {
    fetch(`${API_BASE}/api/floor/simulate-signal?strategy_id=${selectedStrategyId}`, { method: 'POST' })
      .then((r) => r.json())
      .catch(() => {
        // Local simulation trigger if backend endpoint offline
        playRetroSound('signal');
        setBannerAlert({
          title: 'NEW LONG SIGNAL DISPATCHED',
          strategy: 'Pippo 1H Enhanced',
          price: ticker.price || 77300,
        });
        setTimeout(() => setBannerAlert(null), 6000);
      });
  };

  const activeStrategyObj = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];

  return (
    <div className="min-h-screen bg-[#07080A] text-apple-text flex flex-col font-sans selection:bg-apple-blue selection:text-white">
      
      {/* Top Navigation Bar */}
      <Header
        ticker={ticker}
        status={status}
        floor={floor}
        onSimulateSignal={handleSimulateSignal}
      />

      {/* Real-time Signal Alert Dynamic Banner */}
      {bannerAlert && (
        <div className="bg-apple-blue/15 border-b border-apple-blue/30 backdrop-blur-xl px-4 py-2.5 text-xs flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="max-w-[1500px] mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-white font-medium">
              <span className="w-2 h-2 rounded-full bg-apple-cyan animate-ping" />
              <Bell className="w-4 h-4 text-apple-cyan" />
              <span className="font-semibold">{bannerAlert.title}</span>
              <span className="text-apple-muted">/ {bannerAlert.strategy} @ ${bannerAlert.price?.toLocaleString()}</span>
            </div>
            <button
              onClick={() => setBannerAlert(null)}
              className="text-apple-muted hover:text-white text-xs px-2.5 py-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-[1500px] mx-auto w-full px-4 sm:px-6 py-6 space-y-7">
        
        {/* Apple Segmented View Switcher */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-1">
          <div className="apple-segmented-container">
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('all');
              }}
              className={`apple-segmented-item ${activeView === 'all' ? 'active' : ''}`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Full Workspace</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('chart');
              }}
              className={`apple-segmented-item ${activeView === 'chart' ? 'active' : ''}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Chart & Signals</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('desk');
              }}
              className={`apple-segmented-item ${activeView === 'desk' ? 'active' : ''}`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Autonomous Desk</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('catalog');
              }}
              className={`apple-segmented-item ${activeView === 'catalog' ? 'active' : ''}`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Algo Catalog</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('risk');
              }}
              className={`apple-segmented-item ${activeView === 'risk' ? 'active' : ''}`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Risk Gate</span>
            </button>
          </div>

          <div className="text-xs text-apple-dim hidden sm:block">
            Ground truth BTC backtest data: 2020-2026
          </div>
        </div>

        {/* Section 1: Quantitative Strategy Ribbon */}
        {(activeView === 'all' || activeView === 'chart') && (
          <section>
            <StrategyRibbon
              strategies={strategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={handleSelectStrategy}
              onOpenDetail={handleOpenDetail}
              currentBtcPrice={ticker.price}
              floor={floor}
            />
          </section>
        )}

        {/* Section 2: Interactive Candlestick Chart BTCUSDT with Strategy Markers Overlay */}
        {(activeView === 'all' || activeView === 'chart') && (
          <section>
            <TradingChart
              timeframe={timeframe}
              onTimeframeChange={(tf) => setTimeframe(tf)}
              activeStrategy={activeStrategyObj}
              liveTicker={ticker}
            />
          </section>
        )}

        {/* Section 3: Autonomous Agent Desk / Command Center */}
        {(activeView === 'all' || activeView === 'desk') && (
          <section>
            <PixelTradingFloor
              floor={floor}
              onSelectAgent={handleSelectAgent}
              onSelectStrategy={handleSelectStrategy}
              currentBtcPrice={ticker.price}
            />
          </section>
        )}

        {/* Section 4: Algo Strategy Explorer & Preference Matcher */}
        {(activeView === 'all' || activeView === 'catalog') && (
          <section>
            <AlgoExplorer
              strategies={strategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={handleSelectStrategy}
              onOpenDetail={handleOpenDetail}
            />
          </section>
        )}

        {/* Section 5: Leverage & Liquidation Safety Calculator */}
        {(activeView === 'all' || activeView === 'risk') && (
          <section>
            <RiskCalculator currentBtcPrice={ticker.price} />
          </section>
        )}

      </main>

      {/* Modal: Strategy Parameter Matrix & Full Trade Log */}
      <StrategyDetail
        strategyId={detailStrategyId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onSelectStrategy={handleSelectStrategy}
      />

      {/* Slide-over Sheet: Autonomous Agent Inspector */}
      <AgentDrawer
        agent={selectedAgent}
        isOpen={isAgentDrawerOpen}
        onClose={() => setIsAgentDrawerOpen(false)}
        onSelectStrategy={handleSelectStrategy}
      />

      {/* Footer */}
      <footer className="border-t border-white/[0.08] bg-[#07080A] py-6 px-4 sm:px-6 text-xs text-apple-muted">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.7)]" />
            <span className="font-semibold text-white tracking-tight">Quentra Pro</span>
            <span className="text-apple-dim">/ Quantitative Trading Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-apple-dim">
            <span>Binance WebSocket Stream + 2020-2026 Ground Truth</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

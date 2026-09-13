import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import StrategyRibbon from './components/StrategyRibbon';
import TradingChart from './components/TradingChart';
import AlgoExplorer from './components/AlgoExplorer';
import StrategyDetail from './components/StrategyDetail';
import RiskCalculator from './components/RiskCalculator';
import { playRetroSound } from './utils/formatters';
import { Bell } from 'lucide-react';
import { API_BASE, getWsUrl } from './config';

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
  const [floor, setFloor] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('pippo-1h-enhanced');
  const [timeframe, setTimeframe] = useState('1h');
  
  // Modals & Banners
  const [detailStrategyId, setDetailStrategyId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [bannerAlert, setBannerAlert] = useState(null);

  const wsRef = useRef(null);

  // 1. Fetch initial platform data
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
      .catch(console.error);

    // Ticker
    fetch(`${API_BASE}/api/ticker`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.price) setTicker(data);
      })
      .catch(console.error);

    // Floor state for market regime and sessions
    fetch(`${API_BASE}/api/floor`)
      .then((r) => r.json())
      .then((data) => setFloor(data))
      .catch(console.error);

    // Strategies (now includes markers and parameters)
    fetch(`${API_BASE}/api/strategies`)
      .then((r) => r.json())
      .then((data) => {
        setStrategies(data);
        if (data.length > 0 && !selectedStrategyId) {
          setSelectedStrategyId(data[0].id);
          setTimeframe(data[0].timeframe?.toLowerCase() || '1h');
        }
      })
      .catch(console.error);
  }, []);

  // 2. Establish WebSocket connection to backend
  useEffect(() => {
    let reconnectTimeout = null;

    function connect() {
      const wsUrl = getWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to QuietAlgo WebSocket');
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
        console.warn('QuietAlgo WebSocket disconnected. Retrying in 3s...');
        setStatus((prev) => ({ ...prev, binance_ws_connected: false }));
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('QuietAlgo WebSocket error:', err);
        ws.close();
      };
    }

    connect();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // When user clicks a strategy: switch strategy AND automatically adapt chart timeframe
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

  // Dispatch simulated test signal
  const handleSimulateSignal = () => {
    fetch(`/api/floor/simulate-signal?strategy_id=${selectedStrategyId}`, { method: 'POST' })
      .then((r) => r.json())
      .catch(console.error);
  };

  const activeStrategyObj = strategies.find((s) => s.id === selectedStrategyId);

  return (
    <div className="min-h-screen bg-floor-bg text-retro-text flex flex-col selection:bg-signal-cyan selection:text-floor-darker font-sans">
      
      {/* Top Header */}
      <Header
        ticker={ticker}
        status={status}
        floor={floor}
        onSimulateSignal={handleSimulateSignal}
      />

      {/* Real-time Signal Alert Banner */}
      {bannerAlert && (
        <div className="bg-signal-cyan/20 border-b-2 border-signal-cyan p-2.5 font-mono text-xs flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="max-w-[1600px] mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2 text-signal-cyan font-bold">
              <Bell className="w-4 h-4 animate-bounce" />
              <span className="font-pixel text-[11px]">{bannerAlert.title}</span>
              <span className="text-retro-text font-normal">// {bannerAlert.strategy} @ ${bannerAlert.price?.toLocaleString()}</span>
            </div>
            <button
              onClick={() => setBannerAlert(null)}
              className="text-retro-muted hover:text-retro-text text-xs font-mono"
            >
              [CLOSE]
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] mx-auto w-full p-3 sm:p-4 md:p-6 space-y-6">
        
        {/* Section 1: Quantitative Strategy Switcher & Execution Ribbon */}
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

        {/* Section 2: Interactive Candlestick Chart BTCUSDT with Strategy Markers Overlay */}
        <section>
          <TradingChart
            timeframe={timeframe}
            onTimeframeChange={(tf) => setTimeframe(tf)}
            activeStrategy={activeStrategyObj}
            liveTicker={ticker}
          />
        </section>

        {/* Section 3: Algo Strategy Explorer & Preference Matcher */}
        <section>
          <AlgoExplorer
            strategies={strategies}
            selectedStrategyId={selectedStrategyId}
            onSelectStrategy={handleSelectStrategy}
            onOpenDetail={handleOpenDetail}
          />
        </section>

        {/* Section 4: Leverage & Liquidation Safety Calculator */}
        <section>
          <RiskCalculator currentBtcPrice={ticker.price} />
        </section>

      </main>

      {/* Modal: Strategy Parameter Matrix & Full Trade Log */}
      <StrategyDetail
        strategyId={detailStrategyId}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onSelectStrategy={handleSelectStrategy}
      />

      {/* Footer */}
      <footer className="border-t-2 border-floor-border bg-floor-darker py-4 px-4 font-mono text-xs text-retro-muted">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-signal-bull animate-pulse"></span>
            <span className="font-pixel text-[10px] text-retro-text">QUIETALGO PLATFORM</span>
            <span className="text-retro-dim">// Algorithmic Trading Intelligence</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-retro-dim">
            <span>Data: Binance WebSocket Stream + 2020-2026 Ground Truth</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

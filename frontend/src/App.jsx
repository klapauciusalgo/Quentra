import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import StrategyRibbon, { StrategyDetailCard } from './components/StrategyRibbon';
import TradingChart from './components/TradingChart';
import AlgoExplorer from './components/AlgoExplorer';
import StrategyDetail from './components/StrategyDetail';
import RiskCalculator from './components/RiskCalculator';
import { playRetroSound } from './utils/formatters';
import { Bell, BarChart3, Compass, ShieldCheck, Grid } from 'lucide-react';
import { API_BASE, getWsUrl } from './config';
import strategiesData from './data/strategiesData.json';

// Minimal market regime and session state
const DEFAULT_FLOOR_STATE = {
  market_regime: {
    status: 'MACRO_DISCOUNT',
    weekly_ma55: 82654,
    distance_pct: -6.5,
  },
  session: {
    name: 'London / New York Overlap',
    active: true,
    code: 'LDN_NY',
  },
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
  
  // Primary View Mode: 'landing' (Product Overview) | 'dashboard' (Execution Platform)
  const [viewMode, setViewMode] = useState('landing');

  // View Filter Segment: 'all' | 'chart' | 'catalog' | 'risk'
  const [activeView, setActiveView] = useState('all');

  // Modals & Banners
  const [detailStrategyId, setDetailStrategyId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [bannerAlert, setBannerAlert] = useState(null);

  // Active Working Signals (BUY / SELL) & Notification Events
  const [activeSignals, setActiveSignals] = useState([]);
  const [signalNotifications, setSignalNotifications] = useState([]);

  // Theme Management (Light Mode is Default)
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('quentra_theme') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('quentra_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    playRetroSound('blip');
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const wsRef = useRef(null);
  const directBinanceWsRef = useRef(null);
  const lastWsTickTimeRef = useRef(0);

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
      .catch(() => {
        // Edge mode: direct stream active
      });

    // Ticker
    fetch(`${API_BASE}/api/ticker`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        throw new Error('Not JSON');
      })
      .then((data) => {
        if (data && data.price) setTicker(data);
      })
      .catch(() => {
        // Direct Bybit public ticker fallback (accessible worldwide)
        fetch('https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT')
          .then((r) => r.json())
          .then((data) => {
            const item = data?.result?.list?.[0];
            if (item) {
              const curPrice = parseFloat(item.lastPrice);
              const prevPrice = parseFloat(item.prevPrice24h || item.lastPrice);
              const changePct = ((curPrice - prevPrice) / prevPrice) * 100;
              setTicker({
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(item.highPrice24h),
                low_24h: parseFloat(item.lowPrice24h),
                volume_24h: parseFloat(item.volume24h),
              });
            }
          })
          .catch(() => {});
      });

    // Floor state for market regime and sessions
    fetch(`${API_BASE}/api/floor`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        throw new Error('Not JSON');
      })
      .then((data) => {
        if (data && (data.market_regime || data.session)) setFloor(data);
      })
      .catch(() => {});

    // Strategies
    fetch(`${API_BASE}/api/strategies`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        throw new Error('Not JSON');
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setStrategies(data);
        }
      })
      .catch(() => {
        // Initialized with bundled strategiesData
      });

    // Live Signals Telemetry
    fetch(`${API_BASE}/api/signals/live`)
      .then((r) => r.json())
      .then((data) => {
        if (data && Array.isArray(data.strategies)) {
          const inPos = data.strategies.filter((s) => s.position_status === 'IN_POSITION' || s.position_status === 'OPEN');
          if (inPos.length > 0) {
            setActiveSignals(
              inPos.map((s) => ({
                id: s.strategy_id,
                strategy_id: s.strategy_id,
                strategy_name: s.name,
                timeframe: s.timeframe,
                direction: s.direction,
                action: s.direction === 'LONG' ? 'BUY' : 'SELL',
                entry_price: s.entry_price || data.current_btc_price,
                current_price: data.current_btc_price,
                floating_pnl_pct: s.floating_pnl_pct || 0.0,
                stop_loss: s.stop_loss,
                take_profit: s.take_profit,
                timestamp: new Date().toLocaleTimeString(),
                status: 'IN_POSITION',
              }))
            );
          }
        }
      })
      .catch(() => {});

    // Periodic ticker sync: only query edge /api/ticker as fallback if no live WebSocket tick in the last 4s
    const tickerPollInterval = setInterval(() => {
      if (Date.now() - lastWsTickTimeRef.current < 4000) {
        return; // WebSocket is actively streaming real-time ticks
      }
      fetch(`${API_BASE}/api/ticker`)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.price && typeof data.price === 'number') {
            setTicker((prev) => {
              if (prev.price !== data.price) return { ...prev, ...data };
              return prev;
            });
          }
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(tickerPollInterval);
  }, []);

  // 2. Establish WebSocket connection to backend or fallback to Binance Direct
  useEffect(() => {
    let reconnectTimeout = null;
    let fallbackTimeout = null;

    function connectDirectBybit() {
      try {
        const bybitWs = new WebSocket('wss://stream.bybit.com/v5/public/spot');
        bybitWs.onopen = () => {
          bybitWs.send(JSON.stringify({ op: 'subscribe', args: ['tickers.BTCUSDT'] }));
          setStatus((prev) => ({ ...prev, binance_ws_connected: true, ticker_status: 'BYBIT_LIVE' }));
        };
        bybitWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.topic === 'tickers.BTCUSDT' && msg.data) {
              lastWsTickTimeRef.current = Date.now();
              const d = msg.data;
              const curPrice = parseFloat(d.lastPrice);
              const prevPrice = parseFloat(d.prevPrice24h || d.lastPrice);
              const changePct = ((curPrice - prevPrice) / prevPrice) * 100;
              setTicker({
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(d.highPrice24h),
                low_24h: parseFloat(d.lowPrice24h),
                volume_24h: parseFloat(d.volume24h),
              });
            }
          } catch (e) {}
        };
      } catch (e) {}
    }

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
              lastWsTickTimeRef.current = Date.now();
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
          connectDirectBybit();
        };
        binanceWs.onclose = () => {
          connectDirectBybit();
        };
      } catch (e) {
        connectDirectBybit();
      }
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
            lastWsTickTimeRef.current = Date.now();
            setTicker(msg.data);
          } else if (msg.type === 'SNAPSHOT') {
            if (msg.ticker && msg.ticker.price) {
              lastWsTickTimeRef.current = Date.now();
              setTicker(msg.ticker);
            }
            if (msg.binance_connected !== undefined) {
              setStatus((prev) => ({ ...prev, binance_ws_connected: msg.binance_connected }));
            }
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
            const direction = msg.ticket?.direction || 'LONG';
            const action = direction === 'LONG' ? 'BUY' : 'SELL';
            const sigId = msg.ticket?.strategy_id || `sig-${Date.now()}`;
            const newSig = {
              id: sigId,
              strategy_id: msg.ticket?.strategy_id,
              strategy_name: msg.ticket?.strategy_name || 'Autonomous Strategy',
              timeframe: msg.ticket?.timeframe || '1h',
              direction: direction,
              action: action,
              entry_price: msg.ticket?.entry_price || ticker.price,
              current_price: ticker.price,
              floating_pnl_pct: 0.0,
              stop_loss: msg.ticket?.stop_loss,
              take_profit: msg.ticket?.take_profit,
              timestamp: new Date().toLocaleTimeString(),
              status: 'IN_POSITION',
            };
            setActiveSignals((prev) => [newSig, ...prev.filter((s) => s.strategy_id !== newSig.strategy_id)]);
            setSignalNotifications((prev) => [
              {
                id: `notif-${Date.now()}`,
                type: 'NEW_SIGNAL',
                title: `AUTONOMOUS ${action} SIGNAL`,
                strategy: newSig.strategy_name,
                direction: direction,
                price: newSig.entry_price,
                stop_loss: newSig.stop_loss,
                timestamp: new Date().toLocaleTimeString(),
              },
              ...prev.slice(0, 19),
            ]);
            setBannerAlert({
              title: `AUTONOMOUS ${direction} SIGNAL DISPATCHED!`,
              strategy: `${msg.ticket?.strategy_name} @ $${Number(msg.ticket?.entry_price || 0).toLocaleString()} (SL: $${Number(msg.ticket?.stop_loss || 0).toLocaleString()})`,
              price: msg.ticket?.entry_price,
            });
            setTimeout(() => setBannerAlert(null), 7000);
          } else if (msg.type === 'SIGNAL_EXIT') {
            playRetroSound('alert');
            const pnl = msg.trade?.net_return_pct;
            const pnlStr = pnl !== undefined ? `${pnl > 0 ? '+' : ''}${pnl}%` : '';
            if (msg.strategy_id) {
              setActiveSignals((prev) => prev.filter((s) => s.strategy_id !== msg.strategy_id));
            }
            setSignalNotifications((prev) => [
              {
                id: `notif-${Date.now()}`,
                type: 'SIGNAL_EXIT',
                title: `POSITION CLOSED: ${msg.strategy_name || ''}`,
                strategy: msg.strategy_name || '',
                reason: msg.trade?.reason || 'Market Exit',
                pnl: pnlStr,
                price: msg.trade?.exit_price,
                timestamp: new Date().toLocaleTimeString(),
              },
              ...prev.slice(0, 19),
            ]);
            setBannerAlert({
              title: `AUTONOMOUS POSITION CLOSED: ${msg.strategy_name || ''}`,
              strategy: `Exit Reason: ${msg.trade?.reason || 'Market'} | PnL: ${pnlStr}`,
              price: msg.trade?.exit_price,
            });
            setTimeout(() => setBannerAlert(null), 7000);
          } else if (msg.type === 'BREAKEVEN_LOCKED') {
            playRetroSound('select');
            setActiveSignals((prev) =>
              prev.map((s) =>
                s.strategy_id === msg.strategy_id
                  ? { ...s, stop_loss: msg.new_stop_loss, be_active: true }
                  : s
              )
            );
            setSignalNotifications((prev) => [
              {
                id: `notif-${Date.now()}`,
                type: 'BREAKEVEN_LOCKED',
                title: `DYNAMIC BREAKEVEN ENGAGED`,
                strategy: msg.strategy_name || '',
                price: msg.price,
                new_stop_loss: msg.new_stop_loss,
                timestamp: new Date().toLocaleTimeString(),
              },
              ...prev.slice(0, 19),
            ]);
            setBannerAlert({
              title: `DYNAMIC BREAKEVEN ENGAGED!`,
              strategy: `${msg.strategy_name}: Stop Loss advanced to $${Number(msg.new_stop_loss || 0).toLocaleString()} (+0.2% locked)`,
              price: msg.price,
            });
            setTimeout(() => setBannerAlert(null), 5000);
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

  // Switch strategy AND automatically adapt chart timeframe and live ticket
  const handleSelectStrategy = (stratId) => {
    setSelectedStrategyId(stratId);
    const strat = strategies.find((s) => s.id === stratId);
    if (strat?.timeframe) {
      setTimeframe(strat.timeframe.toLowerCase());
    }
    fetch(`${API_BASE}/api/signals/ticket?strategy_id=${stratId}`)
      .then((r) => r.json())
      .then((ticket) => {
        if (ticket) {
          setFloor((prev) => ({ ...prev, signal_ticket: ticket }));
        }
      })
      .catch(() => {});
  };

  // Open strategy detail modal
  const handleOpenDetail = (stratId) => {
    setDetailStrategyId(stratId);
    setIsDetailOpen(true);
  };

  // Dispatch simulated test signal
  const handleSimulateSignal = () => {
    fetch(`${API_BASE}/api/floor/simulate-signal?strategy_id=${selectedStrategyId}`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        const ticket = data.ticket;
        if (ticket) {
          const direction = ticket.direction || 'LONG';
          const action = direction === 'LONG' ? 'BUY' : 'SELL';
          const newSig = {
            id: ticket.strategy_id || `sig-${Date.now()}`,
            strategy_id: ticket.strategy_id,
            strategy_name: ticket.strategy_name,
            timeframe: ticket.timeframe || '1h',
            direction: direction,
            action: action,
            entry_price: ticket.entry_price || ticker.price,
            current_price: ticker.price,
            floating_pnl_pct: 0.0,
            stop_loss: ticket.stop_loss,
            take_profit: ticket.take_profit,
            timestamp: new Date().toLocaleTimeString(),
            status: 'IN_POSITION',
          };
          setActiveSignals((prev) => [newSig, ...prev.filter((s) => s.strategy_id !== newSig.strategy_id)]);
          setSignalNotifications((prev) => [
            {
              id: `notif-${Date.now()}`,
              type: 'NEW_SIGNAL',
              title: `AUTONOMOUS ${action} SIGNAL`,
              strategy: newSig.strategy_name,
              direction: direction,
              price: newSig.entry_price,
              stop_loss: newSig.stop_loss,
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 19),
          ]);
        }
      })
      .catch(() => {
        // Local simulation fallback
        playRetroSound('signal');
        const strat = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];
        const isLong = strat.type === 'LONG';
        const action = isLong ? 'BUY' : 'SELL';
        const newSig = {
          id: strat.id,
          strategy_id: strat.id,
          strategy_name: strat.name,
          timeframe: strat.timeframe,
          direction: strat.type,
          action: action,
          entry_price: ticker.price,
          current_price: ticker.price,
          floating_pnl_pct: 0.0,
          stop_loss: Math.round(ticker.price * (isLong ? 0.92 : 1.05)),
          take_profit: Math.round(ticker.price * (isLong ? 1.75 : 0.88)),
          timestamp: new Date().toLocaleTimeString(),
          status: 'IN_POSITION',
        };
        setActiveSignals((prev) => [newSig, ...prev.filter((s) => s.strategy_id !== newSig.strategy_id)]);
        setSignalNotifications((prev) => [
          {
            id: `notif-${Date.now()}`,
            type: 'NEW_SIGNAL',
            title: `AUTONOMOUS ${action} SIGNAL`,
            strategy: strat.name,
            direction: strat.type,
            price: ticker.price,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 19),
        ]);
        setBannerAlert({
          title: `AUTONOMOUS ${action} SIGNAL DISPATCHED!`,
          strategy: `${strat.name} @ $${Number(ticker.price || 0).toLocaleString()}`,
          price: ticker.price,
        });
        setTimeout(() => setBannerAlert(null), 6000);
      });
  };

  // Close active signal
  const handleCloseSignal = (strategyId) => {
    playRetroSound('alert');
    setActiveSignals((prev) => {
      const sig = prev.find((s) => s.strategy_id === strategyId);
      if (sig) {
        const isBuy = sig.action === 'BUY' || sig.direction === 'LONG';
        const floating = isBuy
          ? ((ticker.price - sig.entry_price) / sig.entry_price) * 100
          : ((sig.entry_price - ticker.price) / sig.entry_price) * 100;
        const pnlStr = `${floating >= 0 ? '+' : ''}${floating.toFixed(2)}%`;
        setSignalNotifications((n) => [
          {
            id: `notif-${Date.now()}`,
            type: 'SIGNAL_EXIT',
            title: `POSITION CLOSED: ${sig.strategy_name}`,
            strategy: sig.strategy_name,
            reason: 'Manual Exit via Bell Menu',
            pnl: pnlStr,
            price: ticker.price,
            timestamp: new Date().toLocaleTimeString(),
          },
          ...n.slice(0, 19),
        ]);
        setBannerAlert({
          title: `POSITION CLOSED: ${sig.strategy_name}`,
          strategy: `Return: ${pnlStr} @ $${Number(ticker.price).toLocaleString()}`,
          price: ticker.price,
        });
        setTimeout(() => setBannerAlert(null), 5000);
      }
      return prev.filter((s) => s.strategy_id !== strategyId);
    });
  };

  // Synchronize top header label with chart's latest candle close if no live WS ticks have arrived recently
  const handlePriceSyncFromChart = (chartPrice) => {
    if (!chartPrice || typeof chartPrice !== 'number') return;
    if (Date.now() - lastWsTickTimeRef.current > 4000) {
      setTicker((prev) => {
        if (!prev.price || Math.abs(prev.price - chartPrice) > 0.01) {
          return { ...prev, price: chartPrice };
        }
        return prev;
      });
    }
  };

  const handleEnterDashboard = (stratId = null) => {
    if (stratId) {
      setSelectedStrategyId(stratId);
    }
    setViewMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (viewMode === 'landing') {
    return (
      <LandingPage
        ticker={ticker}
        status={status}
        floor={floor}
        theme={theme}
        onToggleTheme={toggleTheme}
        onEnterDashboard={handleEnterDashboard}
      />
    );
  }

  const activeStrategyObj = strategies.find((s) => s.id === selectedStrategyId) || strategies[0];

  return (
    <div className="min-h-screen bg-apple-canvas text-apple-text flex flex-col font-sans selection:bg-apple-blue selection:text-white transition-colors duration-200">
      
      {/* Top Navigation Bar */}
      <Header
        ticker={ticker}
        status={status}
        floor={floor}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSimulateSignal={handleSimulateSignal}
        activeSignals={activeSignals}
        notifications={signalNotifications}
        onSelectStrategy={handleSelectStrategy}
        onCloseSignal={handleCloseSignal}
        onClearNotifications={() => setSignalNotifications([])}
        onGoToLanding={() => {
          playRetroSound('select');
          setViewMode('landing');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
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
              <span>Full Platform</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('chart');
              }}
              className={`apple-segmented-item ${activeView === 'chart' ? 'active' : ''}`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Execution Chart</span>
            </button>
            <button
              onClick={() => {
                playRetroSound('select');
                setActiveView('catalog');
              }}
              className={`apple-segmented-item ${activeView === 'catalog' ? 'active' : ''}`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Strategy Directory</span>
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

        {/* Section 1: Quantitative Strategy Selector Strip */}
        {(activeView === 'all' || activeView === 'chart') && (
          <section>
            <StrategyRibbon
              strategies={strategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={handleSelectStrategy}
              onOpenDetail={handleOpenDetail}
              currentBtcPrice={ticker.price}
              floor={floor}
              showDetailsCard={false}
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
              theme={theme}
              floor={floor}
              onPriceSync={handlePriceSyncFromChart}
            />
          </section>
        )}

        {/* Section 3: Selected Strategy Parameter Matrix & Execution Targets */}
        {(activeView === 'all' || activeView === 'chart') && (
          <section>
            <StrategyDetailCard
              activeStrat={activeStrategyObj}
              currentBtcPrice={ticker.price}
              activeSignals={activeSignals}
              floor={floor}
              onOpenDetail={handleOpenDetail}
            />
          </section>
        )}

        {/* Section 3: Algo Strategy Explorer & Preference Matcher */}
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

        {/* Section 4: Leverage & Liquidation Safety Calculator */}
        {(activeView === 'all' || activeView === 'risk') && (
          <section>
            <RiskCalculator 
              currentBtcPrice={ticker.price}
              strategies={strategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={handleSelectStrategy}
            />
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

      {/* Footer */}
      <footer className="border-t border-apple-border bg-apple-surface/60 backdrop-blur-md py-6 px-4 sm:px-6 text-xs text-apple-muted transition-colors duration-200">
        <div className="max-w-[1500px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-apple-green shadow-[0_0_6px_rgba(48,209,88,0.7)]" />
            <span className="font-semibold text-apple-text tracking-tight">Quentra Pro</span>
            <span className="text-apple-dim">/ Quantitative Trading Infrastructure</span>
          </div>
          <div className="flex items-center gap-4 text-apple-dim">
            <span>Developed by i_setyawans - Crypto Algo Enthusiast</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

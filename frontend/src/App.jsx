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
import strategiesDataEth from './data/strategiesData_eth.json';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthModal from './components/AuthModal';

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

function TradingApp() {
  const { isAuthenticated, isLoading, openAuthModal } = useAuth();

  const [selectedAsset, setSelectedAsset] = useState('BTCUSDT');
  const selectedAssetRef = useRef('BTCUSDT');
  useEffect(() => {
    selectedAssetRef.current = selectedAsset;
  }, [selectedAsset]);

  const [tickersMap, setTickersMap] = useState({
    BTCUSDT: {
      symbol: 'BTCUSDT',
      price: 77379.6,
      change_24h_pct: 0.12,
      high_24h: 79890.0,
      low_24h: 76046.58,
      volume_24h: 18905.45,
    },
    ETHUSDT: {
      symbol: 'ETHUSDT',
      price: 2740.05,
      change_24h_pct: 1.25,
      high_24h: 2850.0,
      low_24h: 2680.0,
      volume_24h: 84520.10,
    }
  });

  const [status, setStatus] = useState({
    binance_ws_connected: false,
    ticker_status: 'INITIALIZING',
  });
  const [ticker, setTicker] = useState({
    symbol: 'BTCUSDT',
    price: 77379.6,
    change_24h_pct: 0.12,
    high_24h: 79890.0,
    low_24h: 76046.58,
    volume_24h: 18905.45,
  });
  const [floor, setFloor] = useState(DEFAULT_FLOOR_STATE);
  const [strategies, setStrategies] = useState(strategiesData || []);
  const catalogSymbolRef = useRef('BTCUSDT');
  const [selectedStrategyId, setSelectedStrategyId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlStrat = params.get('strategy') || params.get('algo');
      if (urlStrat && (strategiesData || []).some((s) => s.id === urlStrat)) {
        return urlStrat;
      }
    }
    return 'pippo-1h-enhanced';
  });
  const [timeframe, setTimeframe] = useState('1h');
  
  // Primary View Mode: 'landing' (Product Overview) | 'dashboard' (Execution Platform)
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const p = window.location.pathname;
      if (p.startsWith('/app')) return 'dashboard';
    }
    return 'landing';
  });

  // View Filter Segment: 'all' | 'chart' | 'catalog' | 'risk'
  const [activeView, setActiveView] = useState('all');

  // Modals & Banners
  const [detailStrategyId, setDetailStrategyId] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [bannerAlert, setBannerAlert] = useState(null);

  // Active Working Signals (BUY / SELL) & Notification Events
  const [activeSignals, setActiveSignals] = useState([]);
  const [signalNotifications, setSignalNotifications] = useState([]);
  const activeSignalsRef = useRef([]);
  const signalNotificationsRef = useRef([]);

  const replaceActiveSignals = (nextSignals) => {
    activeSignalsRef.current = nextSignals;
    setActiveSignals(nextSignals);
  };

  const appendSignalNotification = (notification) => {
    const eventKey = notification.event_key || [
      notification.type,
      notification.strategy_id || notification.strategy,
      notification.entry_time || notification.exit_time || notification.timestamp,
    ].join(':');
    setSignalNotifications((previous) => {
      if (previous.some((item) => item.event_key === eventKey)) return previous;
      const next = [{ ...notification, id: eventKey, event_key: eventKey }, ...previous].slice(0, 20);
      signalNotificationsRef.current = next;
      return next;
    });
  };

  activeSignalsRef.current = activeSignals;
  signalNotificationsRef.current = signalNotifications;

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

  // Synchronize URL route with viewMode and handle browser back / forward navigation
  useEffect(() => {
    const syncRouteFromLocation = () => {
      const p = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      const urlStrat = params.get('strategy') || params.get('algo');
      if (urlStrat && (strategiesData || []).some((s) => s.id === urlStrat)) {
        setSelectedStrategyId(urlStrat);
      }
      if (p.startsWith('/app')) {
        if (!isLoading && !isAuthenticated) {
          setViewMode('landing');
          if (window.location.pathname !== '/') {
            window.history.replaceState({ viewMode: 'landing' }, '', '/');
          }
          openAuthModal('/app');
          return;
        }
        setViewMode('dashboard');
        document.title = 'Quentra Pro · Quantitative Trading Terminal';
      } else {
        setViewMode('landing');
        document.title = 'Quentra Pro · Quantitative Algorithmic Platform';
      }
    };

    syncRouteFromLocation();
    window.addEventListener('popstate', syncRouteFromLocation);
    return () => window.removeEventListener('popstate', syncRouteFromLocation);
  }, [isLoading, isAuthenticated, openAuthModal]);

  // Route Protection: Prevent unauthorized terminal access if unauthenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && viewMode === 'dashboard') {
      setViewMode('landing');
      if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
        window.history.replaceState({ viewMode: 'landing' }, '', '/');
      }
      openAuthModal('/app');
    }
  }, [isLoading, isAuthenticated, viewMode, openAuthModal]);

  const toggleTheme = () => {
    playRetroSound('blip');
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const wsRef = useRef(null);
  const directBinanceWsRef = useRef(null);
  const lastWsTickTimeRef = useRef(0);
  const liveRefreshIdRef = useRef(0);
  const selectedStrategyRef = useRef(selectedStrategyId);
  useEffect(() => {
    selectedStrategyRef.current = selectedStrategyId;
  }, [selectedStrategyId]);
  const [liveKline, setLiveKline] = useState(null);

  const refreshLiveState = async (asset, replaceCatalog = true) => {
    const symbol = asset || selectedAssetRef.current;
    const refreshId = ++liveRefreshIdRef.current;
    const [strategiesResult, signalsResult] = await Promise.allSettled([
      replaceCatalog ? fetch(`${API_BASE}/api/strategies?symbol=${symbol}`) : Promise.resolve(null),
      fetch(`${API_BASE}/api/signals/live?symbol=${symbol}`),
    ]);
    const isCurrentRefresh = () => (
      refreshId === liveRefreshIdRef.current && selectedAssetRef.current === symbol
    );

    let catalogApplied = false;
    if (replaceCatalog && strategiesResult.status === 'fulfilled' && strategiesResult.value?.ok && isCurrentRefresh()) {
      try {
        const contentType = strategiesResult.value.headers.get('content-type') || '';
        const catalog = contentType.includes('application/json') ? await strategiesResult.value.json() : null;
        if (isCurrentRefresh() && Array.isArray(catalog) && catalog.length > 0) {
          setStrategies(catalog);
          catalogSymbolRef.current = symbol;
          catalogApplied = true;
          const selected = catalog.find((strategy) => strategy.id === selectedStrategyRef.current) || catalog[0];
          if (selected?.timeframe) setTimeframe(selected.timeframe.toLowerCase());
        }
      } catch (error) {
        catalogApplied = false;
      }
    }
    if (replaceCatalog && isCurrentRefresh() && !catalogApplied && catalogSymbolRef.current !== symbol) {
      // Keep the last authoritative catalog on transient API failures. Only
      // use the matching bundled catalog when this asset has no live catalog.
      const fallbackCatalog = symbol === 'ETHUSDT' ? strategiesDataEth : strategiesData;
      setStrategies(fallbackCatalog);
      catalogSymbolRef.current = symbol;
    }

    const signalsAvailable = signalsResult.status === 'fulfilled' && Boolean(signalsResult.value?.ok);
    if (isCurrentRefresh()) {
      setStatus((prev) => ({ ...prev, signals_available: signalsAvailable }));
    }

    if (signalsAvailable && isCurrentRefresh()) {
      const data = await signalsResult.value.json();
      if (isCurrentRefresh() && Array.isArray(data?.strategies)) {
        const price = data.current_price || (symbol === 'ETHUSDT' ? data.current_eth_price : data.current_btc_price);
        const nextSignals = data.strategies
          .filter((strategy) => strategy.position_status === 'IN_POSITION' || strategy.position_status === 'OPEN')
          .map((strategy) => ({
            id: `${symbol}-${strategy.strategy_id}`,
            asset: symbol,
            strategy_id: strategy.strategy_id,
            strategy_name: strategy.name,
            timeframe: strategy.timeframe,
            direction: strategy.direction,
            action: strategy.direction === 'LONG' ? 'BUY' : 'SELL',
            entry_price: strategy.entry_price || price,
            entry_time: strategy.entry_time,
            current_price: price,
            floating_pnl_pct: strategy.floating_pnl_pct || 0.0,
            stop_loss: strategy.stop_loss,
            be_active: strategy.be_active,
            partial_taken: strategy.partial_taken,
            partial_exit_price: strategy.partial_exit_price,
            take_profit: strategy.take_profit,
            timestamp: strategy.entry_time || new Date().toLocaleTimeString(),
            status: 'IN_POSITION',
          }));

        const previousByStrategy = new Map(
          activeSignalsRef.current
            .filter((signal) => signal.asset === symbol)
            .map((signal) => [signal.strategy_id, signal])
        );
        const nextByStrategy = new Map(nextSignals.map((signal) => [signal.strategy_id, signal]));

        nextSignals.forEach((signal) => {
          const previous = previousByStrategy.get(signal.strategy_id);
          const isNewEntry = !previous || (
            signal.entry_time && previous.entry_time && signal.entry_time !== previous.entry_time
          );
          if (isNewEntry) {
            appendSignalNotification({
              type: 'NEW_SIGNAL',
              title: previous ? `NEW ENTRY: ${signal.action} SIGNAL` : `ACTIVE ENTRY RECOVERED: ${signal.action}`,
              strategy: signal.strategy_name,
              strategy_id: signal.strategy_id,
              direction: signal.direction,
              price: signal.entry_price,
              stop_loss: signal.stop_loss,
              entry_time: signal.entry_time,
              timestamp: new Date().toLocaleTimeString(),
              event_key: `NEW_SIGNAL:${symbol}:${signal.strategy_id}:${signal.entry_time || signal.entry_price}`,
            });
          }
        });

        // If a WebSocket exit was missed, reconcile it from the authoritative
        // telemetry snapshot so the notification history still catches up.
        previousByStrategy.forEach((previous, strategyId) => {
          const next = nextByStrategy.get(strategyId);
          const entryChanged = Boolean(
            next?.entry_time && previous.entry_time && next.entry_time !== previous.entry_time
          );
          if (next && !entryChanged) return;
          const strategy = data.strategies.find((item) => item.strategy_id === strategyId);
          const closed = strategy?.last_closed_trade;
          if (!closed) return;
          appendSignalNotification({
            type: 'SIGNAL_EXIT',
            title: `POSITION CLOSED: ${previous.strategy_name}`,
            strategy: previous.strategy_name,
            strategy_id: strategyId,
            reason: closed.reason || closed.exit_reason || 'Market Exit',
            pnl: closed.net_return_pct !== undefined
              ? `${closed.net_return_pct > 0 ? '+' : ''}${closed.net_return_pct}%`
              : '',
            price: closed.exit_price,
            exit_time: closed.exit_time,
            timestamp: new Date().toLocaleTimeString(),
            event_key: `SIGNAL_EXIT:${symbol}:${strategyId}:${closed.exit_time || closed.trade_no || closed.exit_price}`,
          });
        });

        replaceActiveSignals([
          ...activeSignalsRef.current.filter((signal) => signal.asset !== symbol),
          ...nextSignals,
        ]);
      }
    }
  };

  // 1. Fetch initial platform data with automatic fallbacks
  useEffect(() => {
    // Status
    fetch(`${API_BASE}/api/status`)
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (data.latest_btc_price && selectedAssetRef.current === 'BTCUSDT') {
          setTicker((prev) => ({ ...prev, symbol: 'BTCUSDT', price: data.latest_btc_price }));
        } else if (data.latest_eth_price && selectedAssetRef.current === 'ETHUSDT') {
          setTicker((prev) => ({ ...prev, symbol: 'ETHUSDT', price: data.latest_eth_price }));
        }
        if (data.tickers) {
          setTickersMap((prev) => ({ ...prev, ...data.tickers }));
        }
      })
      .catch(() => {
        // Edge mode: direct stream active
      });

    // Ticker
    const curAsset = selectedAssetRef.current;
    fetch(`${API_BASE}/api/ticker?symbol=${curAsset}`)
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (r.ok && ct.includes('application/json')) return r.json();
        throw new Error('Not JSON');
      })
      .then((data) => {
        if (data && data.price && (data.symbol === selectedAssetRef.current || !data.symbol)) {
          setTicker(data);
          setTickersMap((prev) => ({ ...prev, [data.symbol || curAsset]: data }));
        }
      })
      .catch(() => {
        // Direct Bybit public ticker fallback (accessible worldwide)
        fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${curAsset}`)
          .then((r) => r.json())
          .then((data) => {
            const item = data?.result?.list?.[0];
            if (item) {
              const curPrice = parseFloat(item.lastPrice);
              const prevPrice = parseFloat(item.prevPrice24h || item.lastPrice);
              const changePct = prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : 0;
              const tData = {
                symbol: curAsset,
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(item.highPrice24h || curPrice),
                low_24h: parseFloat(item.lowPrice24h || curPrice),
                volume_24h: parseFloat(item.volume24h || 0),
              };
              setTicker(tData);
              setTickersMap((prev) => ({ ...prev, [curAsset]: tData }));
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

    refreshLiveState(selectedAssetRef.current);

    // Periodic ticker sync: only query edge /api/ticker as fallback if no live WebSocket tick in the last 4s
    const tickerPollInterval = setInterval(() => {
      if (Date.now() - lastWsTickTimeRef.current < 4000) {
        return; // WebSocket is actively streaming real-time ticks
      }
      const curAsset = selectedAssetRef.current;
      fetch(`${API_BASE}/api/ticker?symbol=${curAsset}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.price && typeof data.price === 'number') {
            // Defensive guard: reject mismatched ticker
            if (data.symbol && data.symbol !== curAsset) return;
            if (curAsset === 'ETHUSDT' && data.price > 20000) return;
            if (curAsset === 'BTCUSDT' && data.price < 20000) return;

            setTicker((prev) => {
              if (prev.price !== data.price) return { ...prev, ...data, symbol: curAsset };
              return prev;
            });
            setTickersMap((prev) => ({ ...prev, [curAsset]: { ...data, symbol: curAsset } }));
          }
        })
        .catch(() => {});
    }, 3000);

    // Periodic authoritative signal sync repairs missed WebSocket events and
    // keeps the UI aligned with backend state after reconnects or tab sleep.
    const liveStateSyncInterval = setInterval(() => {
      refreshLiveState(selectedAssetRef.current, false);
    }, 15000);

    return () => {
      clearInterval(tickerPollInterval);
      clearInterval(liveStateSyncInterval);
    };
  }, []);

  // 2. Establish WebSocket connection to backend or fallback to Binance Direct
  useEffect(() => {
    let reconnectTimeout = null;
    let fallbackTimeout = null;

    function connectDirectBybit() {
      try {
        const bybitWs = new WebSocket('wss://stream.bybit.com/v5/public/spot');
        bybitWs.onopen = () => {
          bybitWs.send(JSON.stringify({ op: 'subscribe', args: ['tickers.BTCUSDT', 'tickers.ETHUSDT'] }));
          setStatus((prev) => ({ ...prev, binance_ws_connected: true, ticker_status: 'BYBIT_LIVE' }));
        };
        bybitWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.topic && msg.topic.startsWith('tickers.') && msg.data) {
              const sym = msg.topic.includes('ETH') ? 'ETHUSDT' : 'BTCUSDT';
              const d = msg.data;
              const curPrice = parseFloat(d.lastPrice);
              const prevPrice = parseFloat(d.prevPrice24h || d.lastPrice);
              const changePct = prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : 0;
              const tData = {
                symbol: sym,
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(d.highPrice24h || curPrice),
                low_24h: parseFloat(d.lowPrice24h || curPrice),
                volume_24h: parseFloat(d.volume24h || 0),
              };
              setTickersMap((prev) => ({ ...prev, [sym]: tData }));
              if (sym === selectedAssetRef.current) {
                lastWsTickTimeRef.current = Date.now();
                setTicker(tData);
              }
            }
          } catch (e) {}
        };
      } catch (e) {}
    }

    function connectDirectBinance() {
      if (directBinanceWsRef.current) return;
      try {
        const binanceWs = new WebSocket('wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker');
        directBinanceWsRef.current = binanceWs;

        binanceWs.onopen = () => {
          setStatus((prev) => ({ ...prev, binance_ws_connected: true, ticker_status: 'DIRECT_LIVE' }));
        };

        binanceWs.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            const stream = parsed.stream || '';
            const data = parsed.data || parsed;
            if (data.c) {
              const sym = stream.startsWith('eth') || data.s === 'ETHUSDT' ? 'ETHUSDT' : 'BTCUSDT';
              const curPrice = parseFloat(data.c);
              const openPrice = parseFloat(data.o || data.c);
              const changePct = openPrice > 0 ? ((curPrice - openPrice) / openPrice) * 100 : 0;
              const tData = {
                symbol: sym,
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(data.h || curPrice),
                low_24h: parseFloat(data.l || curPrice),
                volume_24h: parseFloat(data.v || 0),
              };
              setTickersMap((prev) => ({ ...prev, [sym]: tData }));
              if (sym === selectedAssetRef.current) {
                lastWsTickTimeRef.current = Date.now();
                setTicker(tData);
              }
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
        // Reconcile state after every reconnect in case a signal event was
        // emitted while this browser was offline.
        refreshLiveState(selectedAssetRef.current, true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TICKER') {
            const sym = msg.symbol || msg.data?.symbol || 'BTCUSDT';
            if (msg.data) {
              setTickersMap((prev) => ({ ...prev, [sym]: msg.data }));
            }
            if (sym === selectedAssetRef.current) {
              lastWsTickTimeRef.current = Date.now();
              setTicker(msg.data);
            }
          } else if (msg.type === 'SNAPSHOT') {
            if (msg.tickers) {
              setTickersMap((prev) => ({ ...prev, ...msg.tickers }));
              const curSym = selectedAssetRef.current;
              if (msg.tickers[curSym] && msg.tickers[curSym].price) {
                lastWsTickTimeRef.current = Date.now();
                setTicker(msg.tickers[curSym]);
              }
            } else if (msg.ticker && msg.ticker.price && selectedAssetRef.current === 'BTCUSDT') {
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
          } else if (msg.type === 'KLINE') {
            if (msg.symbol === selectedAssetRef.current && msg.candle) {
              setLiveKline({ ...msg, asset: msg.symbol });
            }
          } else if (msg.type === 'NEW_SIGNAL') {
            playRetroSound('signal');
            const asset = msg.asset || msg.ticket?.asset || 'BTCUSDT';
            const direction = msg.ticket?.direction || 'LONG';
            const action = direction === 'LONG' ? 'BUY' : 'SELL';
            const sigId = msg.ticket?.strategy_id || `sig-${Date.now()}`;
            const newSig = {
              id: `${asset}-${sigId}`,
              asset,
              strategy_id: msg.ticket?.strategy_id,
              strategy_name: msg.ticket?.strategy_name || 'Autonomous Strategy',
              timeframe: msg.ticket?.timeframe || '1h',
              direction: direction,
              action: action,
              entry_price: msg.ticket?.entry_price || msg.ticket?.current_price,
              current_price: msg.ticket?.current_price || msg.ticket?.entry_price,
              entry_time: msg.ticket?.entry_time || msg.candle_time,
              floating_pnl_pct: 0.0,
              stop_loss: msg.ticket?.stop_loss,
              be_active: msg.ticket?.be_active || false,
              partial_taken: msg.ticket?.partial_taken || false,
              partial_take_profit: msg.ticket?.partial_take_profit,
              take_profit: msg.ticket?.take_profit,
              timestamp: new Date().toLocaleTimeString(),
              status: 'IN_POSITION',
            };
            if (asset === selectedAssetRef.current) {
              replaceActiveSignals([
                newSig,
                ...activeSignalsRef.current.filter((s) => s.strategy_id !== newSig.strategy_id || s.asset !== asset),
              ]);
              refreshLiveState(asset);
            }
            appendSignalNotification({
              type: 'NEW_SIGNAL',
              title: `AUTONOMOUS ${action} SIGNAL`,
              strategy: newSig.strategy_name,
              strategy_id: newSig.strategy_id,
              direction,
              price: newSig.entry_price,
              stop_loss: newSig.stop_loss,
              entry_time: newSig.entry_time,
              timestamp: new Date().toLocaleTimeString(),
              event_key: `NEW_SIGNAL:${asset}:${newSig.strategy_id}:${newSig.entry_time || newSig.entry_price}`,
            });
            setBannerAlert({
              title: `AUTONOMOUS ${direction} SIGNAL DISPATCHED!`,
              strategy: `${msg.ticket?.strategy_name} @ $${Number(msg.ticket?.entry_price || 0).toLocaleString()} (SL: $${Number(msg.ticket?.stop_loss || 0).toLocaleString()})`,
              price: msg.ticket?.entry_price,
            });
            setTimeout(() => setBannerAlert(null), 7000);
          } else if (msg.type === 'PARTIAL_TAKE_PROFIT') {
            const asset = msg.asset || 'BTCUSDT';
            if (asset === selectedAssetRef.current && msg.strategy_id) {
              replaceActiveSignals(
                activeSignalsRef.current.map((s) =>
                  s.strategy_id === msg.strategy_id
                    ? {
                        ...s,
                        stop_loss: msg.new_stop_loss,
                        be_active: Boolean(msg.be_locked),
                        partial_taken: true,
                        partial_pct: msg.partial_pct,
                      }
                    : s
                )
              );
              refreshLiveState(asset, false);
            }
            appendSignalNotification({
              type: 'PARTIAL_TAKE_PROFIT',
              title: `PARTIAL TAKE PROFIT: ${msg.strategy_name || ''}`,
              strategy: msg.strategy_name || '',
              strategy_id: msg.strategy_id,
              price: msg.price,
              partial_pct: msg.partial_pct,
              new_stop_loss: msg.new_stop_loss,
              timestamp: new Date().toLocaleTimeString(),
              event_key: `PARTIAL_TAKE_PROFIT:${asset}:${msg.strategy_id}:${msg.price || msg.timestamp || Date.now()}`,
            });
          } else if (msg.type === 'POSITION_CLOSED') {
            // Protection exits emit POSITION_CLOSED followed by SIGNAL_EXIT.
            // Reconcile immediately without creating a duplicate notification;
            // SIGNAL_EXIT remains the user-facing event.
            const asset = msg.asset || msg.trade?.asset || 'BTCUSDT';
            if (msg.strategy_id && asset === selectedAssetRef.current) {
              replaceActiveSignals(activeSignalsRef.current.filter((s) => s.strategy_id !== msg.strategy_id || s.asset !== asset));
              refreshLiveState(asset, false);
            }
          } else if (msg.type === 'SIGNAL_EXIT') {
            playRetroSound('alert');
            const asset = msg.asset || 'BTCUSDT';
            const pnl = msg.trade?.net_return_pct;
            const pnlStr = pnl !== undefined ? `${pnl > 0 ? '+' : ''}${pnl}%` : '';
            if (msg.strategy_id && asset === selectedAssetRef.current) {
              replaceActiveSignals(activeSignalsRef.current.filter((s) => s.strategy_id !== msg.strategy_id || s.asset !== asset));
              refreshLiveState(asset);
            }
            appendSignalNotification({
              type: 'SIGNAL_EXIT',
              title: `POSITION CLOSED: ${msg.strategy_name || ''}`,
              strategy: msg.strategy_name || '',
              strategy_id: msg.strategy_id,
              reason: msg.trade?.reason || 'Market Exit',
              pnl: pnlStr,
              price: msg.trade?.exit_price,
              exit_time: msg.trade?.exit_time || msg.candle_time,
              timestamp: new Date().toLocaleTimeString(),
              event_key: `SIGNAL_EXIT:${asset}:${msg.strategy_id}:${msg.trade?.exit_time || msg.trade?.trade_no || msg.trade?.exit_price}`,
            });
            setBannerAlert({
              title: `AUTONOMOUS POSITION CLOSED: ${msg.strategy_name || ''}`,
              strategy: `Exit Reason: ${msg.trade?.reason || 'Market'} | PnL: ${pnlStr}`,
              price: msg.trade?.exit_price,
            });
            setTimeout(() => setBannerAlert(null), 7000);
          } else if (msg.type === 'BREAKEVEN_LOCKED') {
            playRetroSound('select');
            const asset = msg.asset || 'BTCUSDT';
            if (asset === selectedAssetRef.current) {
              replaceActiveSignals(
                activeSignalsRef.current.map((s) =>
                  s.strategy_id === msg.strategy_id
                    ? { ...s, stop_loss: msg.new_stop_loss, be_active: true }
                    : s
                )
              );
              refreshLiveState(asset);
            }
            appendSignalNotification({
              type: 'BREAKEVEN_LOCKED',
              title: `DYNAMIC BREAKEVEN ENGAGED`,
              strategy: msg.strategy_name || '',
              strategy_id: msg.strategy_id,
              price: msg.price,
              new_stop_loss: msg.new_stop_loss,
              timestamp: new Date().toLocaleTimeString(),
              event_key: `BREAKEVEN_LOCKED:${asset}:${msg.strategy_id}:${msg.price || msg.timestamp || Date.now()}`,
            });
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

  // 1-Click Asset Switcher (BTC / ETH)
  const handleSelectAsset = (newAsset) => {
    if (newAsset === selectedAsset) return;
    playRetroSound('select');
    setSelectedAsset(newAsset);
    selectedAssetRef.current = newAsset;
    replaceActiveSignals([]);

    // Instantly update active ticker from map to eliminate lag or set clean baseline
    if (tickersMap[newAsset] && tickersMap[newAsset].price > 0) {
      setTicker(tickersMap[newAsset]);
    } else {
      const fallbackTicker = {
        symbol: newAsset,
        price: newAsset === 'ETHUSDT' ? 2645.20 : 77379.6,
        change_24h_pct: 0.0,
        high_24h: newAsset === 'ETHUSDT' ? 2850.0 : 79890.0,
        low_24h: newAsset === 'ETHUSDT' ? 2600.0 : 76046.58,
        volume_24h: newAsset === 'ETHUSDT' ? 84520.10 : 18905.45,
      };
      setTicker(fallbackTicker);
      setTickersMap((prev) => ({ ...prev, [newAsset]: fallbackTicker }));
    }

    refreshLiveState(newAsset);

    // Fetch latest ticker for this asset
    fetch(`${API_BASE}/api/ticker?symbol=${newAsset}`)
      .then((r) => r.json())
      .then((t) => {
        if (t && t.price && t.price > 0 && selectedAssetRef.current === newAsset) {
          if (t.symbol && t.symbol !== newAsset) return;
          if (newAsset === 'ETHUSDT' && t.price > 20000) return;
          if (newAsset === 'BTCUSDT' && t.price < 20000) return;
          setTicker({ ...t, symbol: newAsset });
          setTickersMap((prev) => ({ ...prev, [newAsset]: { ...t, symbol: newAsset } }));
        }
      })
      .catch(() => {
        // Fallback to Bybit public spot REST ticker
        fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${newAsset}`)
          .then((r) => r.json())
          .then((data) => {
            const item = data?.result?.list?.[0];
            if (item && selectedAssetRef.current === newAsset) {
              const curPrice = parseFloat(item.lastPrice);
              const prevPrice = parseFloat(item.prevPrice24h || item.lastPrice);
              const changePct = prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : 0;
              const tData = {
                symbol: newAsset,
                price: curPrice,
                change_24h_pct: changePct,
                high_24h: parseFloat(item.highPrice24h || curPrice),
                low_24h: parseFloat(item.lowPrice24h || curPrice),
                volume_24h: parseFloat(item.volume24h || 0),
              };
              setTicker(tData);
              setTickersMap((prev) => ({ ...prev, [newAsset]: tData }));
            }
          })
          .catch(() => {});
      });
  };

  // Switch strategy AND automatically adapt chart timeframe and live ticket
  const handleSelectStrategy = (stratId) => {
    setSelectedStrategyId(stratId);
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/app')) {
      const newUrl = `/app?strategy=${encodeURIComponent(stratId)}`;
      window.history.replaceState({ viewMode: 'dashboard', strategyId: stratId }, '', newUrl);
    }
    const strat = strategies.find((s) => s.id === stratId);
    if (strat?.timeframe) {
      setTimeframe(strat.timeframe.toLowerCase());
    }
    fetch(`${API_BASE}/api/signals/ticket?strategy_id=${stratId}&symbol=${selectedAssetRef.current}`)
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
    fetch(`${API_BASE}/api/floor/simulate-signal?strategy_id=${selectedStrategyId}&symbol=${selectedAssetRef.current}`, { method: 'POST' })
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
            entry_time: ticket.entry_time,
            timestamp: new Date().toLocaleTimeString(),
            status: 'IN_POSITION',
          };
          replaceActiveSignals([newSig, ...activeSignalsRef.current.filter((s) => s.strategy_id !== newSig.strategy_id)]);
          appendSignalNotification({
            type: 'NEW_SIGNAL',
            title: `AUTONOMOUS ${action} SIGNAL`,
            strategy: newSig.strategy_name,
            strategy_id: newSig.strategy_id,
            direction,
            price: newSig.entry_price,
            stop_loss: newSig.stop_loss,
            entry_time: newSig.entry_time,
            timestamp: new Date().toLocaleTimeString(),
            event_key: `NEW_SIGNAL:${selectedAssetRef.current}:${newSig.strategy_id}:${newSig.entry_time || newSig.entry_price}`,
          });
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
        replaceActiveSignals([newSig, ...activeSignalsRef.current.filter((s) => s.strategy_id !== newSig.strategy_id)]);
        appendSignalNotification({
          type: 'NEW_SIGNAL',
          title: `AUTONOMOUS ${action} SIGNAL`,
          strategy: strat.name,
          strategy_id: strat.id,
          direction: strat.type,
          price: ticker.price,
          timestamp: new Date().toLocaleTimeString(),
          event_key: `NEW_SIGNAL:${selectedAssetRef.current}:${strat.id}:${ticker.price}`,
        });
        setBannerAlert({
          title: `AUTONOMOUS ${action} SIGNAL DISPATCHED!`,
          strategy: `${strat.name} @ $${Number(ticker.price || 0).toLocaleString()}`,
          price: ticker.price,
        });
        setTimeout(() => setBannerAlert(null), 6000);
      });
  };

  // Close active signal
  const handleCloseSignal = async (strategyId) => {
    playRetroSound('alert');
    try {
      const response = await fetch(`${API_BASE}/api/signals/close?strategy_id=${encodeURIComponent(strategyId)}&symbol=${selectedAssetRef.current}`, { method: 'POST' });
      if (!response.ok) throw new Error('Close request failed');
      await refreshLiveState(selectedAssetRef.current);
    } catch (error) {
      return;
    }
    const sig = activeSignalsRef.current.find((s) => s.strategy_id === strategyId);
    if (sig) {
      const isBuy = sig.action === 'BUY' || sig.direction === 'LONG';
      const floating = isBuy
        ? ((ticker.price - sig.entry_price) / sig.entry_price) * 100
        : ((sig.entry_price - ticker.price) / sig.entry_price) * 100;
      const pnlStr = `${floating >= 0 ? '+' : ''}${floating.toFixed(2)}%`;
      appendSignalNotification({
        type: 'SIGNAL_EXIT',
        title: `POSITION CLOSED: ${sig.strategy_name}`,
        strategy: sig.strategy_name,
        strategy_id: strategyId,
        reason: 'Manual Exit via Bell Menu',
        pnl: pnlStr,
        price: ticker.price,
        timestamp: new Date().toLocaleTimeString(),
        event_key: `SIGNAL_EXIT:${selectedAssetRef.current}:${strategyId}:manual-${Date.now()}`,
      });
      setBannerAlert({
        title: `POSITION CLOSED: ${sig.strategy_name}`,
        strategy: `Return: ${pnlStr} @ $${Number(ticker.price).toLocaleString()}`,
        price: ticker.price,
      });
      setTimeout(() => setBannerAlert(null), 5000);
    }
    replaceActiveSignals(activeSignalsRef.current.filter((s) => s.strategy_id !== strategyId));
  };

  // Synchronize top header label with chart's latest candle close if no live WS ticks have arrived recently
  const handlePriceSyncFromChart = (chartPrice, chartSymbol) => {
    if (!chartPrice || typeof chartPrice !== 'number') return;
    if (chartSymbol && chartSymbol !== selectedAssetRef.current) return;
    if (Date.now() - lastWsTickTimeRef.current > 4000) {
      setTicker((prev) => {
        if (!prev.price || Math.abs(prev.price - chartPrice) > 0.01) {
          return { ...prev, symbol: chartSymbol || selectedAssetRef.current, price: chartPrice };
        }
        return prev;
      });
    }
  };

  const handleEnterDashboard = (stratIdOrTarget = null) => {
    let stratId = null;
    if (typeof stratIdOrTarget === 'string') {
      if (stratIdOrTarget.includes('strategy=')) {
        const match = stratIdOrTarget.match(/strategy=([^&]+)/);
        if (match) stratId = decodeURIComponent(match[1]);
      } else if (!stratIdOrTarget.startsWith('/')) {
        stratId = stratIdOrTarget;
      }
    }
    const targetStrat = stratId || selectedStrategyId;
    if (stratId) {
      setSelectedStrategyId(stratId);
    }
    const query = stratId ? `?strategy=${encodeURIComponent(stratId)}` : '';
    const newUrl = `/app${query}`;
    if (typeof window !== 'undefined' && (window.location.pathname !== '/app' || window.location.search !== query)) {
      window.history.pushState({ viewMode: 'dashboard', strategyId: targetStrat }, '', newUrl);
    }
    document.title = 'Quentra Pro · Quantitative Trading Terminal';
    setViewMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoToLanding = () => {
    playRetroSound('select');
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState({ viewMode: 'landing' }, '', '/');
    }
    document.title = 'Quentra Pro · Quantitative Algorithmic Platform';
    setViewMode('landing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Loading state when user directly loads /app while session is validating
  if (viewMode === 'dashboard' && isLoading) {
    return (
      <div className="min-h-screen bg-apple-canvas flex flex-col items-center justify-center text-apple-text">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-apple-blue/15 border border-apple-blue/30 flex items-center justify-center animate-pulse">
            <span className="text-apple-blue font-bold text-sm">Q</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-apple-muted font-medium">
            <span className="w-2 h-2 rounded-full bg-apple-blue animate-ping" />
            <span>Memverifikasi sesi trading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'landing') {
    return (
      <>
        <LandingPage
          ticker={ticker}
          status={status}
          floor={floor}
          theme={theme}
          onToggleTheme={toggleTheme}
          onEnterDashboard={handleEnterDashboard}
        />
        <AuthModal onSuccess={(target) => handleEnterDashboard(target)} />
      </>
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
        onClearNotifications={() => {
          signalNotificationsRef.current = [];
          setSignalNotifications([]);
        }}
        onGoToLanding={handleGoToLanding}
        selectedAsset={selectedAsset}
        onSelectAsset={handleSelectAsset}
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
            Ground truth {selectedAsset === 'ETHUSDT' ? 'ETH' : 'BTC'} backtest data: 2020-2026
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
              selectedAsset={selectedAsset}
            />
          </section>
        )}

        {/* Section 2: Interactive Candlestick Chart with Strategy Markers Overlay */}
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
              activeSignals={activeSignals}
              symbol={selectedAsset}
              liveKline={liveKline}
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
              selectedAsset={selectedAsset}
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
              selectedAsset={selectedAsset}
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
        selectedAsset={selectedAsset}
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

      {/* Auth Modal for Re-Authentication or Session Expiration */}
      <AuthModal onSuccess={(target) => handleEnterDashboard(target)} />

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TradingApp />
    </AuthProvider>
  );
}

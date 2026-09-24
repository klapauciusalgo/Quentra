/**
 * Quentra Edge Worker
 * Serves frontend static assets with SPA routing.
 * Automatically handles /api/klines, /api/ticker, /api/strategies, and edge routing
 * with full multi-asset (BTCUSDT & ETHUSDT) support.
 */

import strategiesData from './frontend/src/data/strategiesData.json';
import strategiesDataEth from './frontend/src/data/strategiesData_eth.json';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function calculateMAs(candles, period) {
  const result = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result[i] = parseFloat((sum / period).toFixed(2));
    }
  }
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Route real-time API and WebSocket traffic to the autonomous backend when
    // a production origin is configured. Keep the complete backend response so
    // API errors and WebSocket upgrades are never replaced by stale edge data.
    if (env && env.BACKEND_URL && (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws'))) {
      try {
        const target = new URL(env.BACKEND_URL);
        target.pathname = url.pathname;
        target.search = url.search;
        return await fetch(new Request(target.toString(), request));
      } catch (err) {
        console.error('Proxy to backend failed:', err);
        if (
          url.pathname.startsWith('/api/signals/') ||
          url.pathname === '/api/klines' ||
          url.pathname.startsWith('/ws')
        ) {
          return new Response(JSON.stringify({
            error: 'Local data backend is unavailable',
            code: 'BACKEND_UNAVAILABLE',
          }), { status: 503, headers: CORS_HEADERS });
        }
      }
    }

    // Chart history is authoritative in the local parquet backend. Never
    // silently replace it with Binance/Bybit candles at the edge.
    if (url.pathname === '/api/klines' && !(env && env.BACKEND_URL)) {
      return new Response(JSON.stringify({
        error: 'Local chart data backend is not configured',
        code: 'LOCAL_DATA_BACKEND_REQUIRED',
      }), { status: 503, headers: CORS_HEADERS });
    }

    // Never let a WebSocket request fall through to the SPA asset handler.
    // A successful HTML response looks like a connected endpoint to some
    // clients but can never deliver autonomous signal events.
    if (url.pathname.startsWith('/ws')) {
      return new Response(JSON.stringify({
        error: 'Live signal WebSocket backend is not configured',
        code: 'BACKEND_UNAVAILABLE',
      }), { status: 503, headers: CORS_HEADERS });
    }

    // 2. Edge handler: /api/status
    if (url.pathname === '/api/status') {
      return new Response(JSON.stringify({
        status: "EDGE_ONLY",
        service: "Quentra Platform (Edge Cache)",
        binance_ws_connected: false,
        ticker_status: "EDGE_FALLBACK",
        signals_available: false,
        supported_assets: ["BTCUSDT", "ETHUSDT"],
        strategies_count: strategiesData.length,
        strategies_count_eth: strategiesDataEth.length,
      }), { headers: CORS_HEADERS });
    }

    // 3. Edge handler: /api/floor
    if (url.pathname === '/api/floor') {
      return new Response(JSON.stringify({
        market_regime: {
          status: 'MACRO_DISCOUNT',
          weekly_ma55: 82654,
          distance_pct: -6.5,
          summary: 'Weekly Close vs MA55 Macro Horizon',
        },
        eth_market_regime: {
          status: 'BULLISH_RECOVERY',
          weekly_ma55: 2648.68,
          distance_pct: -0.1,
          summary: 'ETH Weekly Close vs MA55 Macro Horizon',
        },
        session: {
          name: 'London / New York Overlap (Peak Volume)',
          active: true,
          code: 'LDN_NY',
        },
      }), { headers: CORS_HEADERS });
    }

    // 4. Edge handler: /api/strategies
    if (url.pathname === '/api/strategies') {
      const sym = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
      const catalog = sym === 'ETHUSDT' ? strategiesDataEth : strategiesData;
      return new Response(JSON.stringify(catalog), { headers: CORS_HEADERS });
    }

    if (url.pathname.startsWith('/api/strategies/')) {
      const stratId = url.pathname.replace('/api/strategies/', '').trim();
      const sym = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
      const catalog = sym === 'ETHUSDT' ? strategiesDataEth : strategiesData;
      const found = catalog.find((s) => s.id === stratId);
      if (found) {
        return new Response(JSON.stringify(found), { headers: CORS_HEADERS });
      }
      return new Response(JSON.stringify({ error: `Strategy ${stratId} not found` }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    // 5. Edge handler: /api/ticker (Multi-asset resilient live price aggregator)
    if (url.pathname === '/api/ticker') {
      const sym = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
      const okxInst = sym === 'ETHUSDT' ? 'ETH-USDT' : 'BTC-USDT';
      const defaultPrice = sym === 'ETHUSDT' ? 2645.20 : 77379.6;

      // Tier 1: Bybit public spot ticker (Ultra-reliable from Cloudflare Anycast edge, never geo-blocked)
      try {
        const bybitRes = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${sym}`);
        if (bybitRes.ok) {
          const b = await bybitRes.json();
          const item = b?.result?.list?.[0];
          if (item && item.lastPrice) {
            const curPrice = parseFloat(item.lastPrice);
            const prevPrice = parseFloat(item.prevPrice24h || item.lastPrice);
            const changePct = prevPrice > 0 ? ((curPrice - prevPrice) / prevPrice) * 100 : 0;
            return new Response(JSON.stringify({
              symbol: sym,
              price: curPrice,
              change_24h_pct: changePct,
              high_24h: parseFloat(item.highPrice24h || curPrice),
              low_24h: parseFloat(item.lowPrice24h || curPrice),
              volume_24h: parseFloat(item.volume24h || 0),
              status: 'LIVE',
            }), { headers: CORS_HEADERS });
          }
        }
      } catch (err) {}

      // Tier 2: OKX public spot ticker fallback
      try {
        const okxRes = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okxInst}`);
        if (okxRes.ok) {
          const o = await okxRes.json();
          const item = o?.data?.[0];
          if (item && item.last) {
            const curPrice = parseFloat(item.last);
            const open24h = parseFloat(item.open24h || item.last);
            const changePct = open24h > 0 ? ((curPrice - open24h) / open24h) * 100 : 0;
            return new Response(JSON.stringify({
              symbol: sym,
              price: curPrice,
              change_24h_pct: changePct,
              high_24h: parseFloat(item.high24h || curPrice),
              low_24h: parseFloat(item.low24h || curPrice),
              volume_24h: parseFloat(item.vol24h || 0),
              status: 'LIVE',
            }), { headers: CORS_HEADERS });
          }
        }
      } catch (err) {}

      // Tier 3: Binance public ticker
      try {
        const binanceRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`);
        if (binanceRes.ok) {
          const t = await binanceRes.json();
          if (t && t.lastPrice) {
            return new Response(JSON.stringify({
              symbol: sym,
              price: parseFloat(t.lastPrice),
              change_24h_pct: parseFloat(t.priceChangePercent),
              high_24h: parseFloat(t.highPrice),
              low_24h: parseFloat(t.lowPrice),
              volume_24h: parseFloat(t.volume),
              status: 'LIVE',
            }), { headers: CORS_HEADERS });
          }
        }
      } catch (err) {}

      // Tier 4: Bybit latest 1m kline fallback
      try {
        const klineRes = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${sym}&interval=1&limit=1`);
        if (klineRes.ok) {
          const k = await klineRes.json();
          const bar = k?.result?.list?.[0];
          if (bar && bar[4]) {
            const curPrice = parseFloat(bar[4]);
            return new Response(JSON.stringify({
              symbol: sym,
              price: curPrice,
              change_24h_pct: 0.0,
              high_24h: parseFloat(bar[2] || curPrice),
              low_24h: parseFloat(bar[3] || curPrice),
              volume_24h: parseFloat(bar[5] || 0),
              status: 'LIVE',
            }), { headers: CORS_HEADERS });
          }
        }
      } catch (err) {}

      return new Response(JSON.stringify({
        symbol: sym,
        price: defaultPrice,
        change_24h_pct: 0.0,
        status: 'STANDBY',
      }), { headers: CORS_HEADERS });
    }

    // Signal APIs require the autonomous backend. Returning a static response
    // here would make the UI look live while silently hiding signal events.
    if (url.pathname.startsWith('/api/signals/')) {
      return new Response(JSON.stringify({
        error: 'Live signal backend is not configured',
        code: 'BACKEND_UNAVAILABLE',
      }), { status: 503, headers: CORS_HEADERS });
    }

    // 7. Block any other /api/* from returning index.html
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: CORS_HEADERS,
      });
    }

    // 8. Serve frontend static assets (SPA routing handled via ASSETS binding)
    return env.ASSETS.fetch(request);
  }
};

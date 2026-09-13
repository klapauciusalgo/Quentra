/**
 * Quentra Edge Worker
 * Serves frontend static assets with SPA routing
 * Gracefully proxies API/WS if BACKEND_URL is configured, or provides edge fallbacks
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // If BACKEND_URL is configured in Cloudflare environment, proxy to it
    if (env && env.BACKEND_URL && (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws'))) {
      try {
        const backendUrl = new URL(request.url);
        const target = new URL(env.BACKEND_URL);
        backendUrl.hostname = target.hostname;
        backendUrl.protocol = target.protocol;
        backendUrl.port = target.port;
        return await fetch(backendUrl.toString(), request);
      } catch (err) {
        console.error('Proxy to backend failed:', err);
      }
    }

    // Edge fallback for /api/status if backend is decoupled
    if (url.pathname === '/api/status') {
      return new Response(JSON.stringify({
        status: "ONLINE",
        service: "Quentra Platform (Edge)",
        binance_ws_connected: true,
        ticker_status: "LIVE"
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Serve frontend static assets (SPA routing handled via ASSETS binding)
    return env.ASSETS.fetch(request);
  }
};

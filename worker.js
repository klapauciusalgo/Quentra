export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy backend API and WebSocket requests to Cloudflare Tunnel
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws')) {
      const backendUrl = new URL(request.url);
      backendUrl.hostname = 'together-fees-visited-poultry.trycloudflare.com';
      backendUrl.protocol = 'https:';
      backendUrl.port = '';
      return fetch(backendUrl.toString(), request);
    }

    // Serve frontend static assets (Cloudflare automatically handles SPA routing via not_found_handling)
    return env.ASSETS.fetch(request);
  }
};

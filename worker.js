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

    // Serve frontend static assets with SPA fallback to /index.html
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }
    return response;
  }
};

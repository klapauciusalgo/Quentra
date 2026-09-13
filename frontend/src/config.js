/**
 * Application Runtime Configuration
 * Supports unified origin deployment (Cloudflare Tunnel)
 * and decoupled edge deployment (Cloudflare Pages + API Tunnel)
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

export const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};

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

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xtibimfydxnooeooiufl.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_T03KAiPRsWNWrkKT5hHVGw_xg3A7jzd';

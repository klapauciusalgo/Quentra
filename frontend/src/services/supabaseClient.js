import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

/**
 * Supabase Client Initialization
 * Using publishable/anon key for browser-safe client operations.
 */
export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    })
  : null;

/**
 * Translate auth errors into user-friendly English messages.
 */
export function mapAuthError(error) {
  if (!error) return '';
  const msg = (error.message || error.error_description || String(error)).toLowerCase();
  const code = (error.code || error.error || '').toLowerCase();

  if (code === 'access_denied' || msg.includes('access_denied') || msg.includes('user cancelled')) {
    return 'Google sign-in was cancelled.';
  }
  if (code === 'redirect_uri_mismatch' || msg.includes('redirect_uri_mismatch')) {
    return 'Sign-in is temporarily unavailable because the redirect URL is misconfigured.';
  }
  if (code === 'disallowed_useragent' || msg.includes('disallowed_useragent')) {
    return 'Google blocked sign-in from this in-app browser. Open the page in Chrome or Safari to continue.';
  }
  if (msg.includes('invalid flow state') || msg.includes('code verifier')) {
    return 'The sign-in session expired. Please try again.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('521') || msg.includes('offline')) {
    return 'The authentication service is unavailable. Please check your connection and try again.';
  }

  return error.message || 'Something went wrong during sign-in. Please try again.';
}

/**
 * Detect if current environment is an in-app browser (webview)
 * Google blocks OAuth inside embedded webviews (FR-11, E-07)
 */
export function isInAppBrowser() {
  if (typeof window === 'undefined' || !window.navigator) return false;
  const ua = window.navigator.userAgent || window.navigator.vendor || '';
  return /FBAN|FBAV|Instagram|TikTok|Line|Twitter|MicroMessenger/i.test(ua);
}

/**
 * Supabase Auth Methods with local fallback support
 */
export async function signInWithGoogle(options = {}) {
  if (!supabase) {
    throw new Error('Supabase client tidak terkonfigurasi');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const redirectTarget = options.redirectTo || `${origin}/app`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectTarget,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function signInWithEmail(email, password) {
  if (!supabase) {
    throw new Error('Supabase client tidak terkonfigurasi');
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

export async function signUpWithEmail(email, password, metadata = {}) {
  if (!supabase) {
    throw new Error('Supabase client tidak terkonfigurasi');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const emailRedirectTo = `${origin}/app`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: emailRedirectTo,
      data: {
        full_name: metadata.fullName || email.split('@')[0],
        name: metadata.fullName || email.split('@')[0],
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function resendVerificationEmail(email) {
  if (!supabase) {
    throw new Error('Supabase client tidak terkonfigurasi');
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const emailRedirectTo = `${origin}/app`;

  const { data, error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: emailRedirectTo,
    },
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut error, continuing local cleanup:', e);
    }
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('quentra_demo_user');
    localStorage.removeItem('quentra_auth_session');
  }
}


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
 * Translate raw error messages into user-friendly Indonesian messages
 * according to PRD 05-edge-case-dan-error-handling.md (§5.2)
 */
export function mapAuthError(error) {
  if (!error) return '';
  const msg = (error.message || error.error_description || String(error)).toLowerCase();
  const code = (error.code || error.error || '').toLowerCase();

  if (code === 'access_denied' || msg.includes('access_denied') || msg.includes('user cancelled')) {
    return 'Login dengan Google dibatalkan.';
  }
  if (code === 'redirect_uri_mismatch' || msg.includes('redirect_uri_mismatch')) {
    return 'Layanan login sedang bermasalah (konfigurasi redirect). Tim kami sudah diberi tahu.';
  }
  if (code === 'disallowed_useragent' || msg.includes('disallowed_useragent')) {
    return 'Google memblokir login dari dalam aplikasi ini. Silakan buka di browser (Chrome/Safari) untuk melanjutkan.';
  }
  if (msg.includes('invalid flow state') || msg.includes('code verifier')) {
    return 'Sesi login kedaluwarsa. Silakan coba lagi.';
  }
  if (code === 'email_exists' || msg.includes('already registered') || msg.includes('already in use') || msg.includes('user already registered')) {
    return 'Email ini sudah terdaftar. Masuk dengan password atau gunakan opsi Masuk.';
  }
  if (msg.includes('invalid login credentials') || msg.includes('invalid grant') || msg.includes('invalid password')) {
    return 'Email atau password yang Anda masukkan salah. Periksa kembali dan coba lagi.';
  }
  if (msg.includes('password should be at least') || msg.includes('weak_password')) {
    return 'Password terlalu pendek. Gunakan minimal 6 karakter.';
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit') || msg.includes('rate_limit')) {
    return 'Batas pengiriman email verifikasi tercapai (kuota email gratis Supabase). Mohon tunggu beberapa saat sebelum mencoba lagi, atau konfigurasikan Custom SMTP di dashboard Supabase.';
  }
  if (code === 'email_address_invalid' || (msg.includes('email') && msg.includes('invalid'))) {
    return 'Format alamat email tidak valid atau domain tidak didukung. Gunakan alamat email aktif seperti @gmail.com.';
  }
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('521') || msg.includes('offline')) {
    return 'Koneksi ke server auth terputus atau origin sedang standby. Silakan coba lagi.';
  }

  return error.message || 'Terjadi kendala saat proses autentikasi. Silakan coba lagi.';
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


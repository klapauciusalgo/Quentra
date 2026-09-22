import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { mapAuthError, isInAppBrowser } from '../services/supabaseClient';
import { playRetroSound } from '../utils/formatters';
import { 
  X, 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  ExternalLink,
  Shield,
  Sparkles
} from 'lucide-react';

export default function AuthModal({ onSuccess }) {
  const { 
    isAuthModalOpen, 
    closeAuthModal, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    loginDemoTrader,
    authRedirectTarget 
  } = useAuth();

  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isWebview, setIsWebview] = useState(false);

  useEffect(() => {
    setIsWebview(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (isAuthModalOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      setIsLoading(false);
    }
  }, [isAuthModalOpen, mode]);

  if (!isAuthModalOpen) return null;

  const handleClose = () => {
    playRetroSound('blip');
    closeAuthModal();
  };

  const handleGoogleLogin = async () => {
    playRetroSound('select');
    setErrorMessage('');
    setIsLoading(true);

    try {
      await loginWithGoogle();
      // Browser will redirect to Google OAuth consent
    } catch (err) {
      setIsLoading(false);
      setErrorMessage(mapAuthError(err));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    playRetroSound('select');
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(true);

    if (!email || !password) {
      setErrorMessage('Mohon isi alamat email dan password Anda.');
      setIsLoading(false);
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('Password minimal harus 6 karakter.');
      setIsLoading(false);
      return;
    }

    try {
      if (mode === 'signup') {
        const res = await registerWithEmail(email, password, fullName);
        setSuccessMessage('Akun berhasil dibuat! Mengalihkan ke terminal...');
        setTimeout(() => {
          if (onSuccess) onSuccess(authRedirectTarget);
        }, 800);
      } else {
        await loginWithEmail(email, password);
        setSuccessMessage('Login berhasil! Membuka terminal...');
        setTimeout(() => {
          if (onSuccess) onSuccess(authRedirectTarget);
        }, 600);
      }
    } catch (err) {
      setIsLoading(false);
      const friendlyErr = mapAuthError(err);
      setErrorMessage(friendlyErr);
    }
  };

  const handleDemoLogin = () => {
    playRetroSound('chime');
    setIsLoading(true);
    const demo = loginDemoTrader(
      fullName || 'Demo Quant Trader', 
      email || 'trader@quentra.io'
    );
    setSuccessMessage(`Selamat datang, ${demo.full_name}! Mengalihkan ke terminal...`);
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) onSuccess(authRedirectTarget);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity animate-in fade-in duration-200" 
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-md bg-apple-canvas/95 dark:bg-[#161618]/95 border border-apple-border rounded-3xl shadow-2xl p-6 sm:p-8 backdrop-blur-2xl text-apple-text animate-in zoom-in-95 duration-200 z-10 space-y-5">
        
        {/* Header Strip with Brand Logo & Close Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-apple-blue flex items-center justify-center shadow-md shadow-blue-500/20">
              <span className="text-white text-xs font-bold">Q</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm tracking-tight text-apple-text">Quentra Pro</span>
                <span className="px-1.5 py-0.5 text-[9px] font-semibold uppercase bg-apple-blue/15 text-apple-blue rounded-md">
                  Terminal Gate
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-95 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title & Requirement Explanation */}
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-apple-text">
            {mode === 'signin' ? 'Masuk ke Trading Terminal' : 'Buat Akun Quentra'}
          </h2>
          <p className="text-xs text-apple-muted leading-relaxed">
            Anda perlu membuat atau memiliki akun untuk mengakses seluruh sinyal live, grafik backtest, dan eksekusi algo.
          </p>
        </div>

        {/* In-App Browser Warning (FR-11, E-07) */}
        {isWebview && (
          <div className="p-3 bg-apple-orange/10 border border-apple-orange/30 rounded-2xl flex items-start gap-2.5 text-xs text-apple-orange">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">Terdeteksi In-App Browser</span>
              <p className="text-[11px] leading-snug">
                Google memblokir login dari browser aplikasi sosial media. Silakan buka link ini di browser resmi (Chrome / Safari).
              </p>
            </div>
          </div>
        )}

        {/* 1. Official Google Sign-In Button (FR-06, FR-07, US-01) */}
        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleLogin}
          className="w-full py-2.5 px-4 bg-white dark:bg-[#242426] hover:bg-gray-50 dark:hover:bg-[#2c2c2e] active:scale-[0.98] border border-black/15 dark:border-white/15 rounded-2xl flex items-center justify-center gap-3 text-xs font-semibold text-gray-800 dark:text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-apple-blue border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          )}
          <span>Lanjutkan dengan Google</span>
        </button>

        {/* Divider: "atau masuk dengan email" (FR-08) */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-apple-border w-full" />
          <span className="bg-apple-canvas dark:bg-[#161618] px-3 text-[11px] font-medium text-apple-dim uppercase tracking-wider shrink-0">
            atau dengan email
          </span>
        </div>

        {/* Tab Switcher: Masuk vs Daftar */}
        <div className="flex p-1 bg-black/[0.04] dark:bg-white/[0.05] rounded-xl text-xs font-medium border border-black/[0.06] dark:border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              playRetroSound('blip');
              setMode('signin');
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              mode === 'signin' 
                ? 'bg-white dark:bg-[#242426] text-apple-text shadow-sm font-semibold' 
                : 'text-apple-muted hover:text-apple-text'
            }`}
          >
            Masuk Akun
          </button>
          <button
            type="button"
            onClick={() => {
              playRetroSound('blip');
              setMode('signup');
            }}
            className={`flex-1 py-1.5 rounded-lg transition-all ${
              mode === 'signup' 
                ? 'bg-white dark:bg-[#242426] text-apple-text shadow-sm font-semibold' 
                : 'text-apple-muted hover:text-apple-text'
            }`}
          >
            Daftar Baru
          </button>
        </div>

        {/* Error or Success Alert */}
        {errorMessage && (
          <div className="p-3 bg-apple-red/10 border border-apple-red/30 rounded-2xl flex items-start gap-2.5 text-xs text-apple-red">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <p className="leading-snug">{errorMessage}</p>
              {errorMessage.includes('terputus') && (
                <button
                  type="button"
                  onClick={handleDemoLogin}
                  className="mt-1 px-3 py-1 bg-apple-blue/20 hover:bg-apple-blue/30 text-apple-blue text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Buka Terminal dengan Akun Demo (Instant)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-apple-green/10 border border-apple-green/30 rounded-2xl flex items-center gap-2.5 text-xs text-apple-green">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-apple-muted uppercase tracking-wider">
                Nama Lengkap
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-4 h-4 text-apple-dim" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama trader Anda"
                  className="w-full pl-10 pr-4 py-2.5 text-xs bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] focus:border-apple-blue rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-apple-muted uppercase tracking-wider">
              Alamat Email
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-apple-dim" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full pl-10 pr-4 py-2.5 text-xs bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] focus:border-apple-blue rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-apple-muted uppercase tracking-wider">
              Password
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-apple-dim" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 6 karakter"
                className="w-full pl-10 pr-10 py-2.5 text-xs bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.08] focus:border-apple-blue rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 text-apple-dim hover:text-apple-text transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'signin' ? 'Masuk & Buka Terminal' : 'Daftar & Buka Terminal'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Demo Access Option */}
        <div className="pt-2 text-center border-t border-apple-border/50">
          <button
            type="button"
            onClick={handleDemoLogin}
            className="text-[11px] text-apple-muted hover:text-apple-blue transition-colors underline underline-offset-4 cursor-pointer"
          >
            Ingin melihat dulu? Masuk sebagai Demo Trader &rarr;
          </button>
        </div>

        {/* Security & Privacy Badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-apple-dim">
          <Shield className="w-3 h-3 text-apple-green" />
          <span>Sesi terenkripsi dan diverifikasi oleh Supabase Auth</span>
        </div>

      </div>
    </div>
  );
}

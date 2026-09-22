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
  Shield,
  RotateCw
} from 'lucide-react';

export default function AuthModal({ onSuccess }) {
  const { 
    isAuthModalOpen, 
    closeAuthModal, 
    loginWithGoogle, 
    loginWithEmail, 
    registerWithEmail, 
    resendVerification,
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

  // Email verification sent state
  const [verificationEmailSent, setVerificationEmailSent] = useState(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendStatus, setResendStatus] = useState('');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    setIsWebview(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (isAuthModalOpen) {
      setErrorMessage('');
      setSuccessMessage('');
      setIsLoading(false);
      setVerificationEmailSent(null);
      setResendStatus('');
    }
  }, [isAuthModalOpen, mode]);

  // Cooldown timer for resend verification email
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Keyboard accessibility: ESC key closes modal
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        playRetroSound('blip');
        closeAuthModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal]);

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
        setIsLoading(false);

        // If Supabase requires email verification (confirmation email dispatched)
        if (res?.needsEmailVerification) {
          playRetroSound('chime');
          setVerificationEmailSent(res.email || email);
          return;
        }

        // Auto-login if session immediately granted
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

  const handleResendVerification = async () => {
    if (!verificationEmailSent || resendCooldown > 0 || isResending) return;
    playRetroSound('select');
    setIsResending(true);
    setResendStatus('');

    try {
      await resendVerification(verificationEmailSent);
      setIsResending(false);
      setResendStatus('Email verifikasi baru berhasil dikirimkan!');
      setResendCooldown(60); // 60 seconds cooldown
    } catch (err) {
      setIsResending(false);
      setResendStatus(mapAuthError(err));
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/80 flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal Dialog Card - Solid Web Theme Design */}
      <div 
        className="relative w-full max-w-md bg-white dark:bg-[#0C0D12] border border-black/10 dark:border-white/[0.12] rounded-3xl shadow-2xl p-6 sm:p-7 text-apple-text animate-in zoom-in-95 duration-200 z-10 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Strip with Brand Logo & Close Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-black/[0.06] to-black/[0.01] dark:from-white/[0.12] dark:to-white/[0.02] border border-black/10 dark:border-white/15 flex items-center justify-center shadow-sm">
              <span className="w-3.5 h-3.5 rounded-sm bg-apple-blue flex items-center justify-center text-[9px] font-bold text-white">
                Q
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-apple-text">
                  Quentra
                </span>
                <span className="px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase rounded-full bg-apple-blue/15 text-apple-cyan border border-apple-blue/30">
                  Pro
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-95 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer"
            title="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* View A: Email Verification Sent Confirmation */}
        {verificationEmailSent ? (
          <div className="space-y-4 py-1 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-apple-blue/10 border border-apple-blue/20 flex items-center justify-center text-apple-blue shadow-sm">
              <Mail className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-apple-text tracking-tight">
                Cek Kotak Masuk Email Anda
              </h3>
              <p className="text-xs text-apple-muted leading-relaxed">
                Tautan verifikasi akun telah dikirimkan ke:
              </p>
              <div className="py-2 px-3 bg-black/[0.03] dark:bg-white/[0.04] border border-black/10 dark:border-white/10 rounded-xl text-xs font-semibold text-apple-text break-all">
                {verificationEmailSent}
              </div>
              <p className="text-[11px] text-apple-dim leading-relaxed pt-1">
                Silakan buka kotak masuk email Anda (periksa juga folder <strong>Spam / Promosi</strong>), lalu klik tombol konfirmasi untuk mengaktifkan akun sebelum masuk ke terminal.
              </p>
            </div>

            {resendStatus && (
              <div className={`p-2.5 rounded-xl text-xs border ${
                resendStatus.includes('berhasil') 
                  ? 'bg-apple-green/10 border-apple-green/30 text-apple-green' 
                  : 'bg-apple-red/10 border-apple-red/30 text-apple-red'
              }`}>
                {resendStatus}
              </div>
            )}

            <div className="space-y-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  playRetroSound('select');
                  setVerificationEmailSent(null);
                  setMode('signin');
                }}
                className="w-full py-2.5 bg-apple-blue hover:bg-blue-600 active:scale-[0.98] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer"
              >
                <span>Sudah Verifikasi? Masuk Sekarang</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={resendCooldown > 0 || isResending}
                onClick={handleResendVerification}
                className="w-full py-2 bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-apple-text text-xs font-medium rounded-xl border border-black/[0.08] dark:border-white/[0.08] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
              >
                {isResending ? (
                  <RotateCw className="w-3.5 h-3.5 animate-spin text-apple-blue" />
                ) : null}
                <span>
                  {resendCooldown > 0 
                    ? `Kirim Ulang Email (${resendCooldown}s)` 
                    : 'Kirim Ulang Email Verifikasi'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playRetroSound('blip');
                  setVerificationEmailSent(null);
                }}
                className="text-[11px] text-apple-muted hover:text-apple-text underline underline-offset-4 transition-colors cursor-pointer"
              >
                &larr; Gunakan email lain untuk mendaftar
              </button>
            </div>
          </div>
        ) : (
          /* View B: Standard Sign-In & Sign-Up Form */
          <>
            {/* Title & Explanation */}
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
              className="w-full py-2.5 px-4 bg-white dark:bg-[#161720] hover:bg-gray-50 dark:hover:bg-[#1D1F2B] active:scale-[0.98] border border-gray-300 dark:border-white/15 rounded-2xl flex items-center justify-center gap-3 text-xs font-semibold text-gray-800 dark:text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
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

            {/* Divider: "atau dengan email" (FR-08) */}
            <div className="relative flex items-center justify-center">
              <div className="border-t border-black/[0.08] dark:border-white/[0.08] w-full" />
              <span className="bg-white dark:bg-[#0C0D12] px-3 text-[11px] font-medium text-apple-dim uppercase tracking-wider shrink-0">
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
                    ? 'bg-white dark:bg-[#1E202B] text-apple-text shadow-sm font-semibold' 
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
                    ? 'bg-white dark:bg-[#1E202B] text-apple-text shadow-sm font-semibold' 
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
                      className="w-full pl-10 pr-4 py-2.5 text-xs bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.1] focus:border-apple-blue focus:bg-white dark:focus:bg-[#161720] rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
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
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.1] focus:border-apple-blue focus:bg-white dark:focus:bg-[#161720] rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
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
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.09] dark:border-white/[0.1] focus:border-apple-blue focus:bg-white dark:focus:bg-[#161720] rounded-xl outline-none text-apple-text placeholder:text-apple-dim transition-colors"
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
                    <span>{mode === 'signin' ? 'Masuk & Buka Terminal' : 'Daftar & Kirim Email Verifikasi'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </>
        )}

        {/* Security & Privacy Badge */}
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-apple-dim pt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
          <Shield className="w-3 h-3 text-apple-green" />
          <span>Sesi terenkripsi dan diverifikasi oleh Supabase Auth</span>
        </div>

      </div>
    </div>
  );
}

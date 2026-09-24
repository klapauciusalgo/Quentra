import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { mapAuthError, isInAppBrowser } from '../services/supabaseClient';
import { playRetroSound } from '../utils/formatters';
import { AlertCircle, CheckCircle2, Shield, X } from 'lucide-react';

export default function AuthModal({ onSuccess }) {
  const {
    isAuthModalOpen,
    closeAuthModal,
    loginWithGoogle,
    authRedirectTarget,
  } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isWebview, setIsWebview] = useState(false);

  useEffect(() => {
    setIsWebview(isInAppBrowser());
  }, []);

  useEffect(() => {
    if (!isAuthModalOpen) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsLoading(false);
  }, [isAuthModalOpen]);

  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
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
    setSuccessMessage('');
    setIsLoading(true);

    try {
      setSuccessMessage('Redirecting to Google...');
      await loginWithGoogle();
      if (onSuccess) onSuccess(authRedirectTarget);
    } catch (error) {
      setIsLoading(false);
      setSuccessMessage('');
      setErrorMessage(mapAuthError(error));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 dark:bg-black/80 flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <div
        className="relative w-full max-w-md bg-white dark:bg-[#0C0D12] border border-black/10 dark:border-white/[0.12] rounded-3xl shadow-2xl p-6 sm:p-7 text-apple-text animate-in zoom-in-95 duration-200 z-10 space-y-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-black/[0.06] to-black/[0.01] dark:from-white/[0.12] dark:to-white/[0.02] border border-black/10 dark:border-white/15 flex items-center justify-center shadow-sm">
              <span className="w-3.5 h-3.5 rounded-sm bg-apple-blue flex items-center justify-center text-[9px] font-bold text-white">
                Q
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-apple-text">Quentra</span>
              <span className="px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase rounded-full bg-apple-blue/15 text-apple-cyan border border-apple-blue/30">
                Pro
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] active:scale-95 flex items-center justify-center text-apple-muted hover:text-apple-text transition-all cursor-pointer"
            title="Close"
            aria-label="Close sign-in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight text-apple-text">Sign in to Trading Terminal</h2>
          <p className="text-xs text-apple-muted leading-relaxed">
            Sign in with Google to access live signals, charts, and algorithmic trading tools.
          </p>
        </div>

        {isWebview && (
          <div className="p-3 bg-apple-orange/10 border border-apple-orange/30 rounded-2xl flex items-start gap-2.5 text-xs text-apple-orange">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold">In-app browser detected</span>
              <p className="text-[11px] leading-snug">
                Google may block sign-in from embedded social-media browsers. Open this page in Chrome or Safari to continue.
              </p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 bg-apple-red/10 border border-apple-red/30 rounded-2xl flex items-start gap-2.5 text-xs text-apple-red">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-snug">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-apple-green/10 border border-apple-green/30 rounded-2xl flex items-center gap-2.5 text-xs text-apple-green">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <button
          type="button"
          disabled={isLoading}
          onClick={handleGoogleLogin}
          className="w-full py-3 px-4 bg-white dark:bg-[#161720] hover:bg-gray-50 dark:hover:bg-[#1D1F2B] active:scale-[0.98] border border-gray-300 dark:border-white/15 rounded-2xl flex items-center justify-center gap-3 text-xs font-semibold text-gray-800 dark:text-white transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-apple-blue border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          )}
          <span>Continue with Google</span>
        </button>

        <div className="flex items-center justify-center gap-1.5 text-[10px] text-apple-dim pt-1 border-t border-black/[0.06] dark:border-white/[0.08]">
          <Shield className="w-3 h-3 text-apple-green" />
          <span>Your session is encrypted and secured by Supabase Auth</span>
        </div>
      </div>
    </div>
  );
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  supabase, 
  signInWithGoogle as sbSignInWithGoogle, 
  signInWithEmail as sbSignInWithEmail, 
  signUpWithEmail as sbSignUpWithEmail, 
  signOut as sbSignOut,
  mapAuthError 
} from '../services/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authRedirectTarget, setAuthRedirectTarget] = useState(null);

  // Helper to extract clean user metadata
  const parseUserData = (sbUser, fallbackProvider = 'email') => {
    if (!sbUser) return null;
    const meta = sbUser.user_metadata || {};
    const identities = sbUser.identities || [];
    const provider = identities[0]?.provider || meta.provider || fallbackProvider;

    return {
      id: sbUser.id,
      email: sbUser.email,
      full_name: meta.full_name || meta.name || sbUser.email?.split('@')[0] || 'Trader',
      avatar_url: meta.avatar_url || meta.picture || null,
      provider: provider,
      createdAt: sbUser.created_at,
    };
  };

  // Initial session restoration
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      // 1. Check local demo user first
      if (typeof window !== 'undefined') {
        const localDemo = localStorage.getItem('quentra_demo_user');
        if (localDemo) {
          try {
            const parsed = JSON.parse(localDemo);
            if (isMounted) {
              setUser(parsed);
              setIsLoading(false);
              return;
            }
          } catch (e) {
            localStorage.removeItem('quentra_demo_user');
          }
        }
      }

      // 2. Check Supabase session
      if (supabase) {
        try {
          const { data: { session: currentSession }, error } = await supabase.auth.getSession();
          if (!error && currentSession && currentSession.user) {
            if (isMounted) {
              setSession(currentSession);
              setUser(parseUserData(currentSession.user));
            }
          }
        } catch (err) {
          console.warn('Supabase getSession error (possible offline/paused origin):', err);
        }

        // Listen for auth state changes (OAuth redirect callbacks, token refresh, sign-in/out)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!isMounted) return;

          if (newSession && newSession.user) {
            setSession(newSession);
            const parsed = parseUserData(newSession.user);
            setUser(parsed);
            setIsLoading(false);

            // If an auth modal was open awaiting authentication, close it
            setIsAuthModalOpen(false);
          } else if (event === 'SIGNED_OUT') {
            setSession(null);
            setUser(null);
            setIsLoading(false);
          }
        });

        if (isMounted) setIsLoading(false);

        return () => {
          subscription?.unsubscribe();
        };
      } else {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const openAuthModal = (target = '/app') => {
    setAuthRedirectTarget(target);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const loginWithGoogle = async () => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectUrl = `${origin}/app`;
      await sbSignInWithGoogle({ redirectTo: redirectUrl });
    } catch (err) {
      console.error('Google OAuth error:', err);
      throw err;
    }
  };

  const loginWithEmail = async (email, password) => {
    try {
      const data = await sbSignInWithEmail(email, password);
      if (data?.user) {
        const parsed = parseUserData(data.user, 'email');
        setUser(parsed);
        setSession(data.session);
        setIsAuthModalOpen(false);
        return parsed;
      }
    } catch (err) {
      // If network error / paused Supabase, offer fallback or throw mapped error
      console.error('Email signin error:', err);
      throw err;
    }
  };

  const registerWithEmail = async (email, password, fullName) => {
    try {
      const data = await sbSignUpWithEmail(email, password, { fullName });
      if (data?.user) {
        const parsed = parseUserData(data.user, 'email');
        setUser(parsed);
        setSession(data.session);
        setIsAuthModalOpen(false);
        return parsed;
      }
    } catch (err) {
      console.error('Email signup error:', err);
      throw err;
    }
  };

  // Demo account sign-in for seamless verification / preview when Supabase is sleeping
  const loginDemoTrader = (customName = 'Quant Trader', customEmail = 'trader@quentra.io') => {
    const demoUser = {
      id: 'demo-trader-01',
      email: customEmail,
      full_name: customName,
      avatar_url: null,
      provider: 'demo',
      createdAt: new Date().toISOString(),
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('quentra_demo_user', JSON.stringify(demoUser));
    }
    setUser(demoUser);
    setIsAuthModalOpen(false);
    return demoUser;
  };

  const logout = async () => {
    await sbSignOut();
    setUser(null);
    setSession(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('quentra_demo_user');
      // If in /app, return to landing page
      if (window.location.pathname.startsWith('/app')) {
        window.history.pushState({ viewMode: 'landing' }, '', '/');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  };

  const value = {
    user,
    session,
    isAuthenticated: Boolean(user),
    isLoading,
    isAuthModalOpen,
    authRedirectTarget,
    openAuthModal,
    closeAuthModal,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    loginDemoTrader,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


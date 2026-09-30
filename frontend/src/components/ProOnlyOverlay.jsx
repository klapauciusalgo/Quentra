import React from 'react';
import { ArrowUpRight, LockKeyhole } from 'lucide-react';

export default function ProOnlyOverlay({
  locked = true,
  children,
  description = 'Unlock the strategy thesis and proprietary execution rules.',
}) {
  const handleUpgrade = () => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ viewMode: 'not-found' }, '', '/billing');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl ${locked ? 'min-h-[128px]' : ''}`}>
      <div
        aria-hidden={locked ? 'true' : undefined}
        className={locked
          ? 'select-none pointer-events-none blur-[5px] opacity-55 saturate-[0.65] transition-[filter,opacity] duration-300'
          : 'transition-[filter,opacity] duration-300'}
      >
        {children}
      </div>

      {locked && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-white/45 px-4 py-5 backdrop-blur-[1.5px] dark:bg-[#0C0D12]/55"
          role="note"
          aria-label="Pro users only"
        >
          <div className="apple-glass-card w-full max-w-[310px] rounded-2xl border border-apple-blue/20 bg-white/88 px-5 py-3 text-center shadow-[0_14px_36px_rgba(25,80,120,0.14)] dark:border-apple-blue/25 dark:bg-[#11141B]/92">
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg border border-apple-blue/20 bg-apple-blue/10 text-apple-blue shadow-sm dark:bg-apple-blue/15">
              <LockKeyhole className="h-3.5 w-3.5" strokeWidth={2.2} />
            </div>
            <div className="text-[9px] font-black tracking-[0.14em] text-apple-blue">
              ONLY FOR PRO USERS
            </div>
            <p className="mx-auto mt-1 max-w-[250px] text-[10px] leading-snug text-apple-muted">
              {description}
            </p>
            <button
              type="button"
              onClick={handleUpgrade}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-apple-blue/20 bg-apple-blue/10 px-2.5 py-1.5 text-[9px] font-bold tracking-wide text-apple-blue transition hover:border-apple-blue/40 hover:bg-apple-blue/15 dark:bg-apple-blue/15"
              aria-label="Upgrade to Pro"
            >
              Upgrade to Pro
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

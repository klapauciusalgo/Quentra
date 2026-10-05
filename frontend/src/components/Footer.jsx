import React from 'react';

const DISCOVER_LINKS = [
  { label: 'Trading terminal', href: '/app' },
  { label: 'Strategy directory', href: '/#strategies' },
  { label: 'Market floor', href: '/#motion' },
];

const RESEARCH_LINKS = [
  { label: 'Novera', href: '/app?strategy=pippo-30m-new-gen' },
  { label: 'Kairon', href: '/app?strategy=pippo-30m-grd' },
  { label: 'Methodology', href: '/#features' },
];

const EVIDENCE_LINKS = [
  { label: 'Trade logs', href: '/app?strategy=pippo-30m-new-gen' },
  { label: 'Data sources', href: '/#features' },
  { label: 'System status', href: '/app' },
];

const QUENTRA_LINKS = [
  { label: 'About Quentra', href: '/#features' },
  { label: 'Capital defense', href: '/#risk' },
];

function FooterColumn({ title, links }) {
  return (
    <div>
      <h3 className="mb-4 text-xs font-medium text-apple-dim">{title}</h3>
      <div className="space-y-3">
        {links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="block text-[13px] text-apple-text transition-colors hover:text-apple-blue focus-visible:text-apple-blue"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export default function Footer({ status = {}, onLaunch }) {
  const hasStatusSnapshot = Object.keys(status || {}).length > 0;
  const isOnline = status?.status === 'ONLINE'
    || (status?.binance_ws_connected === true && status?.signals_available !== false);
  const statusLabel = !hasStatusSnapshot || isOnline
    ? 'All systems operational'
    : 'Syncing platform systems';

  const handleLaunch = (event) => {
    if (!onLaunch) return;
    event.preventDefault();
    onLaunch();
  };

  return (
    <footer
      role="contentinfo"
      className="border-t border-apple-border bg-apple-canvas px-4 pb-7 pt-14 text-apple-muted transition-colors duration-200 sm:px-6"
    >
      <div className="mx-auto max-w-[1220px]">
        <div className="flex flex-col justify-between gap-7 border-b border-apple-border pb-12 sm:flex-row sm:items-start sm:gap-10">
          <div>
            <h2 className="text-[29px] font-semibold tracking-[-0.055em] text-apple-text">Quentra</h2>
            <p className="mt-3 max-w-[330px] text-sm leading-relaxed text-apple-muted">
              Quantitative clarity for the decisions that move with the market.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-xs text-apple-muted"
            aria-live="polite"
            aria-label={`Platform status: ${statusLabel}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${isOnline ? 'bg-apple-green' : 'bg-apple-orange'}`}
              aria-hidden="true"
            />
            <strong className="font-medium text-apple-text">{statusLabel}</strong>
            <span aria-hidden="true">·</span>
            <span>BTC / ETH coverage</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-10 py-10 sm:grid-cols-4 sm:gap-10 sm:py-11">
          <FooterColumn title="Discover" links={DISCOVER_LINKS} />
          <FooterColumn title="Research" links={RESEARCH_LINKS} />
          <FooterColumn title="Evidence" links={EVIDENCE_LINKS} />
          <div>
            <h3 className="mb-4 text-xs font-medium text-apple-dim">Quentra</h3>
            <div className="space-y-3">
              {QUENTRA_LINKS.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="block text-[13px] text-apple-text transition-colors hover:text-apple-blue focus-visible:text-apple-blue"
                >
                  {link.label}
                </a>
              ))}
              <a
                href="/app"
                onClick={handleLaunch}
                className="block text-[13px] text-apple-blue transition-colors hover:text-blue-600 focus-visible:text-blue-600"
              >
                Open terminal <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-apple-border pt-4 text-[11px] text-apple-dim sm:flex-row sm:items-center sm:justify-between">
          <span>© 2026 Quentra</span>
          <div className="flex gap-5">
            <a href="/#features" className="transition-colors hover:text-apple-text">Privacy</a>
            <a href="/#features" className="transition-colors hover:text-apple-text">Terms</a>
            <a href="/app" className="transition-colors hover:text-apple-text">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

import React from 'react';
import { ArrowUpRight, Check, ChevronLeft } from 'lucide-react';

const QUENTRA_VIEW_MODES = new Set(['landing', 'dashboard', 'not-found']);

const isQuentraHistoryState = (state) => (
  Boolean(state && QUENTRA_VIEW_MODES.has(state.viewMode))
);

function RouteMap() {
  return (
    <svg
      viewBox="0 0 630 470"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <title>Quentra route map</title>
      <desc>
        A calm route field showing the missing coordinate and safe navigation destinations.
      </desc>
      <g className="not-found-axis" aria-hidden="true">
        <path d="M315 70v330M115 236h400" />
        <circle cx="315" cy="236" r="3" fill="none" />
      </g>
      <ellipse className="not-found-orbit" cx="315" cy="236" rx="205" ry="126" />
      <ellipse className="not-found-orbit not-found-orbit--dashed" cx="315" cy="236" rx="150" ry="78" />
      <path
        className="not-found-route not-found-route--primary"
        d="M80 344 C186 276 210 126 315 236 S476 147 558 185"
      />
      <path
        className="not-found-route not-found-route--secondary"
        d="M106 120 C220 146 218 342 315 236 S472 336 540 364"
      />
      <g>
        <circle className="not-found-missing" cx="315" cy="236" r="53" />
        <circle className="not-found-missing-inner" cx="315" cy="236" r="25" />
        <path className="not-found-missing-cross" d="M294 236h42M315 215v42" />
        <text className="not-found-missing-label" x="315" y="233" textAnchor="middle">
          MISSING
        </text>
        <text className="not-found-missing-label" x="315" y="246" textAnchor="middle">
          COORDINATE
        </text>
      </g>
      <g>
        <circle className="not-found-node not-found-node--blue" cx="166" cy="143" r="12" />
        <circle className="not-found-node-dot" cx="166" cy="143" r="3" />
        <text className="not-found-node-label" x="145" y="119">Signal Floor</text>
        <text className="not-found-node-meta" x="145" y="132">PRIMARY</text>
      </g>
      <g>
        <circle className="not-found-node not-found-node--green" cx="480" cy="153" r="12" />
        <circle className="not-found-node-dot not-found-node-dot--green" cx="480" cy="153" r="3" />
        <text className="not-found-node-label" x="500" y="149">Strategies</text>
        <text className="not-found-node-meta" x="500" y="163">ANALYSIS</text>
      </g>
      <g>
        <circle className="not-found-node not-found-node--purple" cx="477" cy="333" r="12" />
        <circle className="not-found-node-dot not-found-node-dot--purple" cx="477" cy="333" r="3" />
        <text className="not-found-node-label" x="497" y="329">Market View</text>
        <text className="not-found-node-meta" x="497" y="343">CONTEXT</text>
      </g>
      <circle
        className="not-found-traveller not-found-traveller--primary"
        cx="0"
        cy="0"
        r="4"
      />
      <circle
        className="not-found-traveller not-found-traveller--secondary"
        cx="0"
        cy="0"
        r="3"
      />
    </svg>
  );
}

export default function NotFoundPage({ onGoHome }) {
  const handleGoBack = () => {
    if (typeof window !== 'undefined') {
      const historyState = window.history.state;
      if (isQuentraHistoryState(historyState) && window.history.length > 1) {
        window.history.back();
        return;
      }
    }
    onGoHome();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-apple-canvas text-apple-text transition-colors duration-200">
      <div className="not-found-sweep pointer-events-none absolute inset-0 z-0" aria-hidden="true" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-12 sm:pt-7">
        <div className="flex items-center gap-2.5">
          <span className="not-found-brand-mark" aria-hidden="true">Q</span>
          <span className="text-[15px] font-semibold tracking-[-0.02em]">Quentra</span>
          <span className="text-[11px] text-apple-muted sm:ml-1">/ Navigation layer</span>
        </div>
        <div className="not-found-status-pill">
          <span className="not-found-status-dot" aria-hidden="true" />
          System ready
        </div>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-5rem)] max-w-[1320px] grid-cols-1 gap-8 px-6 pb-16 pt-20 sm:px-12 lg:grid-cols-[0.83fr_1.17fr] lg:items-center lg:gap-10 lg:pb-12 lg:pt-8">
        <section className="flex flex-col justify-center lg:pl-2">
          <p className="text-[11px] font-bold tracking-[0.04em] text-apple-blue">404 · ROUTE NOT FOUND</p>
          <h1 className="mt-4 max-w-[520px] text-[clamp(3rem,5.3vw,4.75rem)] font-bold leading-[1.02] tracking-[-0.065em] text-apple-text">
            Route out of the map.
          </h1>
          <p className="mt-5 max-w-[390px] text-base leading-7 tracking-[-0.015em] text-apple-muted sm:text-lg sm:leading-8">
            This route is outside the current map. No position changed—return to Signal Floor to continue your analysis safely.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onGoHome}
              aria-label="Back to Signal Floor"
              className="not-found-primary-button"
            >
              Back to Signal Floor
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleGoBack}
              aria-label="Go back"
              className="not-found-secondary-button"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2.1} aria-hidden="true" />
              Go back
            </button>
          </div>

          <div className="mt-8 flex items-start gap-2.5 text-[11px] leading-4 text-apple-muted">
            <span className="not-found-safe-check" aria-hidden="true"><Check className="h-3 w-3" strokeWidth={2.4} /></span>
            <p>
              <span className="font-semibold text-apple-muted">Safe state</span>
              <br />
              No signal or position was interrupted.
            </p>
          </div>
        </section>

        <section
          role="img"
          aria-label="Quentra route map"
          className="relative mx-auto flex w-full max-w-[620px] items-center justify-center lg:justify-end"
        >
          <div className="not-found-map-aura" aria-hidden="true" />
          <div className="not-found-map-card relative h-[410px] w-full overflow-hidden rounded-[1.5rem] sm:h-[470px] sm:rounded-[1.9rem]">
            <span className="absolute left-5 top-5 z-10 text-[10px] font-bold tracking-[0.13em] text-apple-dim sm:left-7 sm:top-6">
              ROUTE MAP
            </span>
            <span className="absolute right-5 top-5 z-10 font-mono text-[9px] tracking-[0.05em] text-apple-dim sm:right-7 sm:top-6">
              LIVE ROUTE FIELD
            </span>
            <RouteMap />
            <span className="absolute bottom-5 left-5 z-10 font-mono text-[9px] tracking-[0.06em] text-apple-dim sm:bottom-6 sm:left-7">
              SAFE STATE&nbsp; · &nbsp;NO POSITION CHANGED
            </span>
          </div>
        </section>
      </div>

      <footer className="absolute bottom-5 left-5 right-5 z-10 flex items-center justify-between text-[10px] text-apple-dim sm:bottom-6 sm:left-12 sm:right-12">
        <span><strong className="font-semibold text-apple-muted">Quentra</strong> · Quantitative crypto analysis</span>
        <span className="hidden sm:inline">404 / no route match</span>
      </footer>
    </main>
  );
}

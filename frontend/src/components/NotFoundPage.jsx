import React from 'react';
import { ArrowLeft, Home, SearchX } from 'lucide-react';

export default function NotFoundPage({ onGoHome }) {
  return (
    <main className="min-h-screen bg-apple-canvas px-4 py-8 text-apple-text sm:px-6 sm:py-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <section className="apple-glass-card w-full rounded-[2rem] px-6 py-10 text-center shadow-[0_24px_80px_rgba(30,60,90,0.12)] sm:px-12 sm:py-14">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-apple-blue/20 bg-apple-blue/10 text-apple-blue">
            <SearchX className="h-7 w-7" strokeWidth={1.8} aria-hidden="true" />
          </div>
          <p className="mt-7 text-[11px] font-black tracking-[0.28em] text-apple-blue">ERROR 404</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Halaman tidak ditemukan</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-apple-muted sm:text-base">
            URL yang kamu buka tidak tersedia di Quentra. Kembali ke halaman utama untuk melanjutkan.
          </p>
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Kembali ke Home"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-apple-blue px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(0,113,227,0.22)] transition hover:-translate-y-0.5 hover:bg-apple-blue/90"
          >
            <Home className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Kembali ke Home
            <ArrowLeft className="h-4 w-4 rotate-180" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </section>
      </div>
    </main>
  );
}

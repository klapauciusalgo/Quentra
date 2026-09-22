# PRD — Sign in / Sign up with Google (Supabase Auth)

**Status:** Draft v1.0 — butuh review
**Owner:** [isi nama] (PM/Eng lead)
**Terakhir diupdate:** 22 September 2026
**Target rilis:** [isi tanggal]

---

## 1. Ringkasan dalam 5 baris

Platform kita sekarang cuma punya satu cara masuk (email/password). Kita mau nambah **Sign in / Sign up with Google** pakai **Supabase Auth** sebagai identity provider, tanpa bikin sistem auth sendiri.

Tujuan utamanya bukan "nambah tombol", tapi **naikin conversion rate di step registrasi** dan **ngurangin support ticket "lupa password"** — dua metrik yang paling gampang dipakai buat ngukur sukses/nggaknya fitur ini.

Supabase Auth sudah handle seluruh OAuth 2.0 dance (state, PKCE, token exchange, refresh, rotasi refresh token), jadi kerjaan kita fokus di: **konfigurasi Google Cloud + Supabase**, **UX flow**, **linking akun lama**, dan **pembuatan row di tabel `profiles`** yang selama ini dipakai platform.

---

## 2. Isi dokumen ini

| File | Isi |
|---|---|
| [`01-konteks-dan-tujuan.md`](./01-konteks-dan-tujuan.md) | Masalah, tujuan, non-goals, metrik sukses |
| [`02-persona-dan-user-story.md`](./02-persona-dan-user-story.md) | Persona, jobs-to-be-done, user story + acceptance criteria |
| [`03-kebutuhan-fungsional.md`](./03-kebutuhan-fungsional.md) | FR-01..FR-24, state machine auth, edge state UI |
| [`04-desain-teknis.md`](./04-desain-teknis.md) | Arsitektur, setup Google Cloud + Supabase, env var, skema DB, RLS, contoh kode |
| [`05-edge-case-dan-error-handling.md`](./05-edge-case-dan-error-handling.md) | 18 edge case + error mapping + copywriting error |
| [`06-keamanan-dan-privasi.md`](./06-keamanan-dan-privasi.md) | Threat model, account linking risk, compliance Google, data privacy |
| [`07-metrik-dan-analytics.md`](./07-metrik-dan-analytics.md) | Event tracking, funnel, dashboard, alert |
| [`08-qa-test-plan.md`](./08-qa-test-plan.md) | Test matrix, environment matrix, checklist pra-rilis |
| [`09-rollout-dan-rollback.md`](./09-rollout-dan-rollback.md) | Fase rilis, feature flag, monitoring, rollback |
| [`10-open-questions-dan-risiko.md`](./10-open-questions-dan-risiko.md) | Pertanyaan terbuka, risiko, dependency, estimasi |

---

## 3. Cara pakai dokumen ini

- **Engineer** → mulai dari `03` + `04`. `04` sudah ada snippet yang bisa langsung di-copy.
- **PM/QA** → mulai dari `01`, `02`, `05`, `08`.
- **Yang mau ngukur hasilnya** → `07` dan `09`.

## 4. Asumsi yang dipakai (tolong dikoreksi kalau salah)

Karena PRD ini ditulis sebelum stack-nya dikonfirmasi, bagian teknis di `04` ditulis untuk **web app dengan SSR (Next.js App Router + `@supabase/ssr`)** — kombinasi paling umum buat Supabase — dan ada catatan tambahan untuk **SPA (Vite/React)** dan **mobile (React Native/Expo)**.

Kalau ternyata stack-nya beda, yang berubah cuma `04` dan `05`; requirement di `03` tetap berlaku.

## 5. Changelog

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 2026-09-22 | Draft awal |

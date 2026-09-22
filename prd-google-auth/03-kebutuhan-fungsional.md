# 03 — Kebutuhan Fungsional

Prioritas: **P0** = wajib untuk rilis, **P1** = wajib tapi bisa menyusul di fase 2, **P2** = nice to have.

## 3.1 Konfigurasi & Infrastruktur

| ID | Requirement | Prio |
|---|---|---|
| FR-01 | Project Supabase punya Google provider aktif di environment **dev, staging, dan prod** (tiap environment bisa pakai OAuth client yang sama atau terpisah — lihat `04`). | P0 |
| FR-02 | Client Secret Google disimpan sebagai environment variable / secret manager. **Tidak boleh** ada di repo, di kode client, atau di `NEXT_PUBLIC_*`. | P0 |
| FR-03 | URL Configuration Supabase: `Site URL` = domain produksi, `Additional Redirect URLs` = allowlist semua origin yang sah (localhost, preview, staging, prod) dengan wildcard seminimal mungkin. | P0 |
| FR-04 | Google OAuth consent screen terisi lengkap (nama app, logo, privacy policy URL, terms URL, domain terverifikasi) dan **dipublish** (bukan status "Testing"). | P0 |
| FR-05 | Ada catatan runbook: cara rotate client secret, cara ganti redirect URI, cara debug. | P1 |

## 3.2 UI / Entry Point

| ID | Requirement | Prio |
|---|---|---|
| FR-06 | Tombol "Lanjutkan dengan Google" muncul di: halaman **Sign up**, halaman **Sign in**, dan **modal auth** (kalau ada). | P0 |
| FR-07 | Tombol mengikuti Google branding guidelines (logo resmi, jarak, kontras, label "Lanjutkan dengan Google"/"Sign in with Google" — bukan "Login pakai G"). | P0 |
| FR-08 | Login email/password yang lama tetap ada, di bawah tombol Google, dipisah divider "atau". | P0 |
| FR-09 | Tombol punya state `loading` setelah diklik (disable + spinner) untuk mencegah double-submit. | P0 |
| FR-10 | Di halaman Settings → "Metode Login": tampilkan identity terhubung + tombol hubungkan/putuskan. | P1 |
| FR-11 | Di perangkat mobile, kalau app terdeteksi berada di **in-app browser** (webview Instagram/TikTok/Facebook/WhatsApp), tampilkan instruksi + tombol buka browser eksternal — Google **memblokir** sign-in dari webview. | P0 |

## 3.3 Flow Autentikasi

| ID | Requirement | Prio |
|---|---|---|
| FR-12 | Sign in/up via Google: `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })`. | P0 |
| FR-13 | Callback route melakukan `exchangeCodeForSession(code)` (PKCE flow) dan menyimpan session di cookie (SSR) / storage yang aman (SPA). | P0 |
| FR-14 | Session di-refresh otomatis (middleware SSR / `onAuthStateChange` di SPA) supaya user nggak ke-logout mendadak. | P0 |
| FR-15 | Setelah callback sukses, user diarahkan ke `next` (URL internal) atau default `/dashboard`. URL non-relatif **ditolak** → fallback ke default. | P0 |
| FR-16 | Pembuatan row `public.profiles` otomatis lewat DB trigger `on auth.users insert` (bukan dari client), dengan `full_name` & `avatar_url` dari metadata Google. | P0 |
| FR-17 | Ada migration backfill untuk user yang sudah ada dan belum punya row `profiles`. | P0 |
| FR-18 | Automatic identity linking tetap aktif, sehingga user lama dengan email Google yang sama masuk ke akun lamanya (bukan akun baru). **Wajib diverifikasi dengan query DB.** | P0 |
| FR-19 | Manual linking (`linkIdentity`/`unlinkIdentity`) diaktifkan di Auth settings supaya user bisa nambah/lepas Google dari Settings. | P1 |
| FR-20 | `unlinkIdentity` diblokir kalau user cuma punya 1 identity (cegah lockout). | P1 |
| FR-21 | Logout menghapus session lokal; tersedia juga "sign out semua device" (`scope: 'global'`). | P0 |
| FR-22 | Provider aktif disimpan/dapat di-derive di `profiles` (mis. `auth_providers text[]`) untuk kebutuhan admin & analytics. | P2 |

## 3.4 Observability & Error

| ID | Requirement | Prio |
|---|---|---|
| FR-23 | Setiap event auth (klik, redirect, callback sukses/gagal) dikirim ke analytics dengan `provider`, `stage`, `error_code`, `duration_ms`. Detail di `07`. | P0 |
| FR-24 | Semua error OAuth di-map ke pesan bahasa manusia + aksi berikutnya (tabel di `05`), tanpa membocorkan detail teknis. | P0 |
| FR-25 | Ada alert otomatis kalau `oauth_callback_failed` > 2% dalam 15 menit. | P1 |

---

## 3.5 State machine auth

```
                         ┌──────────────────┐
                         │   UNAUTHENTICATED │
                         └─────────┬─────────┘
                                   │ klik "Lanjutkan dengan Google"
                                   ▼
                         ┌──────────────────┐
                         │  OAUTH_REDIRECT   │  (state = PKCE verifier disimpan di cookie)
                         └─────────┬─────────┘
                    ┌──────────────┼───────────────┐
                    │              │               │
        user cancel │     Google error             │  sukses
                    ▼              ▼               ▼
          ┌───────────────┐ ┌─────────────┐ ┌──────────────────┐
          │ CANCELLED     │ │ ERROR_*     │ │  CALLBACK_EXCHANGE│
          │ (pesan netral)│ │ (pesan +CTA)│ └────────┬─────────┘
          └───────┬───────┘ └──────┬──────┘          │
                  │                │        exchange code gagal
                  │                │                 ▼
                  │                │        ┌──────────────────┐
                  │                │        │ AUTH_CODE_ERROR  │
                  │                │        └────────┬─────────┘
                  └────────────────┴─────────────────┘
                                   │ (semua kembali ke UNAUTHENTICATED, retry aman)
                                   ▼
                         ┌──────────────────┐
                         │   AUTHENTICATED   │
                         │  session + profil │
                         └─────────┬─────────┘
                                   │ logout
                                   ▼
                         ┌──────────────────┐
                         │   UNAUTHENTICATED │
                         └──────────────────┘
```

**Aturan state:**
- `OAUTH_REDIRECT` tidak boleh menggantung lebih dari 60 detik; kalau user balik tanpa `code` dan tanpa `error`, anggap `CANCELLED`.
- Dari setiap state error, user harus bisa retry tanpa reload halaman (kecuali `disallowed_useragent`, yang butuh buka browser eksternal).
- Tidak ada state yang menghasilkan row setengah jadi di DB. Pembuatan `profiles` **atomik** via trigger, bukan dari client.

## 3.6 Matriks entry point

| Halaman | Tombol Google | Perilaku default |
|---|---|---|
| Landing (belum login) | ✅ "Lanjutkan dengan Google" | Sign in atau sign up otomatis (Supabase tidak membedakan; user baru dibuat kalau email belum ada) |
| `/signup` | ✅ | Idem, tapi copywriting "Daftar dengan Google" |
| `/login` | ✅ | Idem, copywriting "Masuk dengan Google" |
| Modal auth (paywall, dsb) | ✅ | Setelah sukses, modal ditutup dan aksi sebelumnya dilanjutkan |
| `/settings` (sudah login) | ✅ (mode link) | `linkIdentity`, bukan login baru |
| Deep link `/x` → `/login?next=/x` | ✅ | Setelah sukses kembali ke `/x` |

**Catatan penting untuk PM:** dengan OAuth, konsep "sign up" dan "sign in" **melebur**. Tombol yang sama menghasilkan akun baru atau login ke akun lama tergantung apakah email sudah ada. Copywriting UI harus netral ("Lanjutkan dengan Google") supaya user nggak bingung. Ini bukan bug, ini cara kerja OAuth.

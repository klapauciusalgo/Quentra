# 08 — QA Test Plan

## 8.1 Environment matrix

| Environment | Supabase project | Google OAuth client | Redirect URI terdaftar |
|---|---|---|---|
| Local | dev | dev client | `http://127.0.0.1:54321/auth/v1/callback` |
| Staging | staging | staging client | `https://<staging-ref>.supabase.co/auth/v1/callback` |
| Production | prod | prod client | `https://<prod-ref>.supabase.co/auth/v1/callback` |

## 8.2 Browser / device matrix

Minimal yang wajib dites (semua test P0 dijalankan di sini):

| Browser | Platform | Kenapa penting |
|---|---|---|
| Chrome (terbaru) | Desktop | Baseline |
| Safari | macOS + iOS | **Paling penting** — ITP membatasi cookie pihak ketiga |
| Safari **Private mode** | iOS | Kasus PKCE verifier hilang (E-06) |
| Firefox (strict mode) | Desktop | Tracking protection |
| Chrome | Android | Baseline mobile |
| In-app browser | Instagram / TikTok / WhatsApp | Kasus `disallowed_useragent` (E-07) |
| Browser dengan cookie diblokir total | Desktop | Worst case |

## 8.3 Test case

### P0 — Blocker, harus lulus semua

| ID | Test | Expected |
|---|---|---|
| T-01 | User baru signup via Google (fresh browser, belum pernah login Google) | Akun jadi, row `profiles` ada, diarahkan ke dashboard |
| T-02 | User baru signup via Google (browser sudah login Google, 1 akun) | Mulus tanpa pilih akun (atau layar pilih akun muncul kalau `prompt=select_account`) |
| T-03 | User yang sama login lagi via Google | **Tidak** ada akun baru (verifikasi dengan query `auth.users`) |
| T-04 | **User lama email/password, login via Google dengan email sama (kedua email terverifikasi)** | Masuk ke akun lama, data lama utuh, `auth.identities` punya 2 row |
| T-05 | User lama email/password yang emailnya **belum terverifikasi**, login via Google | Pesan jelas (E-03), tidak ada akun duplikat yang dibuat diam-diam |
| T-06 | User cancel di consent screen | Balik ke halaman auth, belum login, pesan netral, bisa retry |
| T-07 | Logout lalu login lagi via Google | Berhasil, session baru bersih |
| T-08 | Deep link: buka `/settings/billing` belum login → login Google | Kembali ke `/settings/billing`, bukan dashboard |
| T-09 | Open redirect: `/login?next=https://evil.com` → login Google | Diarahkan ke `/dashboard` (bukan evil.com) |
| T-10 | Open redirect: `?next=//evil.com` | Ditolak, fallback internal |
| T-11 | Tombol Google di Safari iOS private mode | Login berhasil (uji E-06) |
| T-12 | Tombol Google di in-app browser Instagram | Muncul instruksi buka browser eksternal, bukan error mentah |
| T-13 | Trigger `handle_new_user`: signup, lalu cek `profiles` | Row ada, `full_name` & `avatar_url` terisi, `auth_providers = {google}` |
| T-14 | Backfill migration di DB dengan user lama | Semua user punya row `profiles`, 0 orphan |
| T-15 | Query anti-duplikat (`04.7`) setelah semua test | Semua mengembalikan 0 (kecuali sebaran provider) |
| T-16 | Logout → akses halaman terproteksi | Redirect ke login, **tidak ada flash konten** |
| T-17 | Cek bundle produksi | Tidak ada service role key / client secret |
| T-18 | RLS: `anon` coba select `profiles` | Ditolak / 0 row |
| T-19 | RLS: user A coba update row user B | Ditolak |
| T-20 | RLS: user coba `update profiles set auth_providers='{}'` dari client | Ditolak oleh trigger penjaga |

### P1 — Penting

| ID | Test | Expected |
|---|---|---|
| T-21 | Link Google dari Settings (user login via password) | `identity_linked` terkirim, Google muncul di daftar identity |
| T-22 | Unlink Google saat user punya 2 identity | Berhasil |
| T-23 | Unlink Google saat user punya **1** identity (akun dibuat via Google) | **Diblokir** dengan pesan jelas |
| T-24 | Dua tab klik Google bersamaan | Salah satu sukses, satu dapat pesan retry yang jelas (tidak stuck) |
| T-25 | Klik tombol Google saat sudah login | Tidak muncul / jadi aksi link |
| T-26 | User ganti nama & foto di Google, login lagi | Perilaku sesuai keputusan (default: metadata tidak berubah) |
| T-27 | Rate limit: paksa > limit percobaan login | Pesan 429 yang manusiawi |
| T-28 | Offline di tengah flow | Pesan koneksi, retry berhasil setelah online |
| T-29 | Admin: cek daftar identity user | Terlihat benar |
| T-30 | Sign out semua device | Session di device lain invalid |

### P2

| ID | Test | Expected |
|---|---|---|
| T-31 | User dengan 0 postingan / state kosong login Google | Tidak ada error di halaman kosong |
| T-32 | Aksesibilitas: navigasi keyboard + screen reader di tombol Google | Tombol fokusable, label terbaca |
| T-33 | Localization: pesan error di semua bahasa yang didukung | Tidak ada string yang kelewat / hardcoded |
| T-34 | `prefers-reduced-motion` pada state loading | Tidak ada animasi berlebihan |

## 8.4 Checklist pra-rilis

**Google Cloud:**
- [ ] Consent screen **dipublish** (bukan Testing)
- [ ] Privacy policy & terms URL terisi
- [ ] Branding + domain terverifikasi
- [ ] Authorized JavaScript origins & redirect URIs sesuai environment
- [ ] Client secret disimpan aman

**Supabase:**
- [ ] Google provider ON di prod
- [ ] Site URL = domain produksi
- [ ] Additional Redirect URLs = allowlist minimal (tanpa wildcard longgar di prod)
- [ ] Manual Linking ON
- [ ] Automatic identity linking ON
- [ ] Rate limit disesuaikan
- [ ] Migration trigger + backfill sudah dijalankan di prod
- [ ] Query anti-duplikat dijalankan setelah rilis

**App:**
- [ ] Event analytics terkirim & kebaca di dashboard
- [ ] Semua pesan error pakai copy dari `05.2`
- [ ] Fallback "masuk dengan email" tersedia di setiap halaman error
- [ ] Deteksi webview + instruksi buka browser
- [ ] Feature flag siap
- [ ] Runbook rollback sudah diuji di staging

## 8.5 Test akun yang harus disiapkan

| Akun | Kegunaan |
|---|---|
| `qa.google.1@gmail.com` (fresh, belum pernah pakai app) | T-01 |
| `qa.google.2@gmail.com` | T-03 |
| `qa.emailonly@gmail.com` — akun email/password lama, email terverifikasi | T-04 |
| `qa.unverified@gmail.com` — akun email/password, email **belum** terverifikasi | T-05 |
| Akun Google **beda email** dari akun platform | E-04 |
| Akun Google Workspace (kalau domain restriction diuji) | US-10 |
| Akun Google di device dengan 2+ akun Google login | Layar pilih akun |

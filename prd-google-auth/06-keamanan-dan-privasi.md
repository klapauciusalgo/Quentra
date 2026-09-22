# 06 — Keamanan, Privasi, dan Compliance

## 6.1 Threat model

| # | Ancaman | Vektor | Mitigasi | Sisa risiko |
|---|---|---|---|---|
| T-01 | **Account takeover lewat identity linking** | Penyerang bikin akun dengan email korban di provider yang nggak verifikasi email, lalu identitas itu ter-link ke akun korban | Supabase hanya auto-link kalau **email terverifikasi di kedua sisi**. Google selalu kirim `email_verified=true` untuk Gmail/Workspace, jadi ini relatif aman — tapi **jangan** aktifkan provider lain yang nggak verifikasi email tanpa review | Rendah |
| T-02 | **Open redirect** → phishing | `?next=https://evil.com` | Hanya terima `next` relatif (mulai `/`). Ada test case P0 | Sangat rendah |
| T-03 | **CSRF pada callback** | Penyerang bikin korban menyelesaikan flow dengan `code` milik penyerang | Dilindungi oleh `state` + PKCE (verifier disimpan di cookie first-party, hanya bisa dibaca browser korban) | Rendah |
| T-04 | **Session hijacking** | XSS baca token dari localStorage | SSR: session di cookie `httpOnly`. Kalau SPA: pertimbangkan migrasi ke cookie-based | Sedang (SPA) |
| T-05 | **Kebocoran client secret** | Secret masuk repo / log | Client secret Google **tidak ada** di app kita (ada di Supabase). Service role key server-only. Secret scanning di CI | Rendah |
| T-06 | **Privilege escalation lewat trigger** | `handle_new_user` tanpa `security definer`/`search_path` bisa disalahgunakan | `security definer set search_path = ''` + parameter eksplisit. Sudah di `04.6` | Rendah |
| T-07 | **User naikin kolom sensitif** | `update profiles set plan='pro'` dari client | RLS + trigger penjaga kolom; kolom sensitif idealnya di tabel terpisah dengan policy berbeda | Rendah |
| T-08 | **Enumeration email** | Pesan error beda untuk "email ada" vs "email nggak ada" | OAuth nggak bocorin ini, tapi pesan error di E-03 harus dijaga tetap netral. Perhatikan juga pesan signup email/password | Sedang |
| T-09 | **Credential stuffing** | Password leak dari situs lain | Google OAuth justru **ngurangin** permukaan ini. Tetap butuh rate limit + monitoring di jalur password | Sedang (jalur password) |
| T-10 | **Phishing via consent screen palsu** | User nggak bisa bedain consent screen asli vs palsu | Verifikasi brand + custom domain Supabase (`auth.example.com`), sehingga user lihat domain kita, bukan `xxxx.supabase.co` | Sedang |
| T-11 | **Webview attack** | In-app browser dimanipulasi | Blokir/menolak login dari webview (E-07) — Google juga sudah memblokir dari sisinya | Rendah |

## 6.2 Hal yang WAJIB diverifikasi sebelum rilis

- [ ] Auto-linking tidak bisa dipicu oleh email yang belum terverifikasi (uji dengan akun provider uji coba).
- [ ] `next` hanya menerima URL relatif — diuji dengan `?next=//evil.com` dan `?next=https://evil.com`.
- [ ] Cookie session `httpOnly`, `Secure`, `SameSite=Lax`.
- [ ] Service role key **tidak** ada di bundle client (cek dengan `grep` di hasil build).
- [ ] Client secret Google tidak ada di repo (cek git history, bukan cuma working tree).
- [ ] RLS aktif di semua tabel yang menyimpan data user; `anon` tidak bisa baca apa pun tanpa policy.
- [ ] Trigger `handle_new_user` jalan sebagai `security definer` dengan `search_path` dikunci.
- [ ] Tidak ada provider token Google yang disimpan di DB.

## 6.3 Compliance Google

| Item | Kewajiban | Status |
|---|---|---|
| **Privacy Policy URL** | Wajib diisi di consent screen; harus menjelaskan data apa yang diambil | ☐ |
| **Terms of Service URL** | Wajib diisi | ☐ |
| **Limited Use** | Data yang diperoleh dari Google API hanya boleh dipakai untuk fitur yang user lihat & setujui. Dilarang dijual atau dipakai untuk iklan/retargeting. | ☐ |
| **Domain verification** | Untuk branding + hilangkan warning "unverified app" | ☐ |
| **Scope minimal** | `openid`, `email`, `profile` saja. Scope sensitif (Drive/Gmail/Calendar) memicu proses verifikasi berhari-hari sampai berminggu-minggu | ☐ (sudah minimal) |
| **Consent screen dipublish** | Selama "Testing", hanya 100 test user yang bisa login | ☐ |
| **Data deletion** | Google mensyaratkan user bisa minta datanya dihapus | ☐ |

## 6.4 Data privacy — apa yang kita simpan

| Data | Sumber | Disimpan? | Alasan |
|---|---|---|---|
| `email` | Google claim | ✅ di `auth.users` + `profiles` | Identifier utama akun |
| `full_name` | Google claim | ✅ | Personalisasi UI |
| `avatar_url` | Google claim | ✅ (URL saja, bukan file) | UX |
| `sub` (Google user ID) | Google claim | ✅ di `auth.identities` (dikelola Supabase) | Identifier stabil untuk linking |
| `provider_token` / `provider_refresh_token` | Google | ❌ **tidak** | Kita nggak pakai Google API |
| Password Google user | — | ❌ tidak pernah terlihat | OAuth bukan password sharing |

**GDPR/UU PDP (kalau user kita ada di EU/Indonesia):**

- Basis hukum: **persetujuan** (user klik tombol dan menyetujui consent screen Google) + **pelaksanaan kontrak**.
- Google OAuth = data dari pihak ketiga. Masukkan ke privacy policy & data processing register.
- Hak user: akses, koreksi, hapus. **Wajib** ada jalur "Hapus akun" yang beneran menghapus (`auth.users` delete → cascade ke `profiles`). Pakai Edge Function dengan service role (`admin.deleteUser`), jangan pernah expose service role ke client.
- Jangan kirim email/nama user Google ke analytics pihak ketiga sebagai PII — pakai `user_id` (UUID) saja.

## 6.5 Audit & forensik

- Simpan log: `user_id`, `provider`, `event` (login/link/unlink/logout), `ip`, `user_agent`, `timestamp`.
- Supabase Auth menyediakan **auth audit logs** (ketersediaan tergantung plan) — kalau nggak tersedia di plan kita, kirim event ke logging sendiri.
- Retensi log: [isi sesuai kebijakan, default usulan 90 hari].
- Alert wajib: lonjakan `oauth_callback_failed`, lonjakan `unlink_identity`, dan **login sukses dari lokasi/ASN yang tidak wajar** untuk akun admin.

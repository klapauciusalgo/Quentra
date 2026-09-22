# 01 — Konteks, Tujuan, dan Metrik Sukses

## 1.1 Masalah

Platform saat ini cuma bisa dimasuki lewat email + password. Ini menimbulkan empat masalah konkret:

1. **Friction di registrasi.** User harus mikir password baru, sering kali nunggu email verifikasi, dan drop di tengah jalan. Setiap step tambahan = kebocoran konversi.
2. **Beban support "lupa password".** Reset password adalah tipe ticket yang paling sering muncul dan paling nggak ada nilainya buat bisnis.
3. **Password lemah & reuse.** Kalau kita longgarkan aturan password biar conversion naik, kita pindahin risiko ke keamanan akun. Kalau kita perketat, conversion turun. Ini trade-off yang nggak perlu ada.
4. **Friksi di mobile / in-app browser.** Ngetik password di webview HP itu nyiksa. User sering gagal di step ini.

## 1.2 Tujuan

**Tujuan utama (harus tercapai):**

| # | Tujuan | Kenapa |
|---|---|---|
| G1 | Nambah jalur registrasi & login lewat Google di semua entry point auth | Naikin conversion |
| G2 | User lama (email/password) bisa masuk lewat Google tanpa kehilangan data & tanpa bikin akun duplikat | Bikin fitur ini aman di-rollout ke base user yang sudah ada |
| G3 | Row di `profiles` (dan semua relasi downstream) tetap konsisten buat user baru maupun user lama | Fitur ini nggak boleh bikin data jadi setengah jadi |
| G4 | Semua jalur error bisa dijelaskan ke user dalam bahasa manusia + tercatat di analytics | Kalau gagal, kita harus tahu dan user harus tahu harus ngapain |

**Tujuan sekunder:**

- S5: Menyiapkan fondasi buat provider lain (Apple, GitHub) — pola identity + `profiles` yang sama.
- S6: Menyiapkan jalur ke Google API (Calendar/Drive) di masa depan tanpa refactor besar.

## 1.3 Non-goals (eksplisit DI LUAR scope)

- ❌ SAML / enterprise SSO.
- ❌ Provider selain Google (Apple, GitHub, Microsoft) — tapi desainnya harus memungkinkan.
- ❌ Migrasi dari email/password ke passwordless (magic link/OTP) — PRD terpisah.
- ❌ MFA / 2FA — PRD terpisah (catatan: Google account user mungkin sudah punya 2FA di sisi Google; itu di luar kendali kita dan bukan pengganti MFA kita sendiri).
- ❌ Ambil Google API scopes (Drive, Calendar, Gmail). Kita cuma butuh `openid`, `email`, `profile`. Kalau nanti butuh, itu PRD terpisah karena memicu proses verifikasi Google.
- ❌ Menghapus login email/password yang ada.
- ❌ Bikin user database / auth service sendiri (kita pakai Supabase Auth apa adanya).

## 1.4 Metrik sukses

Baseline diambil 14 hari sebelum rilis (tolong diisi dari dashboard analytics yang ada).

| Metrik | Baseline | Target | Cara ukur |
|---|---|---|---|
| Signup conversion (visitor → akun jadi) | — | **+15% relatif** dalam 30 hari | Funnel event (lihat `07`) |
| Auth success rate lewat Google | n/a | **≥ 98%** dari total `oauth_started` | `oauth_callback_success / oauth_started` |
| Median time-to-account | — | **< 20 detik** dari klik tombol Google sampai masuk dashboard | Timestamp event |
| Ticket "lupa password" | — | **−25%** dalam 60 hari | Ticketing system |
| Duplicate account akibat Google signup | n/a | **0** (nol) | Query DB, lihat `08` |
| P1 incident akibat auth (lockout massal, kebocoran akun) | n/a | **0** | Incident log |

**Guardrail metric (kalau memburuk → rollback):**

- Error rate `oauth_callback_failed` > 2% selama 1 jam → investigasi, > 5% → rollback.
- Ada laporan account takeover / user masuk ke akun orang lain → **rollback segera**, tanpa nunggu angka.

## 1.5 Definisi "Done"

Fitur dianggap selesai kalau:

1. Semua FR di `03` lulus acceptance criteria-nya.
2. Semua test case P0 di `08` hijau di **Chrome, Safari, Firefox, mobile Safari, mobile Chrome, dan minimal 1 in-app browser**.
3. Event analytics di `07` terkirim dan kebaca di dashboard.
4. Runbook rollback (`09`) sudah diuji minimal sekali di staging.
5. Ada dokumentasi internal: cara nambah provider baru + cara debug OAuth gagal.

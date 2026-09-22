# 09 — Rollout, Monitoring, dan Rollback

## 9.1 Fase rilis

| Fase | Scope | Durasi | Gate untuk lanjut |
|---|---|---|---|
| **F0 — Internal** | Aktifkan Google login untuk akun tim (5–10 orang) di **staging** | 1–2 hari | Semua test P0 hijau di staging |
| **F1 — Canary** | 5% user di produksi (feature flag), tombol muncul hanya untuk cohort ini | 2–3 hari | `oauth_callback_failed` < 1%, 0 duplikat akun, 0 ticket |
| **F2 — Ramp** | 25% → 50% | 3–5 hari | Metrik stabil, tidak ada regresi di funnel email/password |
| **F3 — GA** | 100% | — | Semua metrik di `01.4` terpenuhi |
| **F4 — Follow-up** | Settings linking (FR-19/20), provider mix di admin panel | +1 sprint | — |

**Kenapa canary dulu:** risiko terbesar fitur ini bukan bug teknis yang kelihatan, tapi **akun duplikat untuk user lama** (E-02/E-03). Itu baru kelihatan setelah ada volume nyata, dan mahal untuk dibersihkan setelah ribuan user terdampak.

## 9.2 Feature flag

Flag yang dibutuhkan:

| Flag | Fungsi |
|---|---|
| `auth_google_enabled` | Master switch — memunculkan/menyembunyikan tombol Google |
| `auth_google_rollout_pct` | Persentase user yang lihat tombol (hash `user_id`/device id, bukan random per request — biar konsisten) |
| `auth_google_linking_enabled` | Master switch untuk `linkIdentity`/`unlinkIdentity` di Settings |

**Catatan:** flag hanya mengontrol **UI**. Provider Google tetap ON di Supabase. Kalau kita butuh benar-benar mematikan login Google (bukan cuma menyembunyikan tombol), itu langkah darurat terpisah (§9.4).

## 9.3 Monitoring (yang dilihat tiap hari selama rilis)

1. `oauth_callback_failed` rate & top error code (real-time).
2. Jumlah row baru di `auth.users` vs hari biasa — lonjakan aneh bisa berarti akun duplikat.
3. Query anti-duplikat `04.7` — jalankan **harian** selama 2 minggu pertama.
4. Funnel drop-off (`07.2`) vs baseline.
5. Ticket support dengan kata kunci "google", "login", "akun baru", "data hilang".
6. Retensi D1/D7 user baru Google vs email/password.

## 9.4 Rollback

**Rollback ada 3 level — pilih yang paling ringan yang menyelesaikan masalah:**

| Level | Aksi | Efek | Waktu |
|---|---|---|---|
| **L1 — Sembunyikan tombol** | Set `auth_google_enabled = false` | User baru nggak bisa pakai Google. **User yang sudah punya akun Google tetap bisa masuk** (identity mereka sudah ada) | < 1 menit, tanpa deploy |
| **L2 — Matikan provider** | Nonaktifkan Google provider di Supabase Dashboard | Login Google gagal total untuk semua, termasuk user yang cuma punya identity Google → **mereka tidak bisa masuk** | < 2 menit |
| **L3 — Revert deploy** | Rollback deployment ke versi sebelumnya | Kembali ke state sebelum fitur | 5–15 menit |

⚠️ **L2 punya risiko lockout.** User yang mendaftar **hanya** lewat Google tidak punya password, jadi mereka kehilangan akses. Karena itu:
- Jangan pakai L2 kecuali ada insiden keamanan (account takeover).
- Kalau L2 terpaksa dipakai, langsung siapkan jalur pemulihan: kirim email "reset password / set password" ke semua user yang punya identity Google, supaya mereka punya cara masuk alternatif. Supabase punya flow recovery email untuk ini.
- **Ini alasan kenapa "user Google otomatis dikirimi jalur set password" layak dipertimbangkan** sebagai mitigasi permanen, bukan cuma saat insiden.

## 9.5 Kriteria rollback (eksplisit, jangan improvisasi saat panik)

Rollback **L1** kalau:
- `oauth_callback_failed` > 5% selama 15 menit.
- Ada laporan akun duplikat dari ≥ 2 user berbeda.
- Ada satu pun laporan user masuk ke akun orang lain (→ langsung **L2**, ini insiden keamanan).

Rollback **L2** kalau:
- Terkonfirmasi ada account takeover / cross-account access.
- Kebocoran client secret (rotasi + L2 bersamaan).

**Setelah rollback:** tulis post-mortem dalam 48 jam. Wajib ada: timeline, error code yang muncul, akar masalah, dan test case baru di `08` yang seharusnya menangkapnya.

## 9.6 Komunikasi

| Audiens | Kapan | Isi |
|---|---|---|
| Tim support | 3 hari sebelum F1 | FAQ: cara jawab "gue daftar pakai Google tapi akun gue kosong", cara cek identity user |
| User (in-app) | Saat F1 | Banner kecil "Sekarang bisa masuk pakai Google" (opsional, A/B test dampaknya) |
| User (email blast) | Setelah F3 | Pengumuman fitur + cara link akun lama |
| Semua | Kalau rollback | Pesan jujur kalau ada dampak, jangan diam |

## 9.7 Post-launch review (2 minggu setelah GA)

Yang harus dijawab dengan data:

1. Konversi naik berapa? (dengan A/B kalau ada)
2. Berapa % user baru pilih Google? Apakah sesuai ekspektasi?
3. Ada berapa akun duplikat, dan kenapa?
4. Error code apa yang masih muncul, dan apakah bisa dihilangkan?
5. Retensi user Google vs email/password — apakah berbeda signifikan?
6. Ticket "lupa password" turun berapa?
7. Apa yang harus diperbaiki sebelum nambah provider berikutnya (Apple/GitHub)?

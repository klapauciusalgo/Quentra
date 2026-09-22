# 02 — Persona, Jobs-to-be-Done, dan User Story

## 2.1 Persona

### P1 — "Rani", user baru (60% traffic)
Datang dari iklan/social media, buka di HP, niatnya cuma nyoba cepat. **Kalau dalam 30 detik belum bisa masuk, dia pergi.** Password = friksi yang nggak dia minta. Kemungkinan besar sudah login Google di HP-nya.

### P2 — "Bagas", user lama yang sudah punya akun email/password (25%)
Sudah pakai platform 3 bulan, login pakai email/password yang dia simpan di browser. Sekarang lihat tombol "Masuk dengan Google" dan kepikiran mau pakai itu karena lebih cepat. **Dia nggak mau kehilangan data/history-nya.** Ini persona paling berisiko — kalau salah handling, dia dapat akun kosong baru dan langsung churn + ngamuk ke support.

### P3 — "Sari", user yang email Google-nya beda dari email akun (10%)
Daftar pakai `sari@gmail.com`, tapi Google-nya `sari.kerja@gmail.com`. **Kita nggak boleh otomatis nyatuin dua akun ini.** Dia butuh jalur eksplisit buat nge-link (dari halaman Settings, saat sudah login).

### P4 — "Dimas", admin/ops (5%)
Butuh bisa ngeliat: user mana yang pakai Google, kapan terakhir login, dan bisa bantu user yang ke-lock. Butuh audit trail.

## 2.2 Jobs-to-be-done

| JTBD | Persona |
|---|---|
| "Biarin gue masuk dalam 2 tap tanpa mikir password" | P1 |
| "Gue mau cara login yang lebih cepat, tapi akun & data gue yang lama tetap sama" | P2 |
| "Gue mau akun Google kerja gue nyambung ke akun platform gue" | P3 |
| "Gue harus bisa jawab kalau user bilang 'gue nggak bisa masuk'" | P4 |

## 2.3 User story + acceptance criteria

Format: `Sebagai <persona>, gue mau <aksi>, supaya <manfaat>.`

---

### US-01 — Signup dengan Google (P1)
**Story:** Sebagai user baru, gue mau daftar pakai akun Google gue, supaya nggak perlu bikin password.

**Acceptance criteria:**
- [ ] Tombol "Lanjutkan dengan Google" ada di halaman Sign up, Sign in, dan modal auth — dengan posisi & styling yang konsisten (ikuti brand guideline Google untuk tombol Google).
- [ ] Klik tombol → pindah ke consent screen Google → kembali ke app dalam state **sudah login**.
- [ ] Row baru di `auth.users` + row baru di `public.profiles` tercipta, dengan `email`, `full_name`, `avatar_url` terisi dari Google.
- [ ] User diarahkan ke halaman tujuan awal (deep link preserved), bukan selalu ke dashboard.
- [ ] Tidak ada email verifikasi tambahan yang diminta (Google sudah memverifikasi emailnya).

### US-02 — Sign in dengan Google (P1)
**Story:** Sebagai user yang sudah pernah daftar pakai Google, gue mau masuk lagi dengan satu klik.

**Acceptance criteria:**
- [ ] Klik tombol → Google → kembali dalam state login, tanpa muncul layar pilih akun kalau browser masih punya session Google (kecuali user pilih `prompt=select_account`).
- [ ] Tidak ada user/akun baru yang dibuat (row count `auth.users` tidak bertambah).
- [ ] `last_sign_in_at` dan `last_seen_at` di `profiles` keupdate.

### US-03 — User lama email/password masuk lewat Google, data tetap utuh (P2) ⚠️ KRITIS
**Story:** Sebagai user lama dengan email/password, gue mau bisa masuk pakai Google tanpa kehilangan akun & data gue.

**Acceptance criteria:**
- [ ] Kalau email Google **sama dan terverifikasi** dengan email akun lama → Google identity otomatis ter-link ke user yang sama (Supabase automatic identity linking). User masuk ke akun lamanya.
- [ ] **Tidak ada** akun kedua yang dibuat. Ini harus diverifikasi dengan query DB, bukan cuma "kayaknya jalan".
- [ ] Semua data lama (subscription, riwayat, dsb) tetap terlihat.
- [ ] Setelah link, user bisa login lewat dua cara (password lama dan Google).
- [ ] Kalau email Google **beda** dari email akun lama → **JANGAN** auto-link. Munculkan akun terpisah, dan tawarkan opsi link eksplisit dari Settings (US-04).

### US-04 — Link akun Google ke akun yang sudah login (P3)
**Story:** Sebagai user yang sudah login, gue mau nyambungin akun Google gue, supaya besok-besok bisa masuk lebih cepat.

**Acceptance criteria:**
- [ ] Ada section "Metode Login" di halaman Settings yang menampilkan identity yang sudah terhubung (`getUserIdentities()`).
- [ ] Tombol "Hubungkan Google" → `linkIdentity({ provider: 'google' })` → setelah kembali, Google muncul sebagai identity terhubung.
- [ ] Tombol "Putuskan" (`unlinkIdentity`) hanya muncul kalau user punya **≥ 2 identity** (jangan sampai user mengunci diri sendiri di luar akun).
- [ ] Kalau manual linking belum diaktifkan di project → tampilkan error yang jelas, dan setting-nya harus sudah di-ON sebelum rilis (lihat `04`).

### US-05 — Logout
**Story:** Sebagai user, gue mau bisa keluar, supaya orang lain di device yang sama nggak bisa akses akun gue.

**Acceptance criteria:**
- [ ] Logout menghapus session di device ini (cookie/session dihapus).
- [ ] Ada opsi "Keluar dari semua device" (sign out scope global) di Settings.
- [ ] Setelah logout, halaman terproteksi redirect ke login, tidak ada flash konten terproteksi.

### US-06 — Cancel di tengah flow (P1)
**Story:** Sebagai user yang berubah pikiran, gue mau bisa batal tanpa ngerusak apa-apa.

**Acceptance criteria:**
- [ ] Klik "Cancel"/tutup consent screen Google → kembali ke halaman auth kita dalam keadaan **tidak login**, dengan pesan netral (bukan pesan error merah menakutkan).
- [ ] Tidak ada row user/profiles yang setengah jadi.
- [ ] User bisa langsung klik tombol Google lagi tanpa reload.

### US-07 — Error yang bisa dimengerti (semua persona)
**Story:** Sebagai user yang gagal login, gue mau tahu apa yang salah dan apa yang harus gue lakuin.

**Acceptance criteria:**
- [ ] Setiap kegagalan menampilkan pesan bahasa manusia + satu aksi berikutnya (lihat mapping di `05`).
- [ ] **Tidak ada** raw error, kode OAuth, atau stack trace yang tampil ke user.
- [ ] Error code tercatat di analytics dengan `error_code` dan `error_stage`.

### US-08 — Admin bisa lihat metode login user (P4)
**Story:** Sebagai admin, gue mau lihat user pakai provider apa, supaya bisa bantu debugging.

**Acceptance criteria:**
- [ ] Ada field di `profiles` atau view admin yang nunjukin provider aktif (mis. `auth_providers text[]`).
- [ ] Bisa search user by email dan lihat daftar identity-nya.

### US-09 — Deep link / redirect kembali ke tujuan awal (P1, P2)
**Story:** Sebagai user yang dikirim ke login dari halaman tertentu, gue mau balik ke halaman itu setelah login.

**Acceptance criteria:**
- [ ] `next`/`redirectTo` internal dipertahankan sepanjang flow.
- [ ] **Hanya** URL relatif/internal yang diterima — URL absolut ke domain lain harus ditolak (open redirect protection).

### US-10 — Domain restriction (opsional, tergantung keputusan bisnis)
**Story:** Sebagai owner, gue mau cuma orang dari domain kampus/perusahaan tertentu yang bisa daftar.

**Acceptance criteria (kalau diaktifkan):**
- [ ] Validasi domain dilakukan **di server**, dari claim email Google — bukan dari parameter `hd` di URL (param itu cuma hint buat layar pilih akun, bisa dimanipulasi).
- [ ] User dari domain terlarang dapat pesan yang jelas, dan tidak ada row user yang dibuat.

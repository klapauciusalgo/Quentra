# 07 — Metrik & Analytics

Tujuan bagian ini: **bisa jawab "fitur ini berhasil nggak?" dengan data, bukan feeling.**

## 7.1 Event yang harus dikirim

Semua event punya property dasar: `provider`, `timestamp`, `session_id`, `device_type`, `is_webview`, `user_id` (kalau sudah login).

| Event | Kapan | Property tambahan | Dipakai untuk |
|---|---|---|---|
| `auth_page_viewed` | Halaman/modal auth tampil | `entry_point` (`signup`/`login`/`modal`/`deeplink`) | Denominator konversi |
| `oauth_started` | User klik tombol Google | `entry_point` | Numerator step 1 |
| `oauth_redirect_out` | Redirect ke Google benar-benar terjadi | `duration_ms` | Deteksi gagal di sisi client |
| `oauth_callback_success` | `exchangeCodeForSession` sukses | `is_new_user` (bool), `duration_ms` | Success rate, konversi |
| `oauth_callback_failed` | Exchange gagal / ada `error` param | `error_code`, `error_stage` | Debugging, alert |
| `oauth_cancelled` | User cancel di consent screen | — | **Dipisah** dari failed |
| `identity_linked` | `linkIdentity` sukses | — | Adopsi fitur Settings |
| `identity_unlinked` | `unlinkIdentity` sukses | — | Deteksi anomali |
| `signout` | Logout | `scope` (`local`/`global`) | — |
| `auth_fallback_used` | User beralih ke email/password setelah gagal Google | `previous_error_code` | Ngukur seberapa sering Google gagal & user selamat |

**Catatan penting:** `oauth_cancelled` **jangan** dimasukkan ke perhitungan success rate. Kalau dicampur, angka success rate turun karena alasan yang salah dan kita bakal ngejar bug yang nggak ada.

## 7.2 Funnel utama

```
auth_page_viewed
   └─► oauth_started          (target: ≥ 40% dari page viewed)
         └─► oauth_callback_success  (target: ≥ 98% dari started, di luar cancel)
               └─► akun aktif / first meaningful action
```

**Drop-off yang perlu dipantau:**

| Drop-off | Artinya | Kalau jelek, cek |
|---|---|---|
| `page_viewed` → `started` rendah | Tombol nggak menarik / nggak kelihatan | Posisi, styling, copy, brand guideline Google |
| `started` → `callback_success` rendah | Masalah teknis (konfigurasi, cookie, webview) | `error_code` di `oauth_callback_failed` |
| `callback_success` → first action rendah | User masuk tapi bingung / diarahkan ke halaman salah | Handling `next`, onboarding |

## 7.3 Dashboard yang perlu dibuat

1. **Auth funnel harian** — 4 step di atas, split by `entry_point` dan `device_type`.
2. **Error breakdown** — top 10 `error_code` per hari, dengan tren. Error `redirect_uri_mismatch` dan `provider is not enabled` harus **nol** setelah rilis (kalau muncul = konfigurasi rusak).
3. **Webview share** — berapa % percobaan datang dari in-app browser (kalau > 10%, E-07 jadi prioritas tinggi).
4. **Provider mix** — Google vs email/password, per cohort mingguan.
5. **Cohort retention** — retensi user yang daftar via Google vs email/password. **Ini insight bisnis paling berharga dari fitur ini:** kalau user Google retensinya lebih tinggi, artinya kita bisa dorong Google sebagai jalur utama; kalau lebih rendah, kita dapat segmen "user kasual" yang perlu di-onboard beda.

## 7.4 Alert

| Kondisi | Severity | Aksi |
|---|---|---|
| `oauth_callback_failed` > 2% selama 15 menit | Warning | Cek error_code, cek konfigurasi |
| `oauth_callback_failed` > 5% selama 15 menit | **Critical** | Rollback (`09`) |
| `redirect_uri_mismatch` > 0 | **Critical** | Konfigurasi berubah/rusak — perbaiki segera |
| `oauth_started` = 0 selama 2 jam di jam sibuk | Critical | Tombol rusak / JS error |
| `identity_unlinked` spike tidak wajar | Warning | Bisa indikasi bug UX |
| Login sukses akun admin dari IP/geo baru | Critical | Investigasi keamanan |

## 7.5 Baseline yang harus diambil SEBELUM coding

Supaya perbandingannya valid, ambil dulu (14 hari terakhir):

- [ ] Signup conversion saat ini (visitor → akun jadi)
- [ ] Time-to-account median di jalur email/password
- [ ] Volume ticket "lupa password" per minggu
- [ ] Drop-off di tiap step form signup
- [ ] Retensi D7/D30 user yang daftar 30–90 hari lalu

Tanpa baseline, kita cuma bisa bilang "fitur ini jalan", bukan "fitur ini berhasil".

## 7.6 Hal yang harus dihindari saat ukur

- **Jangan** kirim email/nama sebagai PII ke analytics. Pakai `user_id` UUID.
- **Jangan** hitung `oauth_started` sebagai konversi — user yang batal tetap "started". Konversi = `callback_success` → akun dipakai.
- **Jangan** bandingkan minggu rilis dengan minggu sebelumnya tanpa memperhitungkan traffic (kampanye, hari libur). Pakai A/B test kalau memungkinkan: 50% user lihat tombol Google, 50% nggak. Ini satu-satunya cara klaim kausal yang jujur.

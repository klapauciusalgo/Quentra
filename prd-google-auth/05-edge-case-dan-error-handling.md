# 05 — Edge Case & Error Handling

Ini bagian yang paling sering dilewatkan dan paling sering jadi sumber incident. Setiap baris di bawah ini punya kemungkinan nyata terjadi di produksi.

## 5.1 Edge case

| # | Skenario | Yang terjadi | Handling yang benar | Prio |
|---|---|---|---|---|
| E-01 | User klik Cancel / tutup consent screen | Redirect balik tanpa `code`, ada `error=access_denied` | Kembali ke halaman auth, **tanpa login**, pesan netral: "Login dibatalkan." Jangan tampilkan error merah. | P0 |
| E-02 | Email Google **sama** dengan akun email/password lama, dua-duanya terverifikasi | Supabase auto-link identity ke user yang sama | ✅ Perilaku yang diinginkan. **Wajib diverifikasi dengan query DB** (`04.7`). Data lama tetap utuh. | P0 |
| E-03 | Email Google sama, tapi email akun lama **belum terverifikasi** | Auto-link **tidak** terjadi (kedua email harus verified). Risiko bikin akun duplikat | Tampilkan pesan: "Email ini sudah terdaftar. Masuk dulu dengan password, lalu hubungkan Google dari Settings." Jangan diam-diam bikin akun baru tanpa memberi tahu user. | P0 |
| E-04 | Email Google **beda** dari akun lama | Akun baru terpisah dibuat | Ini benar secara teknis. Tapi tawarkan jalur merge/link eksplisit dari Settings, dan jelaskan ke user bahwa ini akun baru. | P1 |
| E-05 | `redirect_uri_mismatch` (error dari Google) | Consent screen gagal, user lihat error Google | 99% kasus: redirect URI di Google Cloud ≠ callback Supabase, atau domain belum di-allowlist. Cek `04.2`. Untuk user: "Layanan login sedang bermasalah, coba lagi sebentar lagi." + alert ke tim. | P0 |
| E-06 | Cookie pihak ketiga diblokir (Safari ITP, Brave, Firefox strict, mode incognito) | PKCE code verifier hilang → error `invalid flow state` / `code verifier not found in storage` | **Kasus paling sering terjadi di produksi dan paling sering bikin bug report "kadang-kadang gagal".** Wajib: session disimpan di **cookie first-party** (`@supabase/ssr`), jangan di third-party iframe. Tes di Safari private mode. Pesan: "Sesi login kedaluwarsa, coba lagi." | P0 |
| E-07 | User klik tombol Google di **in-app browser** (webview Instagram/TikTok/FB/WhatsApp) | Google **memblokir** dengan `disallowed_useragent` | Deteksi webview (cek User-Agent: `FBAN`, `FBAV`, `Instagram`, `TikTok`, `Line`, `Twitter`) → tampilkan tombol "Buka di browser" (`window.open` / deep link ke sistem browser) + instruksi. **Jangan biarkan user mentok tanpa jalan keluar.** | P0 |
| E-08 | User buka dua tab, klik Google di dua-duanya | Tab kedua menimpa cookie PKCE tab pertama → tab pertama gagal exchange | Tangani error dengan pesan "Sesi login terputus, coba lagi." Idealnya: cegah klik ganda lewat flag di `sessionStorage`. | P1 |
| E-09 | User sudah login lalu klik tombol Google lagi | Supabase bikin session baru untuk user yang sama (atau bingung state) | Sembunyikan tombol Google kalau sudah login, atau ubah jadi aksi link (`linkIdentity`). | P0 |
| E-10 | User nge-link Google, tapi `linkIdentity` dipanggil tanpa session aktif | Error `manual_linking_disabled` atau gagal karena nggak ada session | Link **hanya** dari halaman Settings yang sudah login. Pastikan Manual Linking ON di dashboard. | P0 |
| E-11 | User unlink Google padahal itu satu-satunya cara login (akun dibuat via Google, nggak punya password) | **Lockout permanen** | Blokir `unlinkIdentity` kalau `identities.length < 2`. Wajib: user harus punya metode login cadangan dulu (set password) sebelum bisa unlink. | P0 |
| E-12 | Akun Google dihapus/di-suspend Google | Login gagal selamanya lewat jalur itu | Pastikan user masih bisa masuk pakai metode lain (password) kalau ada. Catat di UI Settings bahwa Google terhubung. | P1 |
| E-13 | Google account tanpa email (jarang, kasus Workspace tertentu) | Claim `email` kosong / tidak ada | Trigger `handle_new_user` harus tahan `null` email (`coalesce`). Tolak login kalau email benar-benar tidak ada, dengan pesan jelas. | P1 |
| E-14 | User ganti nama/foto di Google setelah signup | Metadata di `profiles` jadi stale | Ini **diharapkan** (kita cuma snapshot saat signup). Kalau mau selalu fresh: refresh saat login. Keputusan produk — default: snapshot, tidak refresh. | P2 |
| E-15 | Traffic spike (kampanye marketing) kena rate limit Supabase Auth | User dapat error 429 | Naikkan rate limit sebelum kampanye; monitoring alert; pesan: "Terlalu banyak percobaan, coba lagi sebentar lagi." | P1 |
| E-16 | Redirect ke domain penyerang (`?next=https://evil.com`) | Open redirect → phishing | **Hanya** izinkan `next` yang dimulai dengan `/`. Sudah ada di snippet `04.5c`. Wajib ada test case. | P0 |
| E-17 | User ganti device/browser, session hilang | Dikira akun hilang | Normal. Pastikan re-login mulus, dan tidak ada data yang bergantung pada localStorage semata. | P1 |
| E-18 | Domain restriction: user dari domain terlarang | Kalau validasi cuma di client, bisa dilewati | Validasi **di server** dari claim email (setelah session terbentuk), atau tolak di hook Supabase. Jangan andalkan parameter `hd` di URL — itu cuma hint untuk layar pilih akun, bisa dimanipulasi. | P0 (kalau FR diaktifkan) |
| E-19 | User menekan back button setelah sukses login | Balik ke halaman auth/consent dengan `code` yang sudah dipakai | Code PKCE sekali pakai. Tangani error exchange dengan redirect ke dashboard kalau ternyata sudah ada session valid. | P1 |
| E-20 | Consent screen masih status "Testing" di Google Cloud | Cuma 100 test user yang bisa login; user lain error `access_blocked` | **Publish consent screen sebelum rilis.** Masukkan ke checklist pra-rilis. | P0 |

## 5.2 Tabel mapping error → pesan user

Semua pesan ini yang muncul di UI. Error teknis cuma masuk ke log & analytics.

| Kode/sumber | Pesan UI | Aksi yang disarankan user |
|---|---|---|
| `access_denied` | "Login dengan Google dibatalkan." | — (netral, tombol aktif lagi) |
| `redirect_uri_mismatch` | "Layanan login sedang bermasalah. Tim kami sudah diberi tahu." | Coba lagi nanti / pakai email |
| `disallowed_useragent` | "Google memblokir login dari dalam aplikasi ini. Buka di browser (Chrome/Safari) untuk melanjutkan." | Tombol "Buka di browser" |
| `invalid flow state` / verifier hilang | "Sesi login kedaluwarsa. Coba lagi." | Klik tombol Google lagi |
| `email_exists` / akun sudah ada | "Email ini sudah terdaftar. Masuk dulu dengan password, lalu hubungkan Google dari Pengaturan." | Link ke halaman login |
| `manual_linking_disabled` | (internal, seharusnya nggak pernah ke user) | Bug → alert tim |
| `provider is not enabled` | "Login dengan Google belum tersedia." | Pakai email/password |
| `over_email_send_rate_limit` | "Terlalu banyak percobaan. Coba lagi dalam beberapa menit." | Tunggu |
| `access_blocked` (consent screen Testing) | "Login dengan Google belum tersedia untuk akun ini." | Pakai email/password + lapor tim |
| Network error / offline | "Koneksi terputus. Periksa jaringan lalu coba lagi." | Retry |
| Domain tidak diizinkan | "Akun dengan domain ini belum bisa mendaftar." | Kontak admin |

## 5.3 Aturan umum error handling

1. **Jangan pernah** tampilkan `error.message` mentah dari Supabase/Google ke user — bisa membocorkan konfigurasi internal.
2. Setiap error punya **satu** aksi berikutnya yang jelas. Error tanpa jalan keluar = user churn.
3. Error yang berasal dari kesalahan konfigurasi kita (`redirect_uri_mismatch`, `provider is not enabled`) harus memicu **alert ke tim**, bukan cuma pesan ke user.
4. `access_denied` (user cancel) **bukan** error di analytics. Jangan campur dengan kegagalan teknis — kalau dicampur, success rate-nya jadi kelihatan jelek dan kita salah ambil keputusan.
5. Semua halaman error harus punya fallback: "Masuk dengan email" selalu tersedia.

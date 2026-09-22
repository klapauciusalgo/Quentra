# 10 — Open Questions, Risiko, Dependency

## 10.1 Pertanyaan terbuka (harus dijawab sebelum coding)

| # | Pertanyaan | Kenapa penting | Owner | Jawaban |
|---|---|---|---|---|
| Q-01 | **Stack frontend-nya apa?** Next.js SSR, SPA (Vite/React), atau mobile (RN/Expo)? | Menentukan bentuk implementasi di `04` — cookie vs localStorage, callback route vs implicit flow | Eng | |
| Q-02 | Apakah sudah ada tabel `profiles`? Kalau ya, kolomnya apa saja? | Nama kolom & trigger harus menyesuaikan, jangan sampai duplikasi | Eng | |
| Q-03 | Berapa banyak user existing dan berapa yang emailnya **belum terverifikasi**? | Menentukan seberapa besar risiko E-03 (akun duplikat) | Eng/PM | |
| Q-04 | Apakah kita mau auto-link (masuk ke akun lama otomatis) atau **paksa** user konfirmasi dulu? | Auto-link = UX lebih enak, risiko kalau email belum verified. Manual = lebih aman, tapi nambah friksi | PM + Security | |
| Q-05 | Ada kebutuhan domain restriction (cuma email kampus/kantor)? | Kalau ya, butuh validasi server + UI error khusus | PM | |
| Q-06 | Apakah kita akan butuh akses Google API (Calendar/Drive/Gmail) nanti? | Kalau ya, jangan ambil scope-nya sekarang (memicu verifikasi), tapi desain penyimpanan token harus disiapkan | PM | |
| Q-07 | Apakah user yang daftar via Google harus dipaksa bikin password? | Kalau tidak, ada risiko lockout kalau Google account hilang | PM | |
| Q-08 | Bahasa dokumen & UI copy-nya Indonesia saja, atau multi-bahasa? | Menentukan string management | PM | |
| Q-09 | Ada kebijakan retensi data / kewajiban UU PDP yang spesifik? | Bagian `06.4` perlu disesuaikan | Legal | |
| Q-10 | Plan Supabase-nya apa? (Free/Pro) | Menentukan apakah auth audit logs & session management tersedia; free plan punya batasan | Eng | |
| Q-11 | Apakah perlu tombol Google di landing page publik juga (di luar halaman auth)? | Bisa naikin konversi, tapi nambah entry point yang harus dites | PM | |
| Q-12 | Siapa yang jadi owner konsol Google Cloud & siapa yang pegang secret-nya? | Single point of failure kalau cuma 1 orang tahu | PM/Eng | |

## 10.2 Risiko

| # | Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|---|
| R-01 | **Akun duplikat untuk user lama** (email beda, atau email belum terverifikasi) | Tinggi — user lihat data kosong, churn, ticket menumpuk | Sedang | Canary 5% dulu, query anti-duplikat harian, jalur merge manual untuk support |
| R-02 | Setup Google Cloud salah (redirect URI) → login mati total | Tinggi | Sedang | Checklist di `08.4`, uji di staging dulu, alert `redirect_uri_mismatch > 0` |
| R-03 | Consent screen lupa di-publish → user di luar 100 test user gagal | Tinggi | **Tinggi** (sering lupa) | Checklist pra-rilis, verifikasi dengan akun Google fresh sebelum F1 |
| R-04 | Cookie diblokir di Safari → flow gagal intermiten | Sedang | **Tinggi** | Cookie first-party via `@supabase/ssr`, tes Safari private mode di matrix |
| R-05 | User di in-app browser mentok | Sedang | **Tinggi** (kalau traffic dari sosmed besar) | Deteksi webview + tombol buka browser (E-07) |
| R-06 | Lockout user kalau provider dimatikan | Tinggi | Rendah | Hindari L2, siapkan jalur set-password, komunikasi |
| R-07 | Verifikasi brand Google lambat → consent screen jelek | Rendah | Sedang | Mulai proses verifikasi lebih awal (bisa berhari-hari), atau pakai custom domain Supabase |
| R-08 | Service role key bocor ke client | Kritis | Rendah | Cek bundle di CI, secret scanning, jangan pernah `NEXT_PUBLIC_` |
| R-09 | Rate limit Supabase kena saat kampanye | Sedang | Sedang | Naikkan limit sebelum kampanye, monitoring 429 |
| R-10 | User nggak paham sign in vs sign up (mengira bikin akun baru terus) | Sedang | Sedang | Copywriting netral "Lanjutkan dengan Google", onboarding jelas |

## 10.3 Dependency

| Dependency | Owner | Status | Blocking? |
|---|---|---|---|
| Akses Google Cloud Console (bikin OAuth client) | [isi] | ☐ | ✅ Blocking |
| Akses Supabase Dashboard (prod) | [isi] | ☐ | ✅ Blocking |
| Privacy policy & terms URL yang sudah live | Legal/Marketing | ☐ | ✅ Blocking (wajib untuk consent screen) |
| Keputusan Q-01 (stack) | Eng | ☐ | ✅ Blocking |
| Tooling analytics (event tracking) | Eng | ☐ | ⚠️ Blocking untuk F2+ |
| Channel support untuk FAQ | Support | ☐ | ❌ Tidak blocking |
| Budget (kalau plan Supabase perlu upgrade) | Finance | ☐ | ⚠️ Tergantung Q-10 |

## 10.4 Estimasi kasar

Angka di bawah ini **asumsi** dan harus dikoreksi setelah Q-01 dijawab. Basis: 1 engineer full-time, stack web SSR yang sudah ada.

| Workstream | Estimasi |
|---|---|
| Setup Google Cloud + Supabase (semua environment) | 0.5 hari |
| Konfigurasi consent screen + publish + verifikasi brand | 0.5 hari kerja + waktu tunggu Google (bisa beberapa hari, jalan paralel) |
| Implementasi flow (button, callback, middleware, session) | 1–2 hari |
| Migration DB (profiles, trigger, RLS, backfill) | 1 hari |
| Halaman error + copy + deteksi webview | 1 hari |
| Event analytics + dashboard | 1 hari |
| QA (matrix browser/device + edge case) | 2 hari |
| Rollout canary + monitoring | 3–5 hari (waktu kalender, bukan effort) |
| Settings linking (F4) | 1–2 hari |

**Total effort: ~8–10 hari engineering** + waktu tunggu eksternal (verifikasi Google, review legal).

## 10.5 Yang harus dikerjakan berikutnya (kalau PRD ini disetujui)

1. Jawab Q-01 s/d Q-12 — terutama Q-01 (stack) dan Q-04 (kebijakan linking).
2. Ambil baseline metrik (`07.5`) — harus selesai **sebelum** coding, kalau nggak kita nggak punya pembanding.
3. Cek jumlah user existing + status verifikasi email (Q-03) untuk menilai risiko R-01.
4. Mulai proses branding verification Google (jalan paralel, lama).
5. Bikin ticket/task breakdown dari `03` dan `08`.

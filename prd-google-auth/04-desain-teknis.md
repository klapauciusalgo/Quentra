# 04 — Desain Teknis

> Ditulis dengan asumsi **Next.js App Router + `@supabase/ssr`** (SSR, cookie-based). Catatan untuk SPA dan mobile ada di §4.9.

## 4.1 Arsitektur

```
┌──────────┐   1. klik tombol     ┌──────────────────────┐
│  Browser │ ───────────────────► │  Supabase Auth       │
│  (app)   │  signInWithOAuth     │  /auth/v1/authorize  │
└────┬─────┘                      └──────────┬───────────┘
     │                                       │ 2. redirect ke Google
     │                                       ▼
     │                            ┌──────────────────────┐
     │                            │ accounts.google.com  │
     │                            │ (consent screen)     │
     │                            └──────────┬───────────┘
     │                                       │ 3. callback ke
     │                                       │    <ref>.supabase.co/auth/v1/callback
     │                                       ▼
     │                            ┌──────────────────────┐
     │                            │  Supabase Auth       │ 4. tukar code→token
     │                            │  (GoTrue)            │    dengan Google
     │                            └──────────┬───────────┘
     │ 5. redirect ke redirectTo              │
     │    ?code=...                           │
     ▼                                        │
┌──────────────────────┐                      │
│  /auth/callback      │ ◄────────────────────┘
│  exchangeCodeForSession(code)
└──────┬───────────────┘
       │ 6. session disimpan di cookie (httpOnly), trigger DB bikin row profiles
       ▼
┌──────────────────────┐
│  App (authenticated) │
└──────────────────────┘
```

**Poin penting:** Supabase Auth adalah **relying party** yang menyimpan `client_secret` Google. App kita **tidak pernah** lihat client secret, tidak pernah tukar token langsung ke Google, dan tidak perlu implement OAuth sendiri. Yang kita pegang cuma URL + publishable key Supabase.

## 4.2 Setup Google Cloud (langkah manual, sekali per environment)

1. Buka **Google Cloud Console** → bikin/pilih project (mis. `myapp-auth`).
2. **Google Auth Platform → Audience**: pilih `External`. Isi nama app, email support, developer contact. Selama status masih **Testing**, cuma 100 test user yang bisa login — **publish sebelum rilis**.
3. **Data Access (Scopes)** — tambahkan:
   - `openid` (harus ditambah manual)
   - `.../auth/userinfo.email` (default)
   - `.../auth/userinfo.profile` (default)

   Tiga scope ini **non-sensitive**, jadi tidak memicu proses verifikasi Google yang panjang. **Jangan** tambah scope Drive/Gmail/Calendar di PRD ini.
4. **Clients → Create OAuth client ID** → Application type: **Web application**.
   - **Authorized JavaScript origins:** `https://app.example.com`, `http://localhost:3000`
   - **Authorized redirect URIs:** `https://<project-ref>.supabase.co/auth/v1/callback`
     (URL persisnya bisa di-copy dari Supabase Dashboard → Authentication → Providers → Google)
     Untuk dev lokal: `http://127.0.0.1:54321/auth/v1/callback`
   - ⚠️ Yang masuk ke sini adalah **callback Supabase**, bukan `/auth/callback` milik app kita. Ini kesalahan setup #1 yang paling sering terjadi dan gejalanya `redirect_uri_mismatch`.
5. Simpan **Client ID** dan **Client Secret**.
6. **Branding**: isi nama app + logo, verifikasi domain. Kalau nggak, user akan lihat `xxxx.supabase.co` di consent screen — jelek dan bikin orang curiga (meningkatkan risiko phishing). Alternatif: pakai **custom domain** Supabase (`auth.example.com`).

## 4.3 Setup Supabase

1. **Authentication → Providers → Google**: aktifkan, isi Client ID + Client Secret.
2. **Authentication → URL Configuration**:
   - `Site URL`: `https://app.example.com`
   - `Additional Redirect URLs`:
     ```
     http://localhost:3000/**
     https://*-<team>.vercel.app/**        (kalau pakai Vercel preview)
     https://staging.example.com/**
     https://app.example.com/auth/callback   ← sebaiknya exact di produksi
     ```
     Wildcard `**` boleh untuk dev/preview, tapi di produksi pakai URL exact (rekomendasi resmi Supabase).
3. **Authentication → Settings → Security and Protection**: aktifkan **Manual Linking** (dibutuhkan FR-19). Defaultnya OFF, dan error `manual_linking_disabled` muncul kalau lupa.
4. Pastikan **automatic identity linking** aktif (default ON) — ini yang bikin US-03 jalan.
5. **Auth → Rate Limits**: catat limit default untuk sign-in/sign-up; naikkan kalau perlu sebelum kampanye marketing (jangan sampai traffic spike malah kena rate limit).

## 4.4 Environment variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
# ⛔ TIDAK PERNAH di client:
# SUPABASE_SERVICE_ROLE_KEY=...   (server-only, jangan prefix NEXT_PUBLIC)
```

Client secret Google **tidak ada** di app kita — cuma ada di dashboard Supabase. Itu memang tujuannya.

## 4.5 Snippet implementasi

### a. Supabase client (SSR)

```ts
// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // dipanggil dari Server Component — diabaikan, middleware yang refresh
          }
        },
      },
    }
  )
}
```

### b. Tombol Google (client component)

```tsx
'use client'
import { createBrowserClient } from '@supabase/ssr'

export function GoogleButton({ next = '/dashboard', label = 'Lanjutkan dengan Google' }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )

  async function onClick() {
    track('oauth_started', { provider: 'google', stage: 'button_click' })
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: 'select_account' }, // biar user bisa pilih akun
      },
    })
    if (error) track('oauth_start_failed', { provider: 'google', error_code: error.message })
  }

  return <button onClick={onClick}>{label}</button>
}
```

### c. Callback route (PKCE exchange)

```ts
// app/auth/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error')

  let next = searchParams.get('next') ?? '/dashboard'
  if (!next.startsWith('/')) next = '/dashboard'   // ⛔ blokir open redirect

  if (errorParam) {
    trackServer('oauth_callback_failed', { error_code: errorParam })
    return NextResponse.redirect(`${origin}/auth/error?reason=${errorParam}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      trackServer('oauth_callback_success', { provider: 'google' })
      const host = request.headers.get('x-forwarded-host')
      const base = process.env.NODE_ENV === 'development' || !host ? origin : `https://${host}`
      return NextResponse.redirect(`${base}${next}`)
    }
    trackServer('oauth_callback_failed', { error_code: error.code ?? 'exchange_failed' })
  }

  return NextResponse.redirect(`${origin}/auth/error?reason=code_exchange`)
}
```

### d. Middleware refresh session

```ts
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })
  // ⚠️ JANGAN taruh kode apa pun di antara createServerClient dan getUser —
  // bisa bikin session tidak ter-refresh secara acak (jebakan resmi dari dokumentasi Supabase).
  await supabase.auth.getUser()
  return response
}
```

## 4.6 Skema database

### Tabel `profiles` (kalau belum ada / disesuaikan)

```sql
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  avatar_url      text,
  auth_providers  text[] default '{}',   -- FR-22, buat admin & analytics
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  last_seen_at    timestamptz
);
```

### Trigger auto-create profile (FR-16)

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, auth_providers)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    array(select distinct i.provider from auth.identities i where i.user_id = new.id)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

> `security definer` + `set search_path = ''` itu wajib: tanpa itu, fungsi ini jalan sebagai user yang bikin trigger dan bisa jadi celah privilege escalation.

### Trigger update provider saat identity baru di-link (FR-19/22)

```sql
create or replace function public.handle_identity_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
     set auth_providers = (select array_agg(distinct i.provider)
                             from auth.identities i where i.user_id = coalesce(new.user_id, old.user_id)),
         updated_at = now()
   where p.id = coalesce(new.user_id, old.user_id);
  return null;
end; $$;

create trigger on_identity_change
  after insert or delete on auth.identities
  for each row execute function public.handle_identity_change();
```

### Backfill user lama (FR-17)

```sql
insert into public.profiles (id, email, full_name, avatar_url)
select u.id, u.email,
       u.raw_user_meta_data->>'full_name',
       u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```

### RLS

```sql
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ⚠️ Kolom sensitif (plan, role, quota) JANGAN bisa di-update dari client.
-- Pakai trigger penjaga atau pisahkan ke tabel lain:
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if auth.uid() = new.id and (
       new.auth_providers is distinct from old.auth_providers
    or new.email          is distinct from old.email
  ) then
    raise exception 'column not updatable from client';
  end if;
  return new;
end; $$;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
```

## 4.7 Verifikasi anti-duplikat (wajib, bukan opsional)

Setelah implementasi, jalankan query ini di staging **dan** produksi setelah rilis:

```sql
-- 1) Harus 0: user dengan email sama tapi id berbeda
select lower(email), count(*)
from auth.users
group by 1 having count(*) > 1;

-- 2) Harus 0: user tanpa row profiles
select count(*) from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 3) Sebaran provider (buat lihat adopsi)
select provider, count(*) from auth.identities group by 1 order by 2 desc;

-- 4) User yang punya >1 identity (hasil linking) — sanity check
select user_id, count(*) from auth.identities group by 1 having count(*) > 1;
```

## 4.8 Perilaku provider token (penting)

- Session yang kita simpan adalah **token Supabase**, bukan token Google.
- `provider_token` (token Google) **hanya tersedia saat pertama kali sign-in** dan tidak disimpan Supabase. Kalau nanti butuh akses Google API, ambil dari `exchangeCodeForSession` dan simpan **terenkripsi**, plus tambahkan `queryParams: { access_type: 'offline', prompt: 'consent' }` supaya dapat `provider_refresh_token`.
- Untuk PRD ini: **jangan simpan provider token sama sekali.** Kita nggak butuh, dan makin sedikit PII/token yang kita simpan makin baik.

## 4.9 Variasi stack

### SPA (Vite + React)
- Pakai `createClient` dari `@supabase/supabase-js` biasa (session di localStorage) — **atau lebih baik** `@supabase/ssr` dengan cookie kalau ada backend.
- Flow default SPA adalah **implicit**; `signInWithOAuth` langsung redirect balik dengan token di hash. Tidak perlu route callback sendiri, tapi `redirectTo` tetap harus masuk allowlist.
- Handler: `supabase.auth.onAuthStateChange((event, session) => ...)` untuk update state UI.
- ⚠️ Token di localStorage rentan XSS. Kalau ada backend, migrasi ke cookie-based.

### React Native / Expo
- Pakai `signInWithOAuth({ provider: 'google', options: { redirectTo: 'myapp://auth-callback', skipBrowserRedirect: true } })` + `expo-web-browser` (`openAuthSessionAsync`) atau `expo-auth-session`.
- Alternatif yang lebih mulus di iOS/Android: pakai **native Google Sign-In** → ambil `idToken` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`. Ini menghindari browser sama sekali.
- Butuh **client ID terpisah** untuk iOS/Android, dan client ID web harus ditaruh **pertama** saat menggabungkan beberapa client ID di konfigurasi.
- Deep link scheme harus masuk allowlist redirect URL Supabase.

### Multiple environment
Tiap project Supabase (dev/staging/prod) punya callback URL berbeda (`<ref>` beda). Dua opsi:
- **Satu OAuth client Google** dengan 3 redirect URI terdaftar — lebih simpel, tapi satu secret dipakai bersama.
- **Satu OAuth client per environment** — lebih aman, lebih rapi, direkomendasikan. Konsekuensinya: nama app di consent screen muncul beberapa kali di akun Google developer.

## 4.10 Yang TIDAK kita bangun (dan alasannya)

| Tidak dibangun | Alasan |
|---|---|
| OAuth handler sendiri | Supabase Auth sudah handle state, PKCE, token exchange, rotasi refresh token, reuse detection |
| Tabel `users` sendiri | Sumber kebenaran ada di `auth.users`; duplikasi bikin drift |
| Endpoint `/api/auth/google/callback` sendiri | Callback Google diarahkan ke Supabase, bukan ke kita |
| Verifikasi email setelah Google login | Google sudah memverifikasi (`email_verified`); minta verifikasi lagi = friksi tanpa manfaat |

-- ==========================================================
-- Quentra Algorithmic Trading Platform — Supabase SQL Schema
-- ==========================================================

-- 1. Strategies Catalog Table
CREATE TABLE IF NOT EXISTS public.strategies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('LONG', 'SHORT')),
    timeframe TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    win_rate_pct NUMERIC NOT NULL,
    total_return_pct NUMERIC NOT NULL,
    profit_factor NUMERIC NOT NULL,
    max_drawdown_pct NUMERIC NOT NULL,
    trades_count INTEGER NOT NULL,
    sharpe_ratio NUMERIC,
    parameters JSONB DEFAULT '{}'::jsonb,
    yoy_stats JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Strategy Trades History Table
CREATE TABLE IF NOT EXISTS public.strategy_trades (
    id BIGSERIAL PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES public.strategies(id) ON DELETE CASCADE,
    trade_no INTEGER NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL', 'LONG', 'SHORT')),
    entry_time TIMESTAMPTZ NOT NULL,
    exit_time TIMESTAMPTZ,
    entry_price NUMERIC NOT NULL,
    exit_price NUMERIC,
    net_return_pct NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'CLOSED',
    exit_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by strategy and timestamp
CREATE INDEX IF NOT EXISTS idx_strategy_trades_strat_id ON public.strategy_trades(strategy_id);
CREATE INDEX IF NOT EXISTS idx_strategy_trades_entry_time ON public.strategy_trades(entry_time);

-- 3. Live Dispatched Signals & Audit Log Table
CREATE TABLE IF NOT EXISTS public.live_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT REFERENCES public.strategies(id) ON DELETE SET NULL,
    symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
    signal_type TEXT NOT NULL, -- 'ENTRY_LONG', 'ENTRY_SHORT', 'EXIT_LONG', 'EXIT_SHORT', 'DISPATCH_TEST'
    price NUMERIC NOT NULL,
    confidence_pct NUMERIC DEFAULT 100,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Preferences & Terminal State Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_identifier TEXT UNIQUE NOT NULL DEFAULT 'default_user',
    selected_strategy_id TEXT DEFAULT 'pippo-1h-enhanced',
    active_timeframe TEXT DEFAULT '1h',
    audio_enabled BOOLEAN DEFAULT true,
    hud_position JSONB DEFAULT '{"x": null, "y": null}'::jsonb,
    marker_label_mode TEXT DEFAULT 'compact',
    show_price_levels BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Allow Public Read Access (for traders viewing public dashboard)
CREATE POLICY "Public read strategies" ON public.strategies FOR SELECT USING (true);
CREATE POLICY "Public read strategy_trades" ON public.strategy_trades FOR SELECT USING (true);
CREATE POLICY "Public read live_signals" ON public.live_signals FOR SELECT USING (true);
CREATE POLICY "Public read user_preferences" ON public.user_preferences FOR SELECT USING (true);

-- Allow Service Role Full Access (Backend writes)
CREATE POLICY "Service role write strategies" ON public.strategies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role write strategy_trades" ON public.strategy_trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role write live_signals" ON public.live_signals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role write user_preferences" ON public.user_preferences FOR ALL USING (true) WITH CHECK (true);

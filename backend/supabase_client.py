#!/usr/bin/env python3
"""
Supabase Database Client for Quentra Platform.
Provides database access for strategies, trades, live signals, and preferences.
Gracefully falls back to local storage if Supabase credentials are not provided.
"""

import os
import logging
from typing import Optional, List, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("supabase_client")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

_client = None

def get_supabase():
    global _client
    if _client is not None:
        return _client
    
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if url and key:
        try:
            from supabase import create_client
            _client = create_client(url, key)
            logger.info(f"Supabase client initialized for project {url}")
            return _client
        except Exception as e:
            logger.error(f"Failed to initialize Supabase client: {e}")
            return None
    return None

def fetch_strategies_from_db() -> Optional[List[Dict[str, Any]]]:
    """Fetch all active strategies and their trades from Supabase."""
    sb = get_supabase()
    if not sb:
        return None

    try:
        # Fetch strategies
        res = sb.table("strategies").select("*").order("win_rate_pct", desc=True).execute()
        strategies = res.data or []

        # Fetch trades for each strategy
        for strat in strategies:
            trades_res = (
                sb.table("strategy_trades")
                .select("*")
                .eq("strategy_id", strat["id"])
                .order("trade_no")
                .execute()
            )
            strat["trades"] = trades_res.data or []

        return strategies
    except Exception as e:
        logger.error(f"Error reading strategies from Supabase: {e}")
        return None

def record_live_signal(signal: Dict[str, Any]) -> bool:
    """Audit log a newly generated or dispatched live signal."""
    sb = get_supabase()
    if not sb:
        return False

    try:
        sb.table("live_signals").insert({
            "strategy_id": signal.get("strategy_id"),
            "symbol": signal.get("symbol", "BTCUSDT"),
            "signal_type": signal.get("type", "SIGNAL"),
            "price": float(signal.get("price", 0)),
            "confidence_pct": float(signal.get("confidence", 100)),
            "details": signal
        }).execute()
        return True
    except Exception as e:
        logger.warning(f"Failed to record live signal in Supabase: {e}")
        return False

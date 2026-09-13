#!/usr/bin/env python3
"""
Seed Supabase with Quentra Algorithmic Strategies & Trades.
Reads backend/data/strategies.json and populates public.strategies & public.strategy_trades.
"""

import os
import sys
import json
import logging
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_supabase")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Please set SUPABASE_URL and SUPABASE_KEY environment variables.")
    print("Usage: SUPABASE_URL='https://xxx.supabase.co' SUPABASE_KEY='eyJ...' python3 seed_supabase.py")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

DATA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "strategies.json")

def seed():
    if not os.path.exists(DATA_PATH):
        logger.error(f"Data file not found at {DATA_PATH}")
        return

    with open(DATA_PATH, "r") as f:
        strategies = json.load(f)

    logger.info(f"Loaded {len(strategies)} strategies from {DATA_PATH}")

    for strat in strategies:
        trades = strat.get("trades", [])
        
        # 1. Upsert Strategy Record
        strat_record = {
            "id": strat["id"],
            "name": strat["name"],
            "short_name": strat.get("short_name", strat["name"]),
            "type": strat["type"],
            "timeframe": strat["timeframe"],
            "category": strat.get("category", "Quantitative Model"),
            "status": strat.get("status", "ACTIVE"),
            "win_rate_pct": float(strat.get("win_rate_pct", 0)),
            "total_return_pct": float(strat.get("total_return_pct", 0)),
            "profit_factor": float(strat.get("profit_factor", 1.0)),
            "max_drawdown_pct": float(strat.get("max_drawdown_pct", 0)),
            "trades_count": int(strat.get("trades_count", len(trades))),
            "sharpe_ratio": float(strat.get("sharpe_ratio", 1.0)) if strat.get("sharpe_ratio") else None,
            "parameters": strat.get("parameters", {}),
            "yoy_stats": strat.get("yoy_stats", [])
        }

        logger.info(f"Upserting strategy: {strat['name']} ({strat['id']})...")
        res = supabase.table("strategies").upsert(strat_record).execute()

        # 2. Insert Trades in Chunks of 100
        if trades:
            logger.info(f"  Uploading {len(trades)} trades for {strat['id']}...")
            trades_to_insert = []
            for tr in trades:
                trades_to_insert.append({
                    "strategy_id": strat["id"],
                    "trade_no": int(tr.get("trade_no", 1)),
                    "side": tr.get("side", strat["type"]),
                    "entry_time": tr.get("entry_time"),
                    "exit_time": tr.get("exit_time") if not str(tr.get("exit_time")).startswith("ACTIVE") else None,
                    "entry_price": float(tr.get("entry_price", 0)),
                    "exit_price": float(tr.get("exit_price")) if tr.get("exit_price") else None,
                    "net_return_pct": float(tr.get("net_return_pct", 0)),
                    "status": tr.get("status", "CLOSED"),
                    "exit_reason": tr.get("exit_reason", "")
                })

            # Chunk into batches of 100
            for i in range(0, len(trades_to_insert), 100):
                chunk = trades_to_insert[i:i+100]
                supabase.table("strategy_trades").upsert(chunk).execute()

    logger.info("✅ All strategies and trades seeded to Supabase successfully!")

if __name__ == "__main__":
    seed()

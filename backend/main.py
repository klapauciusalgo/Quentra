#!/usr/bin/env python3
"""
Quentra Backend Server.
FastAPI Application providing:
- Binance WebSocket live streaming (ticker + klines)
- Multi-timeframe BTCUSDT historical datasets (30m, 1h, 4h, 1D, 1W)
- Strategy Catalog with full performance metrics, trade logs, and chart execution markers
- Trading Floor interactive state engine
- Static files hosting for production React frontend build
"""

import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from binance_ws import binance_manager
from pixel_floor import floor_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("quentra_server")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FRONTEND_DIST_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")

import numpy as np
import pandas as pd
import bisect

# In-memory datasets cache
KLINES_CACHE = {}
KLINES_CACHE_ETH = {}
STRATEGIES_CATALOG = []
STRATEGIES_MAP = {}
STRATEGIES_CATALOG_ETH = []
STRATEGIES_MAP_ETH = {}
PARQUET_DFS = {}
PARQUET_TIMESTAMPS = {}
PARQUET_DFS_ETH = {}
PARQUET_TIMESTAMPS_ETH = {}

def load_data_into_memory():
    global KLINES_CACHE, KLINES_CACHE_ETH, STRATEGIES_CATALOG, STRATEGIES_MAP, STRATEGIES_CATALOG_ETH, STRATEGIES_MAP_ETH
    global PARQUET_DFS, PARQUET_TIMESTAMPS, PARQUET_DFS_ETH, PARQUET_TIMESTAMPS_ETH
    
    # 1. Load Parquets for full historical coverage (2020-2026)
    new_analysis_dir = "/home/ubuntu/new-btc-analysis/data"
    analysis_dir = "/home/ubuntu/BTC-analysis/data"
    for tf in ["30m", "1h", "4h", "1d", "1w"]:
        p = os.path.join(DATA_DIR, f"BTCUSDT_{tf}.parquet")
        if not os.path.exists(p):
            p = os.path.join(new_analysis_dir, f"BTCUSDT_{tf}.parquet")
        if not os.path.exists(p):
            p = os.path.join(analysis_dir, f"BTCUSDT_{tf}.parquet")
        if os.path.exists(p):
            try:
                df = pd.read_parquet(p)
                
                # Auto-backfill any missing closed bars from Binance REST API
                try:
                    import time
                    from binance_ws import fetch_binance_klines_rest
                    now_ms = int(time.time() * 1000)
                    last_ts = int(df["timestamp"].iloc[-1]) if "timestamp" in df.columns else (int(df["time"].iloc[-1]) * 1000)
                    gap_thresholds = {"30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000, "1w": 604800000}
                    if now_ms - last_ts > gap_thresholds.get(tf, 1800000):
                        new_bars = fetch_binance_klines_rest("BTCUSDT", tf, limit=1000, start_time=last_ts + 1)
                        closed_bars = [b for b in new_bars if b.get("close_time", 0) < now_ms]
                        if closed_bars:
                            df_new = pd.DataFrame(closed_bars)
                            df = pd.concat([df, df_new], ignore_index=True).drop_duplicates(subset=["timestamp"]).reset_index(drop=True)
                            for w in [8, 25, 50, 55, 111]:
                                if len(df) >= w:
                                    df[f"MA{w}"] = df["close"].rolling(w).mean()
                            logger.info(f"Backfilled {len(closed_bars)} live candles for {tf} up to {df['datetime'].iloc[-1]}")
                except Exception as ex_bf:
                    logger.debug(f"Backfill gap skipped for {tf}: {ex_bf}")

                PARQUET_DFS[tf] = df
                if "timestamp" in df.columns:
                    PARQUET_TIMESTAMPS[tf] = (df["timestamp"] // 1000).values
                elif "time" in df.columns:
                    PARQUET_TIMESTAMPS[tf] = df["time"].values
                logger.info(f"Loaded {len(df)} historical bars for timeframe {tf}")
            except Exception as e:
                logger.warning(f"Could not load parquet for {tf}: {e}")

    # 2. Load JSON cache or serialize directly from updated data
    klines_path = os.path.join(DATA_DIR, "klines_cache.json")
    if os.path.exists(klines_path):
        with open(klines_path, "r") as f:
            KLINES_CACHE = json.load(f)

    # Refresh KLINES_CACHE with latest closed bars from PARQUET_DFS
    for tf, df_p in PARQUET_DFS.items():
        sub = df_p.tail(5000)
        c_list = []
        for _, r in sub.iterrows():
            ts_sec = int(r["timestamp"] / 1000) if "timestamp" in r and r["timestamp"] > 1e11 else int(r.get("time", r.get("timestamp", 0)))
            c_list.append({
                "time": ts_sec,
                "datetime": str(r.get("datetime", "")),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r.get("volume", 0.0)),
                "ma8": float(r["MA8"]) if "MA8" in r and not pd.isna(r["MA8"]) else None,
                "ma25": float(r["MA25"]) if "MA25" in r and not pd.isna(r["MA25"]) else None,
                "ma50": float(r["MA50"]) if "MA50" in r and not pd.isna(r["MA50"]) else None,
                "ma55": float(r["MA55"]) if "MA55" in r and not pd.isna(r["MA55"]) else None,
                "ma111": float(r["MA111"]) if "MA111" in r and not pd.isna(r["MA111"]) else None,
            })
        KLINES_CACHE[tf] = c_list
    logger.info(f"Synchronized live klines cache for timeframes: {list(KLINES_CACHE.keys())}")

    # 3. Load strategy catalog (load local strategies.json with full rich data & markers, enrich with Supabase)
    strat_path = os.path.join(DATA_DIR, "strategies.json")
    local_catalog = []
    if os.path.exists(strat_path):
        with open(strat_path, "r") as f:
            local_catalog = json.load(f)

    try:
        from supabase_client import fetch_strategies_from_db
        sb_strategies = fetch_strategies_from_db()
        if sb_strategies and len(sb_strategies) > 0:
            local_map = {s["id"]: s for s in local_catalog}
            merged = []
            for sb_s in sb_strategies:
                sid = sb_s["id"]
                base_s = local_map.get(sid, {})
                combined = {**base_s, **sb_s}
                
                # Ensure rich metadata is preserved from base
                for field in ["markers", "logic_summary", "badge", "archetype", "recommended_for", "yearly_stats", "parameters"]:
                    if not combined.get(field) and base_s.get(field):
                        combined[field] = base_s[field]

                # Ensure metrics dict is fully populated with authoritative base calculations
                base_metrics = base_s.get("metrics") or {}
                m = combined.get("metrics") or {}
                combined["metrics"] = {
                    "total_return_pct": base_metrics.get("total_return_pct") if base_metrics.get("total_return_pct") is not None else (m.get("total_return_pct") or combined.get("total_return_pct", 0)),
                    "win_rate_pct": base_metrics.get("win_rate_pct") if base_metrics.get("win_rate_pct") is not None else (m.get("win_rate_pct") or combined.get("win_rate_pct", 0)),
                    "profit_factor": base_metrics.get("profit_factor") if base_metrics.get("profit_factor") is not None else (m.get("profit_factor") or combined.get("profit_factor", 1.0)),
                    "max_drawdown_pct": base_metrics.get("max_drawdown_pct") if base_metrics.get("max_drawdown_pct") is not None else (m.get("max_drawdown_pct") or combined.get("max_drawdown_pct", 0)),
                    "total_trades": base_metrics.get("total_trades") if base_metrics.get("total_trades") is not None else (m.get("total_trades") or combined.get("trades_count", len(combined.get("trades", [])))),
                    "cagr_pct": base_metrics.get("cagr_pct", 0),
                    "calmar_ratio": base_metrics.get("calmar_ratio", 1.0),
                    "win_trades": base_metrics.get("win_trades", 0),
                    "loss_trades": base_metrics.get("loss_trades", 0),
                    "avg_win_pct": base_metrics.get("avg_win_pct", 0),
                    "avg_loss_pct": base_metrics.get("avg_loss_pct", 0),
                    "best_trade_pct": base_metrics.get("best_trade_pct", 0),
                    "worst_trade_pct": base_metrics.get("worst_trade_pct", 0),
                }
                combined["yearly_stats"] = base_s.get("yearly_stats", [])
                combined["total_return_pct"] = combined["metrics"]["total_return_pct"]
                combined["win_rate_pct"] = combined["metrics"]["win_rate_pct"]
                combined["profit_factor"] = combined["metrics"]["profit_factor"]
                # Deduplicate trades by trade_no (union base local trades + Supabase trades)
                unique_trades = {}
                raw_trades = (base_s.get("trades") or []) + (combined.get("trades") or [])
                for tr in raw_trades:
                    t_no = tr.get("trade_no")
                    if tr.get("status") in ["RUNNING", "OPEN (RUNNING)"] or tr.get("exit_time") in [None, "RUNNING"]:
                        tr["status"] = "OPEN"
                        if not tr.get("exit_time"):
                            tr["exit_time"] = "RUNNING"
                    if t_no not in unique_trades:
                        unique_trades[t_no] = tr
                combined["trades"] = sorted(unique_trades.values(), key=lambda x: x.get("trade_no", 0))

                merged.append(combined)

            seen_ids = {s["id"] for s in merged}
            for loc_s in local_catalog:
                if loc_s["id"] not in seen_ids:
                    merged.append(loc_s)

            STRATEGIES_CATALOG = merged
            STRATEGIES_MAP = {s["id"]: s for s in STRATEGIES_CATALOG}
            logger.info(f"Loaded {len(STRATEGIES_CATALOG)} strategies (enriched with Supabase and markers preserved)!")
        else:
            raise ValueError("No strategies in Supabase or Supabase not connected")
    except Exception as e:
        logger.info(f"Using local strategies.json cache: {e}")
        STRATEGIES_CATALOG = local_catalog
        STRATEGIES_MAP = {s["id"]: s for s in STRATEGIES_CATALOG}
        logger.info(f"Loaded {len(STRATEGIES_CATALOG)} strategies from local cache")

    # 4. Load ETH Datasets (Parquets, Klines Cache, Strategy Catalog)
    for tf in ["30m", "1h", "4h", "1d", "1w"]:
        p = os.path.join(DATA_DIR, f"ETHUSDT_{tf}.parquet")
        if os.path.exists(p):
            try:
                df_eth = pd.read_parquet(p)
                
                # Auto-backfill any missing closed bars from Binance REST API for ETH
                try:
                    import time
                    from binance_ws import fetch_binance_klines_rest
                    now_ms = int(time.time() * 1000)
                    last_ts = int(df_eth["timestamp"].iloc[-1]) if "timestamp" in df_eth.columns else (int(df_eth["time"].iloc[-1]) * 1000)
                    gap_thresholds = {"30m": 1800000, "1h": 3600000, "4h": 14400000, "1d": 86400000, "1w": 604800000}
                    if now_ms - last_ts > gap_thresholds.get(tf, 1800000):
                        new_bars = fetch_binance_klines_rest("ETHUSDT", tf, limit=1000, start_time=last_ts + 1)
                        closed_bars = [b for b in new_bars if b.get("close_time", 0) < now_ms]
                        if closed_bars:
                            df_new = pd.DataFrame(closed_bars)
                            df_eth = pd.concat([df_eth, df_new], ignore_index=True).drop_duplicates(subset=["timestamp"]).reset_index(drop=True)
                            for w in [8, 25, 50, 55, 111]:
                                if len(df_eth) >= w:
                                    df_eth[f"MA{w}"] = df_eth["close"].rolling(w).mean()
                            logger.info(f"Backfilled {len(closed_bars)} live ETH candles for {tf} up to {df_eth['datetime'].iloc[-1]}")
                except Exception as ex_bf:
                    logger.debug(f"ETH backfill gap skipped for {tf}: {ex_bf}")

                PARQUET_DFS_ETH[tf] = df_eth
                if "timestamp" in df_eth.columns:
                    PARQUET_TIMESTAMPS_ETH[tf] = (df_eth["timestamp"] // 1000).values
                elif "time" in df_eth.columns:
                    PARQUET_TIMESTAMPS_ETH[tf] = df_eth["time"].values
                logger.info(f"Loaded {len(df_eth)} ETH bars for timeframe {tf}")
            except Exception as e:
                logger.warning(f"Could not load ETH parquet for {tf}: {e}")

    klines_eth_path = os.path.join(DATA_DIR, "klines_cache_eth.json")
    if os.path.exists(klines_eth_path):
        with open(klines_eth_path, "r") as f:
            KLINES_CACHE_ETH = json.load(f)

    # Refresh KLINES_CACHE_ETH from PARQUET_DFS_ETH
    for tf, df_p in PARQUET_DFS_ETH.items():
        sub = df_p.tail(5000)
        c_list = []
        for _, r in sub.iterrows():
            ts_sec = int(r["timestamp"] / 1000) if "timestamp" in r and r["timestamp"] > 1e11 else int(r.get("time", r.get("timestamp", 0)))
            c_list.append({
                "time": ts_sec,
                "datetime": str(r.get("datetime", "")),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": float(r.get("volume", 0.0)),
                "ma8": float(r["MA8"]) if "MA8" in r and not pd.isna(r["MA8"]) else None,
                "ma25": float(r["MA25"]) if "MA25" in r and not pd.isna(r["MA25"]) else None,
                "ma50": float(r["MA50"]) if "MA50" in r and not pd.isna(r["MA50"]) else None,
                "ma55": float(r["MA55"]) if "MA55" in r and not pd.isna(r["MA55"]) else None,
                "ma111": float(r["MA111"]) if "MA111" in r and not pd.isna(r["MA111"]) else None,
            })
        KLINES_CACHE_ETH[tf] = c_list
    logger.info(f"Synchronized live ETH klines cache for timeframes: {list(KLINES_CACHE_ETH.keys())}")

    strat_eth_path = os.path.join(DATA_DIR, "strategies_eth.json")
    if os.path.exists(strat_eth_path):
        with open(strat_eth_path, "r") as f:
            STRATEGIES_CATALOG_ETH = json.load(f)
        STRATEGIES_MAP_ETH = {s["id"]: s for s in STRATEGIES_CATALOG_ETH}
        logger.info(f"Loaded {len(STRATEGIES_CATALOG_ETH)} ETH strategies from local storage!")

    # Set initial ETH ticker price from latest candle if not yet live
    if "30m" in PARQUET_DFS_ETH and len(PARQUET_DFS_ETH["30m"]) > 0:
        eth_last_close = float(PARQUET_DFS_ETH["30m"]["close"].iloc[-1])
        if binance_manager.ticker_data_map["ETHUSDT"]["price"] <= 0:
            binance_manager.ticker_data_map["ETHUSDT"]["price"] = eth_last_close
            binance_manager.ticker_data_map["ETHUSDT"]["status"] = "READY"

    # 5. Warm up autonomous live signal engine for BTC and ETH
    try:
        from live_signal_engine import live_signal_engine
        live_signal_engine.initialize_with_parquets(PARQUET_DFS, symbol="BTCUSDT")
        if live_signal_engine.last_price > 0:
            binance_manager.ticker_data["price"] = live_signal_engine.last_price
            binance_manager.ticker_data["status"] = "READY"
            binance_manager.ticker_data_map["BTCUSDT"]["price"] = live_signal_engine.last_price
            binance_manager.ticker_data_map["BTCUSDT"]["status"] = "READY"

        live_signal_engine.initialize_with_parquets(PARQUET_DFS_ETH, symbol="ETHUSDT")
        if live_signal_engine.last_price_eth > 0:
            binance_manager.ticker_data_map["ETHUSDT"]["price"] = live_signal_engine.last_price_eth
            binance_manager.ticker_data_map["ETHUSDT"]["status"] = "READY"

        logger.info(f"Autonomous Live Signal Engine initialized for BTC (${live_signal_engine.last_price:,.2f}) & ETH (${live_signal_engine.last_price_eth:,.2f})")
    except Exception as e:
        logger.warning(f"Could not warm up live signal engine: {e}")

def reload_local_catalog(symbol: str = "BTCUSDT"):
    global STRATEGIES_CATALOG, STRATEGIES_MAP, STRATEGIES_CATALOG_ETH, STRATEGIES_MAP_ETH
    sym = symbol.upper()
    if sym == "ETHUSDT":
        strat_path = os.path.join(DATA_DIR, "strategies_eth.json")
        if os.path.exists(strat_path):
            with open(strat_path, "r") as f:
                STRATEGIES_CATALOG_ETH = json.load(f)
                STRATEGIES_MAP_ETH = {s["id"]: s for s in STRATEGIES_CATALOG_ETH}
    else:
        strat_path = os.path.join(DATA_DIR, "strategies.json")
        if os.path.exists(strat_path):
            with open(strat_path, "r") as f:
                STRATEGIES_CATALOG = json.load(f)
                STRATEGIES_MAP = {s["id"]: s for s in STRATEGIES_CATALOG}


def update_live_kline_cache(symbol: str, timeframe: str, candle: dict):
    """Keep REST chart data aligned with closed candles processed by the engine."""
    global KLINES_CACHE, KLINES_CACHE_ETH
    sym = symbol.upper()
    tf = timeframe.lower()
    target_cache = KLINES_CACHE_ETH if sym == "ETHUSDT" else KLINES_CACHE
    timestamp = int(candle.get("time") or int(candle.get("timestamp", 0)) // 1000)
    if not timestamp:
        return

    item = {
        "time": timestamp,
        "datetime": pd.to_datetime(timestamp, unit="s", utc=True).strftime("%Y-%m-%d %H:%M:%S"),
        "open": float(candle["open"]),
        "high": float(candle["high"]),
        "low": float(candle["low"]),
        "close": float(candle["close"]),
        "volume": float(candle.get("volume", 0.0)),
        "ma8": None,
        "ma25": None,
        "ma50": None,
        "ma55": None,
        "ma111": None,
    }
    candles = list(target_cache.get(tf, []))
    if candles and int(candles[-1].get("time", 0)) == timestamp:
        candles[-1] = {**candles[-1], **item}
    else:
        candles.append(item)
    target_cache[tf] = candles[-5000:]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing Quentra Backend Server...")
    load_data_into_memory()
    
    # Start Binance WebSocket background tasks
    ticker_task = asyncio.create_task(binance_manager.start_ticker_stream())
    kline_task = asyncio.create_task(binance_manager.start_kline_stream())
    
    yield
    
    # Shutdown
    logger.info("Shutting down Binance WebSocket tasks...")
    ticker_task.cancel()
    kline_task.cancel()
    await asyncio.gather(ticker_task, kline_task, return_exceptions=True)

app = FastAPI(title="Quentra API", version="1.0.0", lifespan=lifespan)

# Enable CORS for frontend Vite development & production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------------
# REST Endpoints
# -----------------------------------------------------------------------------

@app.get("/api/status")
async def get_status():
    from live_signal_engine import live_signal_engine
    btc_ticker = binance_manager.get_ticker("BTCUSDT")
    eth_ticker = binance_manager.get_ticker("ETHUSDT")
    return {
        "status": "ONLINE",
        "service": "Quentra Platform",
        "binance_ws_connected": binance_manager.is_connected,
        "ticker_status": btc_ticker.get("status"),
        "supported_assets": ["BTCUSDT", "ETHUSDT"],
        "latest_btc_price": btc_ticker.get("price"),
        "latest_eth_price": eth_ticker.get("price"),
        "tickers": binance_manager.ticker_data_map,
        "active_clients": len(binance_manager.connected_clients),
        "available_timeframes": list(KLINES_CACHE.keys()) if KLINES_CACHE else list(PARQUET_DFS.keys()),
        "strategies_count": len(STRATEGIES_CATALOG),
        "strategies_count_eth": len(STRATEGIES_CATALOG_ETH),
        "live_signal_engine": "AUTONOMOUS_ONLINE",
        "macro_regime": live_signal_engine.macro_state.get("regime_description", "MACRO_DISCOUNT")
    }

@app.get("/api/ticker")
async def get_ticker(symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")):
    return binance_manager.get_ticker(symbol)

@app.get("/api/klines")
async def get_klines(
    symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT"),
    timeframe: str = Query(default="30m", description="Timeframe: 30m, 1h, 4h, 1d, 1w"),
    limit: int = Query(default=5000, le=20000, description="Number of bars to return"),
    around_time: Optional[int] = Query(default=None, description="Center klines around this unix timestamp")
):
    sym = symbol.upper()
    tf = timeframe.lower()

    target_dfs = PARQUET_DFS_ETH if sym == "ETHUSDT" else PARQUET_DFS
    target_ts = PARQUET_TIMESTAMPS_ETH if sym == "ETHUSDT" else PARQUET_TIMESTAMPS
    target_cache = KLINES_CACHE_ETH if sym == "ETHUSDT" else KLINES_CACHE
    
    # If around_time is passed and parquet is in memory, slice around that exact timestamp!
    if around_time and tf in target_dfs and tf in target_ts:
        df = target_dfs[tf]
        timestamps = target_ts[tf]
        idx = bisect.bisect_left(timestamps, around_time)
        half = limit // 2
        start_idx = max(0, idx - half)
        end_idx = min(len(df), idx + half)
        slice_df = df.iloc[start_idx:end_idx]

        time_arr = (slice_df['timestamp'] // 1000).values if 'timestamp' in slice_df.columns else slice_df['time'].values
        open_arr = slice_df['open'].values
        high_arr = slice_df['high'].values
        low_arr = slice_df['low'].values
        close_arr = slice_df['close'].values
        vol_arr = slice_df['volume'].values if 'volume' in slice_df else np.zeros(len(slice_df))
        ma8_arr = slice_df['MA8'].values if 'MA8' in slice_df else None
        ma25_arr = slice_df['MA25'].values if 'MA25' in slice_df else None
        ma50_arr = slice_df['MA50'].values if 'MA50' in slice_df else None
        ma55_arr = slice_df['MA55'].values if 'MA55' in slice_df else None
        ma111_arr = slice_df['MA111'].values if 'MA111' in slice_df else None

        candles = [
            {
                "time": int(time_arr[i]),
                "open": float(open_arr[i]),
                "high": float(high_arr[i]),
                "low": float(low_arr[i]),
                "close": float(close_arr[i]),
                "volume": float(vol_arr[i]),
                "ma8": float(ma8_arr[i]) if ma8_arr is not None and not np.isnan(ma8_arr[i]) else None,
                "ma25": float(ma25_arr[i]) if ma25_arr is not None and not np.isnan(ma25_arr[i]) else None,
                "ma50": float(ma50_arr[i]) if ma50_arr is not None and not np.isnan(ma50_arr[i]) else None,
                "ma55": float(ma55_arr[i]) if ma55_arr is not None and not np.isnan(ma55_arr[i]) else None,
                "ma111": float(ma111_arr[i]) if ma111_arr is not None and not np.isnan(ma111_arr[i]) else None,
            }
            for i in range(len(time_arr))
        ]
        return {
            "symbol": sym,
            "timeframe": tf,
            "count": len(candles),
            "candles": candles
        }

    # Standard path: use klines cache
    if tf not in target_cache:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}' for {sym}. Choose from: {list(target_cache.keys())}")
    
    data = target_cache[tf]
    sliced = data[-limit:] if limit < len(data) else data

    # If live price exists from active WebSocket, inject or update the latest unfinished bar close
    ticker_obj = binance_manager.get_ticker(sym)
    live_price = ticker_obj.get("price")
    if sliced and live_price and live_price > 0 and binance_manager.is_connected:
        last_candle = dict(sliced[-1])
        last_candle["close"] = float(live_price)
        last_candle["high"] = max(last_candle["high"], float(live_price))
        last_candle["low"] = min(last_candle["low"], float(live_price))
        sliced = sliced[:-1] + [last_candle]

    return {
        "symbol": sym,
        "timeframe": tf,
        "count": len(sliced),
        "candles": sliced
    }

def enrich_strategy_with_live(s: dict, symbol: str = "BTCUSDT") -> dict:
    from live_signal_engine import deduplicate_markers, is_open_trade_record, live_signal_engine
    sym = symbol.upper()
    model = live_signal_engine.get_model(s["id"], symbol=sym)
    if not model:
        return s

    s_copy = dict(s)
    # Strip any previously stored OPEN / RUNNING trades to avoid duplication
    base_trades = [t for t in s.get("trades", []) if not is_open_trade_record(t)]
    base_markers = [
        m for m in s.get("markers", [])
        if m.get("isActive") is not True and m.get("status") != "OPEN"
    ]

    # Existing trade timestamps to avoid duplicates
    existing_entries = {str(t.get("entry_time")) for t in base_trades}
    last_trade_no = base_trades[-1].get("trade_no", len(base_trades)) if base_trades else 0

    last_base_entry = base_trades[-1].get("entry_time", "") if base_trades else ""

    # 1. Inject synced recent closed trades from engine
    for rc in getattr(model, "synced_recent_trades", []):
        rc_entry = str(rc.get("entry_time", ""))
        if rc_entry and rc_entry not in existing_entries and rc_entry >= last_base_entry:
            last_trade_no += 1
            new_tr = dict(rc)
            new_tr["trade_no"] = last_trade_no
            base_trades.append(new_tr)
            existing_entries.add(rc_entry)

            try:
                e_ts = int(pd.to_datetime(rc["entry_time"].replace(" UTC", "")).timestamp())
                x_ts = int(pd.to_datetime(rc["exit_time"].replace(" UTC", "")).timestamp())
                side = rc.get("side", model.direction)
                is_win = rc.get("net_return_pct", 0) > 0

                base_markers.append({
                    "time": e_ts,
                    "position": "belowBar" if side == "LONG" else "aboveBar",
                    "color": "#39FF88" if side == "LONG" else "#FF4B5C",
                    "shape": "arrowUp" if side == "LONG" else "arrowDown",
                    "text": f"{side} #{last_trade_no} @ ${rc['entry_price']:,.2f}",
                    "size": 2,
                    "entryPrice": rc["entry_price"],
                    "tradeNo": last_trade_no,
                    "side": side
                })
                base_markers.append({
                    "time": x_ts,
                    "position": "aboveBar" if side == "LONG" else "belowBar",
                    "color": "#39FF88" if is_win else "#FF4B5C",
                    "shape": "circle",
                    "text": f"EXIT {rc['net_return_pct']:+.1f}%",
                    "size": 1,
                    "exitPrice": rc["exit_price"],
                    "tradeNo": last_trade_no,
                    "pnlPct": rc["net_return_pct"],
                    "reason": rc.get("reason", "")
                })
            except Exception:
                pass

    # 2. Inject active OPEN trade & active markers IF model is currently OPEN
    if model.position_status == "OPEN" and model.entry_price > 0:
        live_price = binance_manager.get_ticker(sym).get("price") or live_signal_engine.get_last_price(sym) or model.entry_price
        if model.direction == "LONG":
            flt_gross = ((live_price - model.entry_price) / model.entry_price) * 100.0
        else:
            flt_gross = ((model.entry_price - live_price) / model.entry_price) * 100.0
        flt_net = flt_gross - 0.18 # roundtrip commission

        last_trade_no += 1
        active_trade = {
            "trade_no": last_trade_no,
            "side": model.direction,
            "type": model.direction,
            "entry_time": model.entry_time,
            "exit_time": "RUNNING",
            "entry_price": round(model.entry_price, 2),
            "exit_price": round(live_price, 2),
            "gross_return_pct": round(flt_gross, 2),
            "net_return_pct": round(flt_net, 2),
            "exit_reason": f"Active Signal ({'BE Locked' if model.be_active else 'Trailing'})",
            "be_activated": model.be_active,
            "status": "OPEN",
            "stop_loss": model.current_sl,
            "take_profit": model.target_tp,
            "is_active": True
        }
        base_trades.append(active_trade)

        # Inject active markers from model
        if hasattr(model, "active_markers") and model.active_markers:
            for am in deduplicate_markers(model.active_markers):
                m_copy = dict(am)
                m_copy["tradeNo"] = last_trade_no
                base_markers.append(m_copy)

        s_copy["has_active_signal"] = True
        s_copy["active_ticket"] = model.active_ticket or s.get("active_ticket")
    else:
        # Model is FLAT: no active position, clean active indicators
        s_copy["has_active_signal"] = False
        s_copy["active_ticket"] = None

    def _marker_sort_key(m):
        t = m.get("time", 0)
        if isinstance(t, (int, float)):
            return float(t)
        if isinstance(t, str):
            try:
                return float(t)
            except ValueError:
                try:
                    return pd.to_datetime(t).timestamp()
                except Exception:
                    return 0.0
        return 0.0

    s_copy["trades"] = base_trades
    s_copy["markers"] = sorted(deduplicate_markers(base_markers), key=_marker_sort_key)
    s_copy["trades_count"] = len([t for t in base_trades if t.get("status") == "CLOSED"])
    if "metrics" in s_copy and isinstance(s_copy["metrics"], dict):
        s_copy["metrics"]["total_trades"] = s_copy["trades_count"]
    return s_copy

@app.get("/api/strategies")
async def list_strategies(symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")):
    sym = symbol.upper()
    target_catalog = STRATEGIES_CATALOG_ETH if sym == "ETHUSDT" else STRATEGIES_CATALOG

    summaries = []
    for s in target_catalog:
        enriched = enrich_strategy_with_live(s, symbol=sym)
        summary = {
            "id": enriched["id"],
            "name": enriched["name"],
            "short_name": enriched.get("short_name", enriched["name"]),
            "type": enriched["type"],
            "timeframe": enriched["timeframe"],
            "category": enriched.get("category", ""),
            "archetype": enriched.get("archetype", ""),
            "risk_tier": enriched.get("risk_tier", "Moderate"),
            "recommended_for": enriched.get("recommended_for", ""),
            "badge": enriched.get("badge", ""),
            "metrics": enriched.get("metrics", {}),
            "parameters": enriched.get("parameters", {}),
            "logic_summary": enriched.get("logic_summary", ""),
            "yearly_stats": enriched.get("yearly_stats", []),
            "markers": enriched.get("markers", []),
            "trades": enriched.get("trades", []),
            "has_active_signal": enriched.get("has_active_signal", False),
            "active_ticket": enriched.get("active_ticket", None)
        }
        summaries.append(summary)
    return summaries

@app.get("/api/strategies/{strategy_id}")
async def get_strategy_detail(strategy_id: str, symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")):
    sym = symbol.upper()
    target_map = STRATEGIES_MAP_ETH if sym == "ETHUSDT" else STRATEGIES_MAP
    if strategy_id not in target_map:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found for symbol {sym}")
    return enrich_strategy_with_live(target_map[strategy_id], symbol=sym)

@app.get("/api/floor")
async def get_floor_state():
    btc_price = binance_manager.get_ticker("BTCUSDT").get("price", 77300.0)
    eth_price = binance_manager.get_ticker("ETHUSDT").get("price", 2645.20)
    return floor_engine.get_floor_state(current_btc_price=btc_price, current_eth_price=eth_price)

@app.post("/api/floor/select-agent")
async def select_agent(agent_id: str = Query(...)):
    floor_engine.set_active_agent(agent_id)
    btc_price = binance_manager.get_ticker("BTCUSDT").get("price", 77300.0)
    eth_price = binance_manager.get_ticker("ETHUSDT").get("price", 2645.20)
    state = floor_engine.get_floor_state(current_btc_price=btc_price, current_eth_price=eth_price)
    await binance_manager.broadcast({
        "type": "FLOOR_UPDATE",
        "floor": state
    })
    return {"status": "SUCCESS", "active_agent": agent_id, "floor": state}

@app.post("/api/floor/simulate-signal")
async def simulate_signal(
    strategy_id: Optional[str] = Query(default=None),
    symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")
):
    sym = symbol.upper()
    target_catalog = STRATEGIES_CATALOG_ETH if sym == "ETHUSDT" else STRATEGIES_CATALOG
    target_map = STRATEGIES_MAP_ETH if sym == "ETHUSDT" else STRATEGIES_MAP
    
    strat = target_map.get(strategy_id) if strategy_id else target_catalog[0]
    if not strat:
        strat = target_catalog[0]
    
    ticker = binance_manager.get_ticker(sym)
    price = ticker.get("price") or (2645.20 if sym == "ETHUSDT" else 77300.0)
    
    ticket = floor_engine.trigger_signal(
        strategy_id=strat["id"],
        strategy_name=strat["name"],
        direction=strat["type"],
        current_price=price,
        symbol=sym
    )
    btc_p = binance_manager.get_ticker("BTCUSDT").get("price", 77300.0)
    eth_p = binance_manager.get_ticker("ETHUSDT").get("price", 2645.20)
    floor_state = floor_engine.get_floor_state(current_btc_price=btc_p, current_eth_price=eth_p)
    fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"
    
    await binance_manager.broadcast({
        "type": "NEW_SIGNAL",
        "symbol": fmt_sym,
        "asset": sym,
        "ticket": ticket,
        "floor": floor_state
    })
    # Record to Supabase audit log if connected
    try:
        from supabase_client import record_live_signal
        record_live_signal({
            "strategy_id": strat["id"],
            "symbol": sym,
            "type": strat["type"],
            "price": price,
            "confidence": ticket.get("confidence", 95),
            "ticket": ticket
        })
    except Exception as e:
        logger.debug(f"Supabase signal audit skipped: {e}")

    return {"message": "Signal triggered successfully", "ticket": ticket}


@app.post("/api/signals/close")
async def close_live_signal(
    strategy_id: str = Query(...),
    symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT"),
):
    """Close the real engine position requested from the signal panel."""
    from live_signal_engine import live_signal_engine

    sym = symbol.upper()
    model = live_signal_engine.get_model(strategy_id, symbol=sym)
    if not model or model.position_status != "OPEN":
        raise HTTPException(status_code=404, detail="No active position for this strategy")

    price = live_signal_engine.get_last_price(sym) or binance_manager.get_ticker(sym).get("price")
    if not price:
        raise HTTPException(status_code=503, detail="Live price is unavailable")

    trade = live_signal_engine._close_position(model, float(price), "Manual_Exit")
    await binance_manager.broadcast({
        "type": "SIGNAL_EXIT",
        "symbol": "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT",
        "asset": sym,
        "strategy_id": model.strat_id,
        "strategy_name": model.name,
        "trade": trade,
        "autonomous": False,
    })
    return {"status": "CLOSED", "trade": trade}

@app.get("/api/signals/live")
async def get_live_signals_telemetry(symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")):
    """Returns autonomous live signal telemetry across all active strategies for the symbol"""
    from live_signal_engine import live_signal_engine
    return live_signal_engine.get_live_telemetry(symbol=symbol)

@app.get("/api/signals/ticket")
async def get_strategy_live_ticket(
    strategy_id: Optional[str] = Query(default=None),
    symbol: str = Query(default="BTCUSDT", description="Symbol: BTCUSDT, ETHUSDT")
):
    """Returns real-time watch or execution ticket for a strategy"""
    from live_signal_engine import live_signal_engine
    return live_signal_engine.get_active_or_latest_ticket(strategy_id, symbol=symbol)

@app.get("/api/db-status")
async def get_db_status():
    from supabase_client import get_supabase
    sb = get_supabase()
    return {
        "database": "Supabase (PostgreSQL)" if sb else "Local JSON Fallback",
        "supabase_connected": sb is not None,
        "strategies_loaded": len(STRATEGIES_CATALOG),
        "strategies_loaded_eth": len(STRATEGIES_CATALOG_ETH)
    }

# -----------------------------------------------------------------------------
# WebSocket Endpoint
# -----------------------------------------------------------------------------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await binance_manager.register(websocket)
    try:
        while True:
            msg_text = await websocket.receive_text()
            try:
                data = json.loads(msg_text)
                action = data.get("action")
                if action == "SELECT_AGENT":
                    agent_id = data.get("agent_id")
                    floor_engine.set_active_agent(agent_id)
                    price = binance_manager.ticker_data.get("price", 77300.0)
                    await websocket.send_json({
                        "type": "FLOOR_UPDATE",
                        "floor": floor_engine.get_floor_state(price)
                    })
                elif action == "PING":
                    await websocket.send_json({"type": "PONG", "time": binance_manager.last_tick_time})
            except Exception as ex:
                logger.warning(f"Error handling WS message: {ex}")
    except WebSocketDisconnect:
        binance_manager.unregister(websocket)
    except Exception as e:
        binance_manager.unregister(websocket)

# -----------------------------------------------------------------------------
# Frontend SPA Routes (/app, /landing, /, /index.html)
# -----------------------------------------------------------------------------
NO_CACHE_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0"
}

@app.get("/")
@app.get("/index.html")
async def serve_root_spa():
    index_file = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, headers=NO_CACHE_HEADERS)
    raise HTTPException(status_code=404, detail="Frontend build not found")

@app.get("/app")
@app.get("/app/{full_path:path}")
async def serve_app_spa(full_path: str = ""):
    index_file = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, headers=NO_CACHE_HEADERS)
    raise HTTPException(status_code=404, detail="Frontend build not found")

@app.get("/landing")
async def serve_landing_spa():
    index_file = os.path.join(FRONTEND_DIST_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file, headers=NO_CACHE_HEADERS)
    raise HTTPException(status_code=404, detail="Frontend build not found")

# -----------------------------------------------------------------------------
# Static files mount for React Production Build
# -----------------------------------------------------------------------------
if os.path.exists(FRONTEND_DIST_DIR):
    logger.info(f"Mounting static frontend build from {FRONTEND_DIST_DIR}")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)

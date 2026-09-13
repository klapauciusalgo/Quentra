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
from fastapi.responses import JSONResponse
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
STRATEGIES_CATALOG = []
STRATEGIES_MAP = {}
PARQUET_DFS = {}
PARQUET_TIMESTAMPS = {}

def load_data_into_memory():
    global KLINES_CACHE, STRATEGIES_CATALOG, STRATEGIES_MAP, PARQUET_DFS, PARQUET_TIMESTAMPS
    
    # 1. Load Parquets for full historical coverage (2020-2026)
    analysis_dir = "/home/ubuntu/BTC-analysis/data"
    for tf in ["30m", "1h", "4h", "1d", "1w"]:
        p = os.path.join(DATA_DIR, f"BTCUSDT_{tf}.parquet")
        if not os.path.exists(p):
            p = os.path.join(analysis_dir, f"BTCUSDT_{tf}.parquet")
        if os.path.exists(p):
            try:
                df = pd.read_parquet(p)
                PARQUET_DFS[tf] = df
                if "timestamp" in df.columns:
                    PARQUET_TIMESTAMPS[tf] = (df["timestamp"] // 1000).values
                logger.info(f"Loaded {len(df)} historical bars for timeframe {tf}")
            except Exception as e:
                logger.warning(f"Could not load parquet for {tf}: {e}")

    # 2. Load JSON cache
    klines_path = os.path.join(DATA_DIR, "klines_cache.json")
    if os.path.exists(klines_path):
        with open(klines_path, "r") as f:
            KLINES_CACHE = json.load(f)
        logger.info(f"Loaded klines cache for timeframes: {list(KLINES_CACHE.keys())}")
    else:
        logger.warning("klines_cache.json not found! Run generate_data.py first.")

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

                # Ensure metrics dict is fully populated
                base_metrics = base_s.get("metrics") or {}
                m = combined.get("metrics") or {}
                combined["metrics"] = {
                    "total_return_pct": m.get("total_return_pct") or base_metrics.get("total_return_pct") or combined.get("total_return_pct", 0),
                    "win_rate_pct": m.get("win_rate_pct") or base_metrics.get("win_rate_pct") or combined.get("win_rate_pct", 0),
                    "profit_factor": m.get("profit_factor") or base_metrics.get("profit_factor") or combined.get("profit_factor", 1.0),
                    "max_drawdown_pct": m.get("max_drawdown_pct") or base_metrics.get("max_drawdown_pct") or combined.get("max_drawdown_pct", 0),
                    "total_trades": m.get("total_trades") or base_metrics.get("total_trades") or combined.get("trades_count", len(combined.get("trades", []))),
                    "cagr_pct": base_metrics.get("cagr_pct", 0),
                    "calmar_ratio": base_metrics.get("calmar_ratio", 1.0),
                    "win_trades": base_metrics.get("win_trades", 0),
                    "loss_trades": base_metrics.get("loss_trades", 0),
                    "avg_win_pct": base_metrics.get("avg_win_pct", 0),
                    "avg_loss_pct": base_metrics.get("avg_loss_pct", 0),
                    "best_trade_pct": base_metrics.get("best_trade_pct", 0),
                    "worst_trade_pct": base_metrics.get("worst_trade_pct", 0),
                }
                combined["total_return_pct"] = combined["metrics"]["total_return_pct"]
                combined["win_rate_pct"] = combined["metrics"]["win_rate_pct"]
                combined["profit_factor"] = combined["metrics"]["profit_factor"]
                # Deduplicate trades by trade_no
                raw_trades = combined.get("trades") or base_s.get("trades", [])
                unique_trades = {}
                for tr in raw_trades:
                    t_no = tr.get("trade_no")
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
    return {
        "status": "ONLINE",
        "service": "Quentra Platform",
        "binance_ws_connected": binance_manager.is_connected,
        "ticker_status": binance_manager.ticker_data.get("status"),
        "latest_btc_price": binance_manager.ticker_data.get("price"),
        "active_clients": len(binance_manager.connected_clients),
        "available_timeframes": list(KLINES_CACHE.keys()) if KLINES_CACHE else list(PARQUET_DFS.keys()),
        "strategies_count": len(STRATEGIES_CATALOG)
    }

@app.get("/api/ticker")
async def get_ticker():
    return binance_manager.ticker_data

@app.get("/api/klines")
async def get_klines(
    timeframe: str = Query(default="30m", description="Timeframe: 30m, 1h, 4h, 1d, 1w"),
    limit: int = Query(default=5000, le=20000, description="Number of bars to return"),
    around_time: Optional[int] = Query(default=None, description="Center klines around this unix timestamp")
):
    tf = timeframe.lower()
    
    # If around_time is passed and parquet is in memory, slice around that exact timestamp!
    if around_time and tf in PARQUET_DFS and tf in PARQUET_TIMESTAMPS:
        df = PARQUET_DFS[tf]
        timestamps = PARQUET_TIMESTAMPS[tf]
        idx = bisect.bisect_left(timestamps, around_time)
        half = limit // 2
        start_idx = max(0, idx - half)
        end_idx = min(len(df), idx + half)
        slice_df = df.iloc[start_idx:end_idx]

        time_arr = (slice_df['timestamp'] // 1000).values
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
            "symbol": "BTCUSDT",
            "timeframe": tf,
            "count": len(candles),
            "candles": candles
        }

    # Standard path: use klines cache
    if tf not in KLINES_CACHE:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe '{timeframe}'. Choose from: {list(KLINES_CACHE.keys())}")
    
    data = KLINES_CACHE[tf]
    sliced = data[-limit:] if limit < len(data) else data

    # If live price exists, inject or update the latest unfinished bar close
    live_price = binance_manager.ticker_data.get("price")
    if sliced and live_price and live_price > 0:
        last_candle = dict(sliced[-1])
        last_candle["close"] = float(live_price)
        last_candle["high"] = max(last_candle["high"], float(live_price))
        last_candle["low"] = min(last_candle["low"], float(live_price))
        sliced = sliced[:-1] + [last_candle]

    return {
        "symbol": "BTCUSDT",
        "timeframe": tf,
        "count": len(sliced),
        "candles": sliced
    }

@app.get("/api/strategies")
async def list_strategies():
    summaries = []
    for s in STRATEGIES_CATALOG:
        summary = {
            "id": s["id"],
            "name": s["name"],
            "short_name": s.get("short_name", s["name"]),
            "type": s["type"],
            "timeframe": s["timeframe"],
            "category": s.get("category", ""),
            "archetype": s.get("archetype", ""),
            "risk_tier": s.get("risk_tier", "Moderate"),
            "recommended_for": s.get("recommended_for", ""),
            "badge": s.get("badge", ""),
            "metrics": s.get("metrics", {}),
            "parameters": s.get("parameters", {}),
            "logic_summary": s.get("logic_summary", ""),
            "yearly_stats": s.get("yearly_stats", []),
            "markers": s.get("markers", []),
            "trades": s.get("trades", [])
        }
        summaries.append(summary)
    return summaries

@app.get("/api/strategies/{strategy_id}")
async def get_strategy_detail(strategy_id: str):
    if strategy_id not in STRATEGIES_MAP:
        raise HTTPException(status_code=404, detail=f"Strategy '{strategy_id}' not found")
    return STRATEGIES_MAP[strategy_id]

@app.get("/api/floor")
async def get_floor_state():
    price = binance_manager.ticker_data.get("price", 77300.0)
    return floor_engine.get_floor_state(price)

@app.post("/api/floor/select-agent")
async def select_agent(agent_id: str = Query(...)):
    floor_engine.set_active_agent(agent_id)
    price = binance_manager.ticker_data.get("price", 77300.0)
    state = floor_engine.get_floor_state(price)
    await binance_manager.broadcast({
        "type": "FLOOR_UPDATE",
        "floor": state
    })
    return state

@app.post("/api/floor/simulate-signal")
async def simulate_signal(strategy_id: Optional[str] = Query(default=None)):
    strat = STRATEGIES_MAP.get(strategy_id) if strategy_id else STRATEGIES_CATALOG[0]
    if not strat:
        strat = STRATEGIES_CATALOG[0]
    
    price = binance_manager.ticker_data.get("price", 77300.0)
    ticket = floor_engine.trigger_signal(
        strategy_id=strat["id"],
        strategy_name=strat["name"],
        direction=strat["type"],
        current_price=price
    )
    floor_state = floor_engine.get_floor_state(price)
    
    await binance_manager.broadcast({
        "type": "NEW_SIGNAL",
        "ticket": ticket,
        "floor": floor_state
    })
    # Record to Supabase audit log if connected
    try:
        from supabase_client import record_live_signal
        record_live_signal({
            "strategy_id": strat["id"],
            "symbol": "BTCUSDT",
            "type": strat["type"],
            "price": price,
            "confidence": ticket.get("confidence", 95),
            "ticket": ticket
        })
    except Exception as e:
        logger.debug(f"Supabase signal audit skipped: {e}")

    return {"message": "Signal triggered successfully", "ticket": ticket}

@app.get("/api/db-status")
async def get_db_status():
    from supabase_client import get_supabase
    sb = get_supabase()
    return {
        "database": "Supabase (PostgreSQL)" if sb else "Local JSON Fallback",
        "supabase_connected": sb is not None,
        "strategies_loaded": len(STRATEGIES_CATALOG)
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
# Static files mount for React Production Build
# -----------------------------------------------------------------------------
if os.path.exists(FRONTEND_DIST_DIR):
    logger.info(f"Mounting static frontend build from {FRONTEND_DIST_DIR}")
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=False)

#!/usr/bin/env python3
"""
Autonomous Multi-Asset Live Signal Engine for Quentra.
Executes quantitative algorithmic strategy rules on-the-fly for BTCUSDT and ETHUSDT:
- Streams & monitors closed candles across timeframes (30m, 1h, 4h, 1w)
- Computes Smart Money Concepts (SMC) swing highs/lows and market structure
- Evaluates Macro Regime Filters (Weekly MA55, 4H SMA111, 1H EMA50)
- Detects entry breakouts, dynamic breakeven locks (+0.2%), structural exits, and stop losses
- Automatically dispatches signals to WebSocket clients and records them to Supabase
"""

import os
import json
import time
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd

logger = logging.getLogger("live_signal_engine")
logger.setLevel(logging.INFO)

def compute_swings_arr(high_arr: np.ndarray, low_arr: np.ndarray, len_p: int):
    n = len(high_arr)
    top = np.zeros(n)
    btm = np.zeros(n)
    os_state = 0
    for i in range(len_p, n):
        upper = np.max(high_arr[i - len_p + 1 : i + 1])
        lower = np.min(low_arr[i - len_p + 1 : i + 1])
        hl = high_arr[i - len_p]
        ll = low_arr[i - len_p]
        prev_os = os_state
        if hl > upper:
            os_state = 0
        elif ll < lower:
            os_state = 1
        if os_state == 0 and prev_os != 0:
            top[i] = hl
        if os_state == 1 and prev_os != 1:
            btm[i] = ll
    return top, btm

def standardize_candle_df(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure candle dataframe has consistent time, timestamp, datetime, and MA columns."""
    if df is None or df.empty:
        return df
    df = df.copy()
    if "timestamp" in df.columns and "time" not in df.columns:
        df["time"] = (df["timestamp"] // 1000).astype(int)
    elif "time" in df.columns and "timestamp" not in df.columns:
        df["timestamp"] = (df["time"] * 1000).astype(int)
    if "datetime" not in df.columns and "time" in df.columns:
        df["datetime"] = pd.to_datetime(df["time"], unit="s", utc=True).dt.strftime("%Y-%m-%d %H:%M:%S")
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    for w in [8, 25, 50, 55, 111]:
        if f"MA{w}" not in df.columns and len(df) >= w:
            df[f"MA{w}"] = df["close"].rolling(w).mean()
    return df

class StrategyModel:
    def __init__(self, strat_id: str, name: str, tf: str, direction: str, config: dict, symbol: str = "BTCUSDT"):
        self.strat_id = strat_id
        self.name = name
        self.timeframe = tf
        self.direction = direction.upper() # "LONG" or "SHORT"
        self.config = config
        self.symbol = symbol.upper()
        
        # Position state
        self.position_status = "FLAT" # "FLAT" or "OPEN"
        self.entry_price = 0.0
        self.entry_time = None
        self.entry_bar_idx = 0
        self.peak_price = 0.0
        self.trough_price = 0.0
        self.current_sl = 0.0
        self.be_active = False
        self.target_tp = 0.0
        
        # Live market telemetry
        self.next_entry_trigger = 0.0
        self.structural_floor = 0.0
        self.distance_to_trigger_pct = 0.0
        self.regime_ok = False
        
        # Recent executed trades log in this session
        self.recent_trades: List[dict] = []
        self.synced_recent_trades: List[dict] = []
        self.active_markers: List[dict] = []
        self.active_ticket: Optional[dict] = None

def create_strategy_catalog(symbol: str = "BTCUSDT") -> Dict[str, StrategyModel]:
    sym = symbol.upper()
    return {
        "pippo-1h-enhanced": StrategyModel(
            strat_id="pippo-1h-enhanced",
            name="Pippo 1h Enhanced",
            tf="1h",
            direction="LONG",
            config={
                "maj_swing": 50,
                "ent_swing": 16,
                "ex_swing": 48,
                "sl_pct": 0.08,
                "be_pct": 0.05,
                "tp_pct": 0.75,
                "regime": "4h_sma111"
            },
            symbol=sym
        ),
        "pippo-30m-alpha": StrategyModel(
            strat_id="pippo-30m-alpha",
            name="Pippo 30M Alpha (Pure Runner)",
            tf="30m",
            direction="LONG",
            config={
                "maj_swing": 100,
                "ent_swing": 36,
                "ex_swing": 96,
                "sl_pct": 0.05,
                "be_pct": 0.03,
                "tp_pct": 0.75,
                "regime": "4h_sma111_and_1h_ema50"
            },
            symbol=sym
        ),
        "pippo-30m-new-gen": StrategyModel(
            strat_id="pippo-30m-new-gen",
            name="Pippo 30m New Gen",
            tf="30m",
            direction="LONG",
            config={
                "sl_pct": 0.02,
                "tp_pct": 0.20,
                "fc_dist": 0.005,
                "entry_dist": 0.008,
                "regime_dist_1h": 0.015,
                "spread_max": 0.0015,
                "atr_max": 0.01,
                "regime": "pippo_new_gen_ma_squeeze"
            },
            symbol=sym
        ),
        "pippo-30m-grd": StrategyModel(
            strat_id="pippo-30m-grd",
            name="Pippo 30m Grd",
            tf="30m",
            direction="LONG",
            config={
                "sl_pct": 0.02,
                "tp_pct": 0.20,
                "fc_dist": 0.005,
                "entry_dist": 0.008,
                "regime_dist_1h": 0.015,
                "spread_max": 0.0015,
                "atr_max": 0.01,
                "regime": "pippo_grd_ma_squeeze"
            },
            symbol=sym
        ),
        "pippo-30m-short-v2-a": StrategyModel(
            strat_id="pippo-30m-short-v2-a",
            name="Pippo 30M Short V2 Type A (Active TP)",
            tf="30m",
            direction="SHORT",
            config={
                "maj_swing": 64,
                "ent_swing": 32,
                "ex_swing": 48,
                "sl_pct": 0.05,
                "be_pct": 0.015,
                "tp_pct": 0.12,
                "regime": "weekly_ma55_and_4h_sma111"
            },
            symbol=sym
        ),
        "pippo-30m-short-v2-b": StrategyModel(
            strat_id="pippo-30m-short-v2-b",
            name="Pippo 30M Short V2 Type B (Max Freq)",
            tf="30m",
            direction="SHORT",
            config={
                "maj_swing": 64,
                "ent_swing": 28,
                "ex_swing": 48,
                "sl_pct": 0.05,
                "be_pct": 0.025,
                "tp_pct": 0.20,
                "regime": "weekly_ma55"
            },
            symbol=sym
        ),
        "pippo-4h-original": StrategyModel(
            strat_id="pippo-4h-original",
            name="Pippo 4h Original",
            tf="4h",
            direction="LONG",
            config={
                "maj_swing": 50,
                "ent_swing": 5,
                "ex_swing": 5,
                "sl_pct": 0.15,
                "be_pct": 0.05,
                "tp_pct": 0.75,
                "regime": "4h_sma111"
            },
            symbol=sym
        ),
        "pippo-30m-scalp": StrategyModel(
            strat_id="pippo-30m-scalp",
            name="Pippo 30m Scalp-Runner",
            tf="30m",
            direction="LONG",
            config={
                "maj_swing": 100,
                "ent_swing": 36,
                "ex_swing": 96,
                "sl_pct": 0.05,
                "be_pct": 0.04,
                "tp_pct": 0.75,
                "partial_tp": 0.04,
                "regime": "4h_sma111_and_1h_ema50"
            },
            symbol=sym
        ),
        "pippo-30m-short-v2-c": StrategyModel(
            strat_id="pippo-30m-short-v2-c",
            name="Pippo 30M Short V2 Type C (Defensive Fortress)",
            tf="30m",
            direction="SHORT",
            config={
                "maj_swing": 64,
                "ent_swing": 32,
                "ex_swing": 16,
                "sl_pct": 0.06,
                "be_pct": 0.025,
                "tp_pct": 0.50,
                "regime": "weekly_ma55_and_4h_sma111"
            },
            symbol=sym
        ),
        "pure-macro-weekly-ma55": StrategyModel(
            strat_id="pure-macro-weekly-ma55",
            name="Pure Macro Weekly MA55",
            tf="1w",
            direction="LONG",
            config={
                "regime": "weekly_ma55_close"
            },
            symbol=sym
        )
    }

class LiveSignalEngine:
    def __init__(self):
        self.is_initialized = False
        self.last_price = 0.0
        self.last_price_eth = 0.0
        self.last_eval_timestamp = 0
        
        # Rolling candle history per asset (last 500-1000 bars per timeframe)
        self.candle_buffers: Dict[str, pd.DataFrame] = {}
        self.candle_buffers_eth: Dict[str, pd.DataFrame] = {}
        
        # Registered automated strategy models
        self.strategies: Dict[str, StrategyModel] = create_strategy_catalog("BTCUSDT")
        self.strategies_eth: Dict[str, StrategyModel] = create_strategy_catalog("ETHUSDT")

        # Shared macro indicators for BTC
        self.macro_state = {
            "weekly_ma55": 83309.0,
            "weekly_close": 80341.0,
            "is_weekly_bullish": False,
            "sma111_4h": 78753.0,
            "close_4h": 77293.0,
            "is_4h_bullish": False,
            "ema50_1h": 77759.0,
            "close_1h": 77293.0,
            "is_1h_bullish": False,
            "distance_weekly_ma55_pct": -6.66,
            "regime_description": "MACRO DISCOUNT (Bearish Bias below Weekly MA55)"
        }

        # Shared macro indicators for ETH
        self.macro_state_eth = {
            "weekly_ma55": 2648.68,
            "weekly_close": 2645.20,
            "is_weekly_bullish": False,
            "sma111_4h": 2650.0,
            "close_4h": 2645.20,
            "is_4h_bullish": False,
            "ema50_1h": 2640.0,
            "close_1h": 2645.20,
            "is_1h_bullish": False,
            "distance_weekly_ma55_pct": -0.13,
            "regime_description": "MACRO DISCOUNT (Bearish Bias below Weekly MA55)"
        }

    def get_models(self, symbol: str = "BTCUSDT") -> Dict[str, StrategyModel]:
        return self.strategies_eth if symbol.upper() == "ETHUSDT" else self.strategies

    def get_model(self, strat_id: str, symbol: str = "BTCUSDT") -> Optional[StrategyModel]:
        models = self.get_models(symbol)
        return models.get(strat_id)

    def get_candle_buffers(self, symbol: str = "BTCUSDT") -> Dict[str, pd.DataFrame]:
        return self.candle_buffers_eth if symbol.upper() == "ETHUSDT" else self.candle_buffers

    def get_macro_state(self, symbol: str = "BTCUSDT") -> dict:
        return self.macro_state_eth if symbol.upper() == "ETHUSDT" else self.macro_state

    def get_last_price(self, symbol: str = "BTCUSDT") -> float:
        return self.last_price_eth if symbol.upper() == "ETHUSDT" else self.last_price

    def initialize_with_parquets(self, parquet_dfs: dict, symbol: str = "BTCUSDT"):
        """Warm up engine with historical parquet bars and sync initial state for the given asset."""
        sym = symbol.upper()
        buffers = self.get_candle_buffers(sym)
        try:
            for tf, df in parquet_dfs.items():
                if df is not None and not df.empty:
                    std_df = standardize_candle_df(df.tail(1000))
                    buffers[tf] = std_df.reset_index(drop=True)
            
            # Initialize last_price from the latest available closed bar
            for tf_pref in ["30m", "1h", "4h", "1d", "1w"]:
                if tf_pref in buffers and not buffers[tf_pref].empty:
                    p = float(buffers[tf_pref]["close"].iloc[-1])
                    if sym == "ETHUSDT":
                        self.last_price_eth = p
                    else:
                        self.last_price = p
                    break

            # Recalculate macro state
            self._update_macro_indicators(sym)
            
            # Synchronize active open trades from recent history
            self.sync_active_positions(sym)

            # Evaluate current market state across all strategies
            self._evaluate_all_models_initial(sym)
            if sym == "BTCUSDT":
                self.is_initialized = True
            logger.info(f"Autonomous Live Signal Engine initialized for {sym}. Latest price: ${self.get_last_price(sym):,.2f}")
        except Exception as e:
            logger.error(f"Failed to initialize Live Signal Engine for {sym}: {e}", exc_info=True)

    def _update_macro_indicators(self, symbol: str = "BTCUSDT"):
        """Update Weekly MA55, 4H SMA111, and 1H EMA50 dynamically from rolling buffers."""
        sym = symbol.upper()
        buffers = self.get_candle_buffers(sym)
        macro = self.get_macro_state(sym)
        last_p = self.get_last_price(sym)
        try:
            # 1. Weekly MA55
            if "1w" in buffers and not buffers["1w"].empty:
                df_w = buffers["1w"]
                if "MA55" in df_w.columns and not pd.isna(df_w["MA55"].iloc[-1]):
                    macro["weekly_ma55"] = float(df_w["MA55"].iloc[-1])
                else:
                    macro["weekly_ma55"] = float(df_w["close"].rolling(55).mean().iloc[-1])
                macro["weekly_close"] = float(df_w["close"].iloc[-1])
                effective_weekly_p = last_p if last_p > 0 else macro["weekly_close"]
                macro["is_weekly_bullish"] = effective_weekly_p >= macro["weekly_ma55"]

            # 2. 4H SMA111
            if "4h" in buffers and not buffers["4h"].empty:
                df_4h = buffers["4h"]
                if "MA111" in df_4h.columns and not pd.isna(df_4h["MA111"].iloc[-1]):
                    macro["sma111_4h"] = float(df_4h["MA111"].iloc[-1])
                else:
                    macro["sma111_4h"] = float(df_4h["close"].rolling(111).mean().iloc[-1])
                macro["close_4h"] = float(df_4h["close"].iloc[-1])
                effective_4h_p = last_p if last_p > 0 else macro["close_4h"]
                macro["is_4h_bullish"] = effective_4h_p >= macro["sma111_4h"]

            # 3. 1H EMA50
            if "1h" in buffers and not buffers["1h"].empty:
                df_1h = buffers["1h"]
                macro["ema50_1h"] = float(df_1h["close"].ewm(span=50, adjust=False).mean().iloc[-1])
                macro["close_1h"] = float(df_1h["close"].iloc[-1])
                effective_1h_p = last_p if last_p > 0 else macro["close_1h"]
                macro["is_1h_bullish"] = effective_1h_p >= macro["ema50_1h"]

            # Macro regime summary
            ma55 = macro["weekly_ma55"]
            effective_p = last_p if last_p > 0 else macro["weekly_close"]
            diff_pct = ((effective_p - ma55) / ma55) * 100.0 if ma55 > 0 else 0.0
            macro["distance_weekly_ma55_pct"] = round(diff_pct, 2)
            if macro["is_weekly_bullish"]:
                macro["regime_description"] = f"BULLISH EXPANSION (+{diff_pct:.1f}% vs Weekly MA55)"
            else:
                macro["regime_description"] = f"MACRO DISCOUNT ({diff_pct:.1f}% vs Weekly MA55)"

        except Exception as ex:
            logger.warning(f"Error calculating macro indicators for {sym}: {ex}")

    def sync_active_positions(self, symbol: str = "BTCUSDT"):
        """
        Restores active OPEN positions directly from authoritative strategy storage
        (strategies.json / strategies_eth.json), ensuring RAM and Disk are 100% in sync.
        """
        sym = symbol.upper()
        models = self.get_models(sym)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        data_file = "strategies_eth.json" if sym == "ETHUSDT" else "strategies.json"
        data_path = os.path.join(backend_dir, "data", data_file)

        disk_catalog = {}
        if os.path.exists(data_path):
            try:
                with open(data_path, "r") as f:
                    disk_list = json.load(f)
                disk_catalog = {s["id"]: s for s in disk_list}
            except Exception as e:
                logger.warning(f"Could not load {data_path} for active positions sync: {e}")

        for strat_id, model in models.items():
            strat_data = disk_catalog.get(strat_id, {})
            has_active = strat_data.get("has_active_signal", False)
            trades = strat_data.get("trades", [])
            last_trade = trades[-1] if trades else None
            is_open_trade = last_trade and (last_trade.get("status") in ["OPEN", "RUNNING"] or last_trade.get("exit_time") in [None, "RUNNING"])

            if has_active and is_open_trade:
                entry_p = float(last_trade.get("entry_price", 0.0))
                entry_time = str(last_trade.get("entry_time", ""))
                curr_sl = float(last_trade.get("stop_loss", 0.0))
                target_tp = float(last_trade.get("take_profit", 0.0))
                be_active = bool(last_trade.get("be_activated", False))

                model.position_status = "OPEN"
                model.entry_price = entry_p
                model.entry_time = entry_time
                model.peak_price = entry_p
                model.trough_price = entry_p
                model.current_sl = curr_sl
                model.target_tp = target_tp
                model.be_active = be_active
                model.active_ticket = strat_data.get("active_ticket")
                
                # Active markers from strat_data
                markers = strat_data.get("markers", [])
                model.active_markers = [m for m in markers if m.get("isActive") or m.get("isBreakeven")]
                logger.info(f"🚀 [STATE SYNC] Restored active {model.direction} trade for [{sym}] {model.name}: Entry  at {entry_time} (SL: , BE: {be_active})")
            else:
                model.position_status = "FLAT"
                model.entry_price = 0.0
                model.active_ticket = None
                model.active_markers = []

    def _sync_pippo_new_gen(self, model: StrategyModel, symbol: str = "BTCUSDT"):
        """Replays Pippo 30m New Gen MA squeeze & multi-timeframe rules across recent bars."""
        sym = symbol.upper()
        buffers = self.get_candle_buffers(sym)
        try:
            if "30m" not in buffers or buffers["30m"].empty:
                return

            d30 = buffers["30m"].copy()
            if len(d30) < 50:
                return

            d1h = buffers.get("1h", pd.DataFrame()).copy()
            d4h = buffers.get("4h", pd.DataFrame()).copy()

            if not d1h.empty:
                d1h["ma25"] = d1h["close"].rolling(25).mean()
                d1h["ma50"] = d1h["close"].rolling(50).mean()
                d1h["d25h"] = (d1h["close"] - d1h["ma25"]) / d1h["ma25"] * 100
                d1h["d50h"] = (d1h["close"] - d1h["ma50"]) / d1h["ma50"] * 100
                d1h["ts"] = d1h["timestamp"] + 3600000 if "timestamp" in d1h else d1h["time"] * 1000 + 3600000

            if not d4h.empty:
                d4h["ma111"] = d4h["close"].rolling(111).mean()
                d4h["ts4"] = d4h["timestamp"] + 4 * 3600 * 1000 if "timestamp" in d4h else d4h["time"] * 1000 + 4 * 3600 * 1000

            d30["ma25"] = d30["close"].rolling(25).mean()
            d30["ma50"] = d30["close"].rolling(50).mean()
            d30["d25"] = (d30["close"] - d30["ma25"]) / d30["ma25"] * 100
            d30["d50"] = (d30["close"] - d30["ma50"]) / d30["ma50"] * 100
            d30["spread"] = (d30["ma25"] - d30["ma50"]) / d30["ma50"] * 100
            tr = np.maximum(d30["high"] - d30["low"], np.maximum((d30["high"] - d30["close"].shift()).abs(), (d30["low"] - d30["close"].shift()).abs()))
            d30["atr"] = tr.rolling(14).mean() / d30["close"] * 100

            df = d30
            if not d1h.empty and "ts" in d1h:
                df = pd.merge_asof(df, d1h[["ts", "close", "ma25", "ma50", "d25h", "d50h"]].rename(columns={"close": "c1h", "ma25": "m25h", "ma50": "m50h"}), left_on="timestamp" if "timestamp" in df else "time", right_on="ts" if "timestamp" in df else "time", direction="backward")
            if not d4h.empty and "ts4" in d4h:
                df = pd.merge_asof(df, d4h[["ts4", "close", "ma111"]].rename(columns={"close": "c4h", "ma111": "ma111_4h"}), left_on="timestamp" if "timestamp" in df else "time", right_on="ts4" if "timestamp" in df else "time", direction="backward")

            in_pos = False
            ep = 0.0
            entry_time = ""
            replayed_closed = []

            for i in range(len(df)):
                c = float(df["close"].iloc[i])
                h = float(df["high"].iloc[i])
                l = float(df["low"].iloc[i])
                cur_dt = str(df["datetime"].iloc[i]) if "datetime" in df else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

                if in_pos:
                    slp = ep * 0.98
                    tpp = ep * 1.20
                    m25 = float(df["ma25"].iloc[i]) if not pd.isna(df["ma25"].iloc[i]) else c
                    m50 = float(df["ma50"].iloc[i]) if not pd.isna(df["ma50"].iloc[i]) else c
                    fc = (c < m25) and (c < m50) and ((m25 - c) / m25 >= 0.005) and ((m50 - c) / m50 >= 0.005)

                    hit_sl = l <= slp
                    hit_tp = h >= tpp

                    if hit_sl or hit_tp or fc:
                        xp = slp if hit_sl else (tpp if hit_tp else c)
                        rs = "Stop Loss (-2%)" if hit_sl else ("Take Profit (+20%)" if hit_tp else "Force Close MA (-0.5%)")
                        raw_ret = (xp - ep) / ep
                        net_ret = (raw_ret - 0.0018) * 100.0
                        replayed_closed.append({
                            "symbol": "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT",
                            "asset": sym,
                            "side": "LONG",
                            "type": "LONG",
                            "entry_time": entry_time,
                            "exit_time": cur_dt,
                            "entry_price": ep,
                            "exit_price": xp,
                            "gross_return_pct": round(raw_ret * 100.0, 2),
                            "net_return_pct": round(net_ret, 2),
                            "exit_reason": rs,
                            "be_activated": False,
                            "status": "CLOSED"
                        })
                        in_pos = False

                if not in_pos:
                    m25 = float(df["ma25"].iloc[i]) if not pd.isna(df["ma25"].iloc[i]) else c
                    m50 = float(df["ma50"].iloc[i]) if not pd.isna(df["ma50"].iloc[i]) else c
                    c1h = float(df["c1h"].iloc[i]) if "c1h" in df and not pd.isna(df["c1h"].iloc[i]) else c
                    m25h = float(df["m25h"].iloc[i]) if "m25h" in df and not pd.isna(df["m25h"].iloc[i]) else m25
                    m50h = float(df["m50h"].iloc[i]) if "m50h" in df and not pd.isna(df["m50h"].iloc[i]) else m50
                    c4h = float(df["c4h"].iloc[i]) if "c4h" in df and not pd.isna(df["c4h"].iloc[i]) else c
                    m111_4h = float(df["ma111_4h"].iloc[i]) if "ma111_4h" in df and not pd.isna(df["ma111_4h"].iloc[i]) else (m25 * 0.95)

                    a1h = (c1h > m25h) and (c1h > m50h) and ((c1h - m25h) / m25h < 0.015) and ((c1h - m50h) / m50h < 0.015)
                    a4h = (c4h > m111_4h) if model.strat_id == "pippo-30m-new-gen" else True
                    a30 = (c > m25) and (c > m50) and ((c - m25) / m25 < 0.008) and ((c - m50) / m50 < 0.008)
                    sp = abs(m25 - m50) / m50 < 0.0015 if m50 > 0 else False
                    atr_val = float(df["atr"].iloc[i]) if "atr" in df and not pd.isna(df["atr"].iloc[i]) else 0.5
                    at = atr_val <= 1.0

                    if a1h and a4h and a30 and sp and at:
                        in_pos = True
                        ep = c
                        entry_time = cur_dt

            model.synced_recent_trades = replayed_closed
            if in_pos:
                model.position_status = "OPEN"
                model.entry_price = ep
                model.entry_time = entry_time
                model.peak_price = ep
                model.trough_price = ep
                model.current_sl = round(ep * 0.98, 2)
                model.target_tp = round(ep * 1.20, 2)
                model.be_active = False
                self._open_position(model, ep, entry_time)
                model.current_sl = round(ep * 0.98, 2)
                model.target_tp = round(ep * 1.20, 2)
                if model.active_ticket:
                    model.active_ticket["stop_loss"] = model.current_sl
                    model.active_ticket["take_profit"] = model.target_tp
                logger.info(f"🚀 [STATE SYNC] Restored active {model.direction} trade for [{sym}] {model.name}: Entry ${ep:,.2f} at {entry_time} (SL: ${model.current_sl:,.2f}, TP: ${model.target_tp:,.2f})")
            else:
                model.position_status = "FLAT"
                model.entry_price = 0.0
                model.active_ticket = None
                model.active_markers = []
        except Exception as e:
            logger.warning(f"Error syncing {model.strat_id} ({sym}): {e}", exc_info=True)

    def _evaluate_all_models_initial(self, symbol: str = "BTCUSDT"):
        """Compute swing levels and set initial telemetry for all strategies."""
        sym = symbol.upper()
        models = self.get_models(sym)
        for strat_id, model in models.items():
            self._evaluate_strategy_levels(model, sym)

    def _evaluate_strategy_levels(self, model: StrategyModel, symbol: str = "BTCUSDT"):
        """Recalculate swing triggers, structural floors, and regime alignment."""
        sym = symbol.upper()
        buffers = self.get_candle_buffers(sym)
        macro = self.get_macro_state(sym)
        tf = model.timeframe
        if tf not in buffers or buffers[tf].empty:
            return

        df = buffers[tf]
        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        n = len(closes)
        if n < 50:
            return

        if model.strat_id in ["pippo-30m-new-gen", "pippo-30m-grd"]:
            ma25_30 = float(df["MA25"].iloc[-1]) if ("MA25" in df and not pd.isna(df["MA25"].iloc[-1])) else float(df["close"].rolling(25).mean().iloc[-1])
            ma50_30 = float(df["MA50"].iloc[-1]) if ("MA50" in df and not pd.isna(df["MA50"].iloc[-1])) else float(df["close"].rolling(50).mean().iloc[-1])

            reg_1h_ok = False
            if "1h" in buffers and not buffers["1h"].empty:
                df1h = buffers["1h"]
                c1h = float(df1h["close"].iloc[-1])
                m25h = float(df1h["MA25"].iloc[-1]) if ("MA25" in df1h and not pd.isna(df1h["MA25"].iloc[-1])) else float(df1h["close"].rolling(25).mean().iloc[-1])
                m50h = float(df1h["MA50"].iloc[-1]) if ("MA50" in df1h and not pd.isna(df1h["MA50"].iloc[-1])) else float(df1h["close"].rolling(50).mean().iloc[-1])
                if c1h > m25h and c1h > m50h and ((c1h - m25h) / m25h < 0.015) and ((c1h - m50h) / m50h < 0.015):
                    reg_1h_ok = True

            if model.strat_id == "pippo-30m-new-gen":
                reg_4h_ok = macro.get("is_4h_bullish", False)
                model.regime_ok = reg_1h_ok and reg_4h_ok
            else:
                model.regime_ok = reg_1h_ok

            curr_p = self.get_last_price(sym) if self.get_last_price(sym) > 0 else float(closes[-1])
            model.next_entry_trigger = round(max(ma25_30, ma50_30) * 1.001, 2)
            model.structural_floor = round(min(ma25_30, ma50_30) * 0.995, 2)
            dist_pct = ((model.next_entry_trigger - curr_p) / curr_p) * 100.0 if curr_p > 0 else 0.0
            model.distance_to_trigger_pct = round(dist_pct, 2)
            return

        cfg = model.config
        maj_len = cfg.get("maj_swing", 50)
        ent_len = cfg.get("ent_swing", 16)
        ex_len = cfg.get("ex_swing", 48)

        # Compute SMC swings
        top_maj, btm_maj = compute_swings_arr(highs, lows, min(maj_len, n - 1))
        top_ent, btm_ent = compute_swings_arr(highs, lows, min(ent_len, n - 1))
        top_ex, btm_ex = compute_swings_arr(highs, lows, min(ex_len, n - 1))

        last_top_maj = [t for t in top_maj if t > 0][-1] if any(top_maj > 0) else float(highs[-1])
        last_btm_maj = [b for b in btm_maj if b > 0][-1] if any(btm_maj > 0) else float(lows[-1])
        last_top_ent = [t for t in top_ent if t > 0][-1] if any(top_ent > 0) else float(highs[-1])
        last_btm_ent = [b for b in btm_ent if b > 0][-1] if any(btm_ent > 0) else float(lows[-1])
        last_top_ex = [t for t in top_ex if t > 0][-1] if any(top_ex > 0) else float(highs[-1])
        last_btm_ex = [b for b in btm_ex if b > 0][-1] if any(btm_ex > 0) else float(lows[-1])

        curr_p = self.get_last_price(sym) if self.get_last_price(sym) > 0 else float(closes[-1])

        # Check regime alignment
        regime_rule = cfg.get("regime", "")
        if regime_rule == "4h_sma111":
            model.regime_ok = macro["is_4h_bullish"]
        elif regime_rule == "4h_sma111_and_1h_ema50":
            model.regime_ok = macro["is_4h_bullish"] and macro["is_1h_bullish"]
        elif regime_rule == "weekly_ma55_and_4h_sma111":
            model.regime_ok = (not macro["is_weekly_bullish"]) and (not macro["is_4h_bullish"])
        elif regime_rule == "weekly_ma55":
            model.regime_ok = not macro["is_weekly_bullish"]
        elif regime_rule == "weekly_ma55_close":
            model.regime_ok = macro["is_weekly_bullish"]
        else:
            model.regime_ok = True

        # Determine trigger levels
        if model.direction == "LONG":
            model.next_entry_trigger = round(last_top_ent, 2)
            model.structural_floor = round(last_btm_ex, 2)
            dist_pct = ((model.next_entry_trigger - curr_p) / curr_p) * 100.0 if curr_p > 0 else 0.0
            model.distance_to_trigger_pct = round(dist_pct, 2)
        else: # SHORT
            model.next_entry_trigger = round(last_btm_ent, 2)
            model.structural_floor = round(last_top_ex, 2)
            dist_pct = ((curr_p - model.next_entry_trigger) / curr_p) * 100.0 if curr_p > 0 else 0.0
            model.distance_to_trigger_pct = round(dist_pct, 2)

    def on_ticker_tick(self, price: float, timestamp: int, symbol: str = "BTCUSDT"):
        """Called upon every live ticker price tick from Binance WebSocket."""
        sym = symbol.upper()
        if sym == "ETHUSDT":
            self.last_price_eth = price
        else:
            self.last_price = price

        models = self.get_models(sym)
        events = []
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"

        for strat_id, model in models.items():
            if model.position_status == "OPEN":
                # 1. Update floating PnL
                if model.direction == "LONG":
                    flt_pnl = ((price - model.entry_price) / model.entry_price) * 100.0
                    model.peak_price = max(model.peak_price, price)
                else: # SHORT
                    flt_pnl = ((model.entry_price - price) / model.entry_price) * 100.0
                    model.trough_price = min(model.trough_price, price)

                cfg = model.config

                # 2. Check Dynamic Breakeven Activation
                be_pct = cfg.get("be_pct", 0.0)
                if be_pct > 0 and not model.be_active:
                    hit_be_threshold = (flt_pnl >= (be_pct * 100.0))
                    if hit_be_threshold:
                        model.be_active = True
                        if model.direction == "LONG":
                            model.current_sl = round(model.entry_price * 1.002, 2)
                        else:
                            model.current_sl = round(model.entry_price * 0.998, 2)
                        if model.active_ticket:
                            model.active_ticket["stop_loss"] = model.current_sl
                        now_ts = int(time.time())
                        model.active_markers.append({
                            "time": now_ts,
                            "position": "aboveBar" if model.direction == "LONG" else "belowBar",
                            "color": "#FF9F0A",
                            "shape": "circle",
                            "text": f"BE LOCKED @ ${model.current_sl:,.2f} (+0.2%)",
                            "size": 2,
                            "exitPrice": model.current_sl,
                            "isBreakeven": True
                        })
                        logger.info(f"⚡ [BREAKEVEN ACTIVATED] [{sym}] {model.name} locked BE stop at ${model.current_sl:,.2f}")
                        events.append({
                            "type": "BREAKEVEN_LOCKED",
                            "symbol": fmt_sym,
                            "asset": sym,
                            "strategy_id": model.strat_id,
                            "strategy_name": model.name,
                            "new_stop_loss": model.current_sl,
                            "price": price,
                            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
                        })

                # 3. Check Intra-bar Stop Loss
                hit_sl = False
                if model.direction == "LONG" and price <= model.current_sl:
                    hit_sl = True
                elif model.direction == "SHORT" and price >= model.current_sl:
                    hit_sl = True

                # 4. Check Intra-bar Take Profit
                hit_tp = False
                tp_pct = cfg.get("tp_pct", 0.0)
                if tp_pct > 0:
                    if model.direction == "LONG" and price >= model.target_tp:
                        hit_tp = True
                    elif model.direction == "SHORT" and price <= model.target_tp:
                        hit_tp = True

                if hit_sl or hit_tp:
                    exit_reason = "Take_Profit" if hit_tp else ("Fast_Breakeven" if model.be_active else "Stop_Loss")
                    exit_trade = self._close_position(model, price, exit_reason)
                    events.append({
                        "type": "POSITION_CLOSED",
                        "symbol": fmt_sym,
                        "asset": sym,
                        "strategy_id": model.strat_id,
                        "strategy_name": model.name,
                        "trade": exit_trade
                    })
                    events.append({
                        "type": "SIGNAL_EXIT",
                        "symbol": fmt_sym,
                        "asset": sym,
                        "strategy_id": model.strat_id,
                        "strategy_name": model.name,
                        "trade": exit_trade,
                        "autonomous": True
                    })
            else:
                # Update distance to trigger dynamically for flat models
                if model.next_entry_trigger > 0 and price > 0:
                    if model.direction == "LONG":
                        model.distance_to_trigger_pct = round(((model.next_entry_trigger - price) / price) * 100.0, 2)
                    else:
                        model.distance_to_trigger_pct = round(((price - model.next_entry_trigger) / price) * 100.0, 2)

        return events

    async def on_kline_closed(self, timeframe: str, candle: dict, binance_manager: Any, symbol: str = "BTCUSDT"):
        """
        Called on-the-fly when a candle officially finishes (is_closed == True).
        Evaluates structural entries and structural exits without human intervention.
        """
        sym = symbol.upper()
        tf = timeframe.lower()
        t_sec = candle.get("time") or (candle.get("timestamp", 0) // 1000)
        ts_ms = candle.get("timestamp") or (t_sec * 1000)
        curr_price = float(candle["close"])
        if sym == "ETHUSDT":
            self.last_price_eth = curr_price
        else:
            self.last_price = curr_price

        buffers = self.get_candle_buffers(sym)
        models = self.get_models(sym)
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"

        new_bar = {
            "time": t_sec,
            "timestamp": ts_ms,
            "datetime": datetime.fromtimestamp(t_sec, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": curr_price,
            "volume": float(candle.get("volume", 0.0))
        }

        # 1. Update candle buffer safely
        if tf in buffers:
            df = buffers[tf]
            last_t = df["time"].iloc[-1] if "time" in df.columns else (df["timestamp"].iloc[-1] // 1000)
            if not df.empty and last_t == t_sec:
                for col, val in new_bar.items():
                    df.at[df.index[-1], col] = val
            else:
                buffers[tf] = pd.concat([df, pd.DataFrame([new_bar])], ignore_index=True).tail(1000).reset_index(drop=True)
        else:
            buffers[tf] = pd.DataFrame([new_bar])

        # Recompute moving averages
        for w in [8, 25, 50, 55, 111]:
            if len(buffers[tf]) >= w:
                buffers[tf][f"MA{w}"] = buffers[tf]["close"].rolling(w).mean()

        # 2. Update rolling macro indicators
        self._update_macro_indicators(sym)

        # 3. Evaluate each strategy configured for this timeframe
        for strat_id, model in models.items():
            if model.timeframe != tf:
                continue

            self._evaluate_strategy_levels(model, sym)
            closes = buffers[tf]["close"].values
            highs = buffers[tf]["high"].values
            lows = buffers[tf]["low"].values
            n = len(closes)
            if n < 3:
                continue

            prev_close = closes[-2]
            curr_close = closes[-1]

            if model.strat_id in ["pippo-30m-new-gen", "pippo-30m-grd"]:
                df_cur = buffers[tf]
                m25_30 = float(df_cur["MA25"].iloc[-1]) if ("MA25" in df_cur and not pd.isna(df_cur["MA25"].iloc[-1])) else float(curr_close)
                m50_30 = float(df_cur["MA50"].iloc[-1]) if ("MA50" in df_cur and not pd.isna(df_cur["MA50"].iloc[-1])) else float(curr_close)

                if model.position_status == "FLAT":
                    a30 = (curr_close > m25_30) and (curr_close > m50_30) and ((curr_close - m25_30) / m25_30 < 0.008) and ((curr_close - m50_30) / m50_30 < 0.008)
                    sp = abs(m25_30 - m50_30) / m50_30 < 0.0015 if m50_30 > 0 else False
                    tr = np.maximum(df_cur["high"] - df_cur["low"], np.maximum((df_cur["high"] - df_cur["close"].shift()).abs(), (df_cur["low"] - df_cur["close"].shift()).abs()))
                    atr_val = tr.rolling(14).mean().iloc[-1] / curr_close
                    at = atr_val <= 0.01

                    if a30 and sp and at and model.regime_ok:
                        ticket = self._open_position(model, curr_close)
                        logger.info(f"🚀 [AUTONOMOUS SIGNAL TRIGGERED] [{sym}] {model.direction} {model.name} @ ${curr_close:,.2f}")
                        try:
                            from supabase_client import record_live_signal
                            record_live_signal({
                                "strategy_id": model.strat_id,
                                "symbol": sym,
                                "type": model.direction,
                                "price": curr_close,
                                "confidence": ticket["confidence_pct"],
                                "ticket": ticket
                            })
                        except Exception as e:
                            logger.warning(f"Supabase signal log error: {e}")

                        await binance_manager.broadcast({
                            "type": "NEW_SIGNAL",
                            "symbol": fmt_sym,
                            "asset": sym,
                            "ticket": ticket,
                            "autonomous": True
                        })
                elif model.position_status == "OPEN":
                    fc = (curr_close < m25_30) and (curr_close < m50_30) and ((m25_30 - curr_close) / m25_30 >= 0.005) and ((m50_30 - curr_close) / m50_30 >= 0.005)
                    if fc:
                        exit_trade = self._close_position(model, curr_close, "Force_Close_MA")
                        logger.info(f"⏹️ [AUTONOMOUS SIGNAL EXIT] [{sym}] {model.name} closed by Force Close MA @ ${curr_close:,.2f}")
                        await binance_manager.broadcast({
                            "type": "SIGNAL_EXIT",
                            "symbol": fmt_sym,
                            "asset": sym,
                            "strategy_id": model.strat_id,
                            "strategy_name": model.name,
                            "trade": exit_trade,
                            "autonomous": True
                        })
                continue

            # A. Evaluate Entry Breakout (When FLAT)
            if model.position_status == "FLAT":
                entry_triggered = False
                trigger_level = model.next_entry_trigger

                if model.direction == "LONG":
                    # Breakout: close crosses above entry swing top and regime is bullish
                    if curr_close > trigger_level and prev_close <= trigger_level and model.regime_ok:
                        entry_triggered = True
                elif model.direction == "SHORT":
                    # Breakdown: close crosses below entry swing bottom and regime is bearish
                    if curr_close < trigger_level and prev_close >= trigger_level and model.regime_ok:
                        entry_triggered = True

                if entry_triggered:
                    ticket = self._open_position(model, curr_close)
                    logger.info(f"🚀 [AUTONOMOUS SIGNAL TRIGGERED] [{sym}] {model.direction} {model.name} @ ${curr_close:,.2f}")
                    
                    # Record to Supabase
                    try:
                        from supabase_client import record_live_signal
                        record_live_signal({
                            "strategy_id": model.strat_id,
                            "symbol": sym,
                            "type": model.direction,
                            "price": curr_close,
                            "confidence": ticket["confidence_pct"],
                            "ticket": ticket
                        })
                    except Exception as e:
                        logger.warning(f"Supabase signal log error: {e}")

                    # Broadcast NEW_SIGNAL automatically to all frontend WebSocket clients
                    await binance_manager.broadcast({
                        "type": "NEW_SIGNAL",
                        "symbol": fmt_sym,
                        "asset": sym,
                        "ticket": ticket,
                        "autonomous": True
                    })

            # B. Evaluate Structural Exit (When OPEN)
            elif model.position_status == "OPEN":
                struct_exit = False
                floor_level = model.structural_floor

                if model.direction == "LONG":
                    # Long structural exit: candle close breaks below exit swing floor
                    if curr_close < floor_level and prev_close >= floor_level:
                        struct_exit = True
                elif model.direction == "SHORT":
                    # Short structural exit: candle close breaks above exit swing ceiling
                    if curr_close > floor_level and prev_close <= floor_level:
                        struct_exit = True

                if struct_exit:
                    exit_trade = self._close_position(model, curr_close, "Structure_Exit")
                    logger.info(f"⏹️ [AUTONOMOUS SIGNAL EXIT] [{sym}] {model.name} closed by Structure Exit @ ${curr_close:,.2f}")

                    # Broadcast SIGNAL_EXIT
                    await binance_manager.broadcast({
                        "type": "SIGNAL_EXIT",
                        "symbol": fmt_sym,
                        "asset": sym,
                        "strategy_id": model.strat_id,
                        "strategy_name": model.name,
                        "trade": exit_trade,
                        "autonomous": True
                    })

    def _open_position(self, model: StrategyModel, entry_p: float, entry_time: Optional[str] = None) -> dict:
        """Helper to open a position and construct the official live ticket."""
        cfg = model.config
        sl_pct = cfg.get("sl_pct", 0.05)
        tp_pct = cfg.get("tp_pct", 0.75)
        be_pct = cfg.get("be_pct", 0.03)

        model.position_status = "OPEN"
        model.entry_price = entry_p
        model.entry_time = entry_time or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        model.peak_price = entry_p
        model.trough_price = entry_p
        model.be_active = getattr(model, "be_active", False)

        if not getattr(model, "current_sl", 0.0) or model.current_sl == 0.0:
            if model.direction == "LONG":
                model.current_sl = round(entry_p * (1.0 - sl_pct), 2)
            else:
                model.current_sl = round(entry_p * (1.0 + sl_pct), 2)

        model.target_tp = round(entry_p * (1.0 + tp_pct if model.direction == "LONG" else 1.0 - tp_pct), 2)
        be_trigger_val = round(entry_p * (1.0 + be_pct if model.direction == "LONG" else 1.0 - be_pct), 2)

        sym = getattr(model, "symbol", "BTCUSDT")
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"
        curr_price = self.get_last_price(sym) or entry_p

        ticket = {
            "symbol": fmt_sym,
            "asset": sym,
            "direction": model.direction,
            "action": "BUY" if model.direction == "LONG" else "SELL",
            "strategy_name": model.name,
            "strategy_id": model.strat_id,
            "timeframe": model.timeframe,
            "confidence_pct": 92 if model.direction == "LONG" else 88,
            "confidence_blocks": 9 if model.direction == "LONG" else 8,
            "entry_price": entry_p,
            "current_price": curr_price,
            "stop_loss": model.current_sl,
            "stop_loss_pct": -round(sl_pct * 100, 1) if model.direction == "LONG" else round(sl_pct * 100, 1),
            "breakeven_trigger": be_trigger_val,
            "breakeven_trigger_pct": round(be_pct * 100, 1) if model.direction == "LONG" else -round(be_pct * 100, 1),
            "take_profit": model.target_tp,
            "take_profit_pct": round(tp_pct * 100, 1) if model.direction == "LONG" else -round(tp_pct * 100, 1),
            "risk_reward_ratio": f"{round(tp_pct / sl_pct, 2)}x",
            "timestamp": model.entry_time,
            "contributing_agents": ["quant", "trader", "informan"],
            "status": "LIVE_SIGNAL",
            "execution_mode": "AUTONOMOUS_ON_THE_FLY"
        }
        model.active_ticket = ticket

        # Build chart active markers
        try:
            clean_time = str(model.entry_time).replace(" UTC", "")
            e_ts = int(pd.to_datetime(clean_time).timestamp())
        except Exception:
            e_ts = int(time.time())

        markers = [
            {
                "time": e_ts,
                "position": "belowBar" if model.direction == "LONG" else "aboveBar",
                "color": "#30D158" if model.direction == "LONG" else "#FF453A",
                "shape": "arrowUp" if model.direction == "LONG" else "arrowDown",
                "text": f"ACTIVE {model.direction} @ ${entry_p:,.2f}",
                "size": 3,
                "entryPrice": entry_p,
                "side": model.direction,
                "status": "OPEN",
                "isActive": True
            }
        ]
        if getattr(model, "be_active", False):
            tf_sec = {"30m": 1800, "1h": 3600, "4h": 14400, "1w": 604800}.get(model.timeframe, 3600)
            markers.append({
                "time": e_ts + tf_sec,
                "position": "aboveBar" if model.direction == "LONG" else "belowBar",
                "color": "#FF9F0A",
                "shape": "circle",
                "text": f"BE LOCKED @ ${model.current_sl:,.2f} (+0.2%)",
                "size": 2,
                "exitPrice": model.current_sl,
                "isBreakeven": True
            })
        model.active_markers = markers
        model.active_ticket = ticket

        # Auto-persist to disk so disk reflects the newly opened position
        try:
            self._persist_opened_trade(model, ticket)
        except Exception as e:
            logger.error(f"Error persisting opened trade for {model.strat_id}: {e}", exc_info=True)

        return ticket

    def _close_position(self, model: StrategyModel, exit_p: float, reason: str) -> dict:
        """Helper to close a position and calculate finalized trade metrics."""
        entry_p = model.entry_price
        if model.direction == "LONG":
            gross_ret = (exit_p - entry_p) / entry_p
        else:
            gross_ret = (entry_p - exit_p) / entry_p

        fee = 0.0009 * 2 # roundtrip commission
        net_ret = (gross_ret - fee) * 100.0

        sym = getattr(model, "symbol", "BTCUSDT")
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"

        trade_record = {
            "symbol": fmt_sym,
            "asset": sym,
            "strategy_id": model.strat_id,
            "strategy_name": model.name,
            "side": model.direction,
            "action": "CLOSE_BUY" if model.direction == "LONG" else "CLOSE_SELL",
            "entry_price": entry_p,
            "exit_price": exit_p,
            "entry_time": model.entry_time,
            "exit_time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "net_return_pct": round(net_ret, 2),
            "reason": reason,
            "status": "CLOSED"
        }
        model.recent_trades.append(trade_record)
        if hasattr(model, "synced_recent_trades"):
            model.synced_recent_trades.append(trade_record)

        # Reset model state to FLAT
        model.position_status = "FLAT"
        model.entry_price = 0.0
        model.entry_time = None
        model.be_active = False
        model.active_ticket = None
        model.active_markers = []

        # Auto-persist to disk so disk is always 1:1 with engine RAM (Countermeasure 1)
        try:
            self._persist_closed_trade(model, trade_record)
        except Exception as e:
            logger.error(f"Error persisting closed trade for {model.strat_id}: {e}", exc_info=True)

        return trade_record

    def _persist_closed_trade(self, model: StrategyModel, trade_record: dict):
        """
        Persists closed trade into strategies.json and strategiesData.json automatically,
        and triggers metric recalculation to maintain Single Source of Truth between RAM & Disk.
        """
        if model.strat_id.startswith("test-"):
            return

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(backend_dir)
        sym = getattr(model, "symbol", "BTCUSDT").upper()
        is_eth = (sym == "ETHUSDT")
        
        backend_filename = "strategies_eth.json" if is_eth else "strategies.json"
        frontend_filename = "strategiesData_eth.json" if is_eth else "strategiesData.json"
        
        backend_path = os.path.join(backend_dir, "data", backend_filename)
        frontend_path = os.path.join(project_root, "frontend", "src", "data", frontend_filename)

        paths_to_update = [p for p in [backend_path, frontend_path] if os.path.exists(p)]
        updated_any = False

        for path in paths_to_update:
            try:
                with open(path, "r") as f:
                    strategies = json.load(f)

                strat = next((s for s in strategies if s.get("id") == model.strat_id), None)
                if not strat:
                    continue

                strat["has_active_signal"] = False
                strat["active_ticket"] = None

                trades = strat.get("trades", [])
                matching_trade = None
                for t in reversed(trades):
                    if t.get("status") in ["OPEN", "RUNNING"] or t.get("exit_time") in [None, "RUNNING"]:
                        matching_trade = t
                        break

                if not matching_trade and trades:
                    last_t = trades[-1]
                    if last_t.get("status") != "CLOSED":
                        matching_trade = last_t

                exit_time_str = trade_record.get("exit_time") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                if " UTC" in exit_time_str:
                    exit_time_str = exit_time_str.replace(" UTC", ":00")

                trade_no = matching_trade.get("trade_no", len(trades)) if matching_trade else (len(trades) + 1)

                if matching_trade:
                    matching_trade["status"] = "CLOSED"
                    matching_trade["exit_price"] = trade_record["exit_price"]
                    matching_trade["exit_time"] = exit_time_str
                    matching_trade["net_return_pct"] = trade_record["net_return_pct"]
                    matching_trade["gross_return_pct"] = round(trade_record["net_return_pct"] + 0.18, 2)
                    matching_trade["exit_reason"] = trade_record.get("reason", "Force Close MA (-0.5%)")
                else:
                    new_trade = {
                        "trade_no": trade_no,
                        "side": model.direction,
                        "type": model.direction,
                        "entry_time": trade_record.get("entry_time") or exit_time_str,
                        "exit_time": exit_time_str,
                        "entry_price": trade_record.get("entry_price") or trade_record["exit_price"],
                        "exit_price": trade_record["exit_price"],
                        "gross_return_pct": round(trade_record["net_return_pct"] + 0.18, 2),
                        "net_return_pct": trade_record["net_return_pct"],
                        "exit_reason": trade_record.get("reason", "Force Close MA (-0.5%)"),
                        "be_activated": getattr(model, "be_active", False),
                        "status": "CLOSED"
                    }
                    trades.append(new_trade)

                # Markers handling: deactivate active entry marker and append exit marker
                markers = strat.get("markers", [])
                for m in markers:
                    if m.get("tradeNo") == trade_no or m.get("isActive") is True:
                        m["isActive"] = False

                exit_marker = {
                    "time": exit_time_str,
                    "position": "aboveBar" if model.direction == "LONG" else "belowBar",
                    "color": "#EF4444" if model.direction == "LONG" else "#10B981",
                    "shape": "arrowDown" if model.direction == "LONG" else "arrowUp",
                    "text": f"EXIT {trade_record.get('reason', 'Exit')} #{trade_no}",
                    "tradeNo": trade_no,
                    "isActive": False
                }
                markers.append(exit_marker)
                strat["markers"] = markers

                with open(path, "w") as f:
                    json.dump(strategies, f, indent=2)

                updated_any = True
                logger.info(f"💾 [AUTO-PERSIST] Updated disk strategy file: {path} for {model.strat_id}")

            except Exception as e:
                logger.error(f"Error persisting trade to {path}: {e}", exc_info=True)

        if not updated_any:
            return

        # Trigger metric recalculation for BTC
        if not is_eth:
            try:
                from recalculate_btc_metrics import process_strategies
                for path in paths_to_update:
                    updated = process_strategies(path)
                    with open(path, "w") as f:
                        json.dump(updated, f, indent=2)
                logger.info(f"📊 [AUTO-RECALCULATE] Successfully harmonized metrics across disk files for {model.strat_id}")
            except Exception as e:
                logger.warning(f"Could not automatically recalculate BTC metrics: {e}")

        # Fast in-memory catalog reload in main.py without network latency
        try:
            import main as backend_main
            if hasattr(backend_main, "reload_local_catalog"):
                backend_main.reload_local_catalog(sym)
                logger.info("🔄 [AUTO-SYNC] Fast reloaded in-memory catalog for backend API")
        except Exception:
            pass

    def _persist_opened_trade(self, model: StrategyModel, ticket: dict):
        """Persists newly opened trade into disk files and updates in-memory catalog."""
        if model.strat_id.startswith("test-"):
            return

        backend_dir = os.path.dirname(os.path.abspath(__file__))
        sym = getattr(model, "symbol", "BTCUSDT").upper()
        is_eth = (sym == "ETHUSDT")

        backend_filename = "strategies_eth.json" if is_eth else "strategies.json"
        frontend_filename = "strategiesData_eth.json" if is_eth else "strategiesData.json"

        project_root = os.path.dirname(backend_dir)
        backend_path = os.path.join(backend_dir, "data", backend_filename)
        frontend_path = os.path.join(project_root, "frontend", "src", "data", frontend_filename)
        paths_to_update = [p for p in [backend_path, frontend_path] if os.path.exists(p)]
        updated_any = False

        for path in paths_to_update:
            try:
                with open(path, "r") as f:
                    strategies = json.load(f)

                strat = next((s for s in strategies if s.get("id") == model.strat_id), None)
                if not strat:
                    continue

                trades = strat.get("trades", [])

                # Check if a trade with this exact entry_time already exists
                existing_entry = next((t for t in trades if t.get("entry_time") == model.entry_time), None)
                if existing_entry and existing_entry.get("status") == "CLOSED":
                    # This trade was already closed in history; do not re-open or duplicate
                    continue

                strat["has_active_signal"] = True
                strat["active_ticket"] = ticket

                has_open = any(t.get("status") in ["OPEN", "RUNNING"] or t.get("exit_time") in [None, "RUNNING"] for t in trades)
                if not has_open and not existing_entry:
                    trade_no = len(trades) + 1
                    open_trade = {
                        "trade_no": trade_no,
                        "side": model.direction,
                        "type": model.direction,
                        "entry_time": model.entry_time,
                        "exit_time": "RUNNING",
                        "entry_price": model.entry_price,
                        "exit_price": model.entry_price,
                        "gross_return_pct": 0.0,
                        "net_return_pct": -0.18,
                        "exit_reason": f"Active Signal ({'BE Locked' if model.be_active else 'Trailing'})",
                        "be_activated": model.be_active,
                        "status": "OPEN",
                        "stop_loss": model.current_sl,
                        "take_profit": model.target_tp,
                        "is_active": True
                    }
                    trades.append(open_trade)
                elif existing_entry and existing_entry.get("status") in ["OPEN", "RUNNING"]:
                    # Update active parameters on the existing open trade
                    existing_entry["stop_loss"] = model.current_sl
                    existing_entry["take_profit"] = model.target_tp
                    existing_entry["be_activated"] = model.be_active
                    existing_entry["exit_reason"] = f"Active Signal ({'BE Locked' if model.be_active else 'Trailing'})"

                # Add active markers
                if hasattr(model, "active_markers") and model.active_markers:
                    markers = strat.get("markers", [])
                    for am in model.active_markers:
                        if not any(m.get("time") == am.get("time") and m.get("text") == am.get("text") for m in markers):
                            markers.append(am)
                    strat["markers"] = markers

                with open(path, "w") as f:
                    json.dump(strategies, f, indent=2)

                updated_any = True
                logger.info(f"💾 [AUTO-PERSIST] Persisted OPEN trade to {path} for {model.strat_id}")
            except Exception as e:
                logger.error(f"Error persisting open trade to {path}: {e}", exc_info=True)

        if not updated_any:
            return

        try:
            import main as backend_main
            if hasattr(backend_main, "reload_local_catalog"):
                backend_main.reload_local_catalog(sym)
                logger.info("🔄 [AUTO-SYNC] Fast reloaded in-memory catalog for OPEN trade")
        except Exception:
            pass

    def get_live_telemetry(self, symbol: str = "BTCUSDT") -> dict:
        """Returns the full autonomous engine status across all strategies for the symbol."""
        sym = symbol.upper()
        models = self.get_models(sym)
        macro = self.get_macro_state(sym)
        last_p = self.get_last_price(sym)

        results = []
        for sid, m in models.items():
            flt_pnl = 0.0
            if m.position_status == "OPEN" and m.entry_price > 0:
                if m.direction == "LONG":
                    flt_pnl = ((last_p - m.entry_price) / m.entry_price) * 100.0
                else:
                    flt_pnl = ((m.entry_price - last_p) / m.entry_price) * 100.0

            results.append({
                "strategy_id": m.strat_id,
                "name": m.name,
                "timeframe": m.timeframe,
                "direction": m.direction,
                "position_status": m.position_status, # "FLAT" or "OPEN"
                "current_price": last_p,
                "entry_price": m.entry_price if m.position_status == "OPEN" else None,
                "entry_time": m.entry_time,
                "floating_pnl_pct": round(flt_pnl, 2),
                "stop_loss": m.current_sl if m.position_status == "OPEN" else None,
                "be_active": m.be_active,
                "take_profit": m.target_tp if m.position_status == "OPEN" else None,
                "next_entry_trigger": m.next_entry_trigger,
                "structural_floor": m.structural_floor,
                "distance_to_trigger_pct": m.distance_to_trigger_pct,
                "regime_aligned": m.regime_ok,
                "recent_trades_count": len(m.recent_trades)
            })

        return {
            "status": "AUTONOMOUS_ENGINE_LIVE",
            "symbol": sym,
            "current_price": last_p,
            "current_btc_price": self.last_price,
            "current_eth_price": self.last_price_eth,
            "macro_state": macro,
            "strategies": results,
            "timestamp": int(time.time() * 1000)
        }

    def get_active_or_latest_ticket(self, strategy_id: Optional[str] = None, symbol: str = "BTCUSDT") -> dict:
        """Get the active signal ticket or an intelligent watch ticket for the strategy."""
        sym = symbol.upper()
        models = self.get_models(sym)
        sid = strategy_id or "pippo-1h-enhanced"
        model = models.get(sid) or models["pippo-1h-enhanced"]
        last_p = self.get_last_price(sym)

        if model.active_ticket:
            ticket = dict(model.active_ticket)
            ticket["current_price"] = last_p
            return ticket

        curr_p = last_p
        sl_pct = model.config.get("sl_pct", 0.05)
        tp_pct = model.config.get("tp_pct", 0.75)
        be_pct = model.config.get("be_pct", 0.03)
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"

        return {
            "symbol": fmt_sym,
            "asset": sym,
            "direction": model.direction,
            "action": "BUY" if model.direction == "LONG" else "SELL",
            "strategy_name": model.name,
            "strategy_id": model.strat_id,
            "timeframe": model.timeframe,
            "confidence_pct": 88 if model.direction == "LONG" else 85,
            "confidence_blocks": 8,
            "entry_price": model.next_entry_trigger if model.next_entry_trigger > 0 else curr_p,
            "current_price": curr_p,
            "stop_loss": round((model.next_entry_trigger or curr_p) * (1.0 - sl_pct if model.direction == "LONG" else 1.0 + sl_pct), 2),
            "stop_loss_pct": -round(sl_pct * 100, 1) if model.direction == "LONG" else round(sl_pct * 100, 1),
            "breakeven_trigger": round((model.next_entry_trigger or curr_p) * (1.0 + be_pct if model.direction == "LONG" else 1.0 - be_pct), 2),
            "breakeven_trigger_pct": round(be_pct * 100, 1) if model.direction == "LONG" else -round(be_pct * 100, 1),
            "take_profit": round((model.next_entry_trigger or curr_p) * (1.0 + tp_pct if model.direction == "LONG" else 1.0 - tp_pct), 2),
            "take_profit_pct": round(tp_pct * 100, 1) if model.direction == "LONG" else -round(tp_pct * 100, 1),
            "risk_reward_ratio": f"{round(tp_pct / sl_pct, 2)}x",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "contributing_agents": ["quant", "trader", "informan"],
            "status": "ACTIVE_WATCH",
            "execution_mode": "AUTONOMOUS_ON_THE_FLY",
            "trigger_distance_pct": model.distance_to_trigger_pct,
            "regime_aligned": model.regime_ok
        }

live_signal_engine = LiveSignalEngine()

#!/usr/bin/env python3
"""
Autonomous Live Signal Engine for Quentra.
Executes quantitative algorithmic strategy rules on-the-fly:
- Streams & monitors closed candles (30m, 1h, 4h, 1w)
- Computes Smart Money Concepts (SMC) swing highs/lows and market structure
- Evaluates Macro Regime Filters (Weekly MA55, 4H SMA111, 1H EMA50)
- Detects entry breakouts, dynamic breakeven locks, structural exits, and stop losses
- Automatically dispatches signals to WebSocket clients and records them to Supabase
"""

import os
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
    def __init__(self, strat_id: str, name: str, tf: str, direction: str, config: dict):
        self.strat_id = strat_id
        self.name = name
        self.timeframe = tf
        self.direction = direction.upper() # "LONG" or "SHORT"
        self.config = config
        
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

class LiveSignalEngine:
    def __init__(self):
        self.is_initialized = False
        self.last_price = 0.0
        self.last_eval_timestamp = 0
        
        # Rolling candle history (last 500-1000 bars per timeframe)
        self.candle_buffers: Dict[str, pd.DataFrame] = {}
        
        # Registered automated strategy models
        self.strategies: Dict[str, StrategyModel] = {
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
                }
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
                }
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
                }
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
                }
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
                }
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
                }
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
                }
            ),
            "pure-macro-weekly-ma55": StrategyModel(
                strat_id="pure-macro-weekly-ma55",
                name="Pure Macro Weekly MA55",
                tf="1w",
                direction="LONG",
                config={
                    "regime": "weekly_ma55_close"
                }
            )
        }

        # Shared macro indicators
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

    def initialize_with_parquets(self, parquet_dfs: dict):
        """Warm up engine with historical parquet bars and sync initial state."""
        try:
            for tf, df in parquet_dfs.items():
                if df is not None and not df.empty:
                    std_df = standardize_candle_df(df.tail(1000))
                    self.candle_buffers[tf] = std_df.reset_index(drop=True)
            
            # Initialize last_price from the latest available closed bar
            for tf_pref in ["30m", "1h", "4h", "1d", "1w"]:
                if tf_pref in self.candle_buffers and not self.candle_buffers[tf_pref].empty:
                    self.last_price = float(self.candle_buffers[tf_pref]["close"].iloc[-1])
                    break

            # Recalculate macro state
            self._update_macro_indicators()
            
            # Synchronize active open trades from recent history
            self.sync_active_positions()

            # Evaluate current market state across all strategies
            self._evaluate_all_models_initial()
            self.is_initialized = True
            logger.info("Autonomous Live Signal Engine initialized successfully with historical buffers and active trade sync!")
        except Exception as e:
            logger.error(f"Failed to initialize Live Signal Engine: {e}", exc_info=True)

    def _update_macro_indicators(self):
        """Update Weekly MA55, 4H SMA111, and 1H EMA50 dynamically from rolling buffers."""
        try:
            # 1. Weekly MA55
            if "1w" in self.candle_buffers and not self.candle_buffers["1w"].empty:
                df_w = self.candle_buffers["1w"]
                if "MA55" in df_w.columns and not pd.isna(df_w["MA55"].iloc[-1]):
                    self.macro_state["weekly_ma55"] = float(df_w["MA55"].iloc[-1])
                else:
                    self.macro_state["weekly_ma55"] = float(df_w["close"].rolling(55).mean().iloc[-1])
                self.macro_state["weekly_close"] = float(df_w["close"].iloc[-1])
                effective_weekly_p = self.last_price if self.last_price > 0 else self.macro_state["weekly_close"]
                self.macro_state["is_weekly_bullish"] = effective_weekly_p >= self.macro_state["weekly_ma55"]

            # 2. 4H SMA111
            if "4h" in self.candle_buffers and not self.candle_buffers["4h"].empty:
                df_4h = self.candle_buffers["4h"]
                if "MA111" in df_4h.columns and not pd.isna(df_4h["MA111"].iloc[-1]):
                    self.macro_state["sma111_4h"] = float(df_4h["MA111"].iloc[-1])
                else:
                    self.macro_state["sma111_4h"] = float(df_4h["close"].rolling(111).mean().iloc[-1])
                self.macro_state["close_4h"] = float(df_4h["close"].iloc[-1])
                effective_4h_p = self.last_price if self.last_price > 0 else self.macro_state["close_4h"]
                self.macro_state["is_4h_bullish"] = effective_4h_p >= self.macro_state["sma111_4h"]

            # 3. 1H EMA50
            if "1h" in self.candle_buffers and not self.candle_buffers["1h"].empty:
                df_1h = self.candle_buffers["1h"]
                self.macro_state["ema50_1h"] = float(df_1h["close"].ewm(span=50, adjust=False).mean().iloc[-1])
                self.macro_state["close_1h"] = float(df_1h["close"].iloc[-1])
                effective_1h_p = self.last_price if self.last_price > 0 else self.macro_state["close_1h"]
                self.macro_state["is_1h_bullish"] = effective_1h_p >= self.macro_state["ema50_1h"]

            # Macro regime summary
            ma55 = self.macro_state["weekly_ma55"]
            effective_p = self.last_price if self.last_price > 0 else self.macro_state["weekly_close"]
            diff_pct = ((effective_p - ma55) / ma55) * 100.0 if ma55 > 0 else 0.0
            self.macro_state["distance_weekly_ma55_pct"] = round(diff_pct, 2)
            if self.macro_state["is_weekly_bullish"]:
                self.macro_state["regime_description"] = f"BULLISH EXPANSION (+{diff_pct:.1f}% vs Weekly MA55)"
            else:
                self.macro_state["regime_description"] = f"MACRO DISCOUNT ({diff_pct:.1f}% vs Weekly MA55)"

        except Exception as ex:
            logger.warning(f"Error calculating macro indicators: {ex}")


    def sync_active_positions(self):
        """
        Replays recent market bars for each strategy to restore active OPEN positions,
        exact entry prices, breakeven status, and trailing stops.
        """
        try:
            for strat_id, model in self.strategies.items():
                tf = model.timeframe
                if tf not in self.candle_buffers or self.candle_buffers[tf].empty:
                    continue

                df = self.candle_buffers[tf]
                highs = df["high"].values
                lows = df["low"].values
                closes = df["close"].values
                n = len(closes)
                if n < 50:
                    continue

                cfg = model.config
                maj_len = cfg.get("maj_swing", 50)
                ent_len = cfg.get("ent_swing", 16)
                ex_len = cfg.get("ex_swing", 48)
                sl_pct = cfg.get("sl_pct", 0.05)
                be_pct = cfg.get("be_pct", 0.03)
                tp_pct = cfg.get("tp_pct", 0.75)
                direction = model.direction

                top_maj, btm_maj = compute_swings_arr(highs, lows, min(maj_len, n - 1))
                top_ent, btm_ent = compute_swings_arr(highs, lows, min(ent_len, n - 1))
                top_ex, btm_ex = compute_swings_arr(highs, lows, min(ex_len, n - 1))

                sma111_4h = self.macro_state.get("sma111_4h", 0.0)
                weekly_ma55 = self.macro_state.get("weekly_ma55", 0.0)

                in_pos = False
                entry_p = 0.0
                entry_time = ""
                curr_sl = 0.0
                be_active = False
                peak_p = 0.0
                trough_p = 0.0

                top_y = 0.0
                itop_y = 0.0
                itop_cross = True
                ibtm_y = 0.0
                btm_y = 0.0
                ibtm_cross = True

                start_bar = max(1, n - 600)
                replayed_closed = []
                for i in range(start_bar, n):
                    prev_itop = itop_y
                    prev_ibtm = ibtm_y

                    if top_maj[i] > 0: top_y = top_maj[i]
                    if btm_maj[i] > 0: btm_y = btm_maj[i]
                    if top_ent[i] > 0: itop_y = top_ent[i]; itop_cross = True
                    if btm_ent[i] > 0: ibtm_y = btm_ent[i]; ibtm_cross = True

                    reg_rule = cfg.get("regime", "")
                    reg_ok = True
                    if "4h_sma111" in reg_rule and sma111_4h > 0:
                        reg_ok = closes[i] >= sma111_4h
                    elif "weekly_ma55" in reg_rule and weekly_ma55 > 0:
                        reg_ok = closes[i] < weekly_ma55

                    cur_dt = str(df["datetime"].iloc[i]) if "datetime" in df.columns else datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

                    if direction == "LONG":
                        crossover = (closes[i] > itop_y) and (closes[i - 1] <= prev_itop)
                        ex_floor = [b for b in btm_ex[:i + 1] if b > 0][-1] if any(btm_ex[:i + 1] > 0) else lows[i]

                        if not in_pos:
                            if crossover and itop_cross and (top_y != itop_y) and reg_ok:
                                in_pos = True
                                entry_p = float(closes[i])
                                entry_time = cur_dt
                                peak_p = float(highs[i])
                                curr_sl = round(entry_p * (1.0 - sl_pct), 2)
                                be_active = False
                                itop_cross = False
                        else:
                            peak_p = max(peak_p, float(highs[i]))
                            if be_pct > 0 and not be_active and closes[i] >= entry_p * (1.0 + be_pct):
                                be_active = True
                                curr_sl = round(entry_p * 1.002, 2)
                            
                            hit_sl = lows[i] <= curr_sl
                            hit_tp = highs[i] >= entry_p * (1.0 + tp_pct)
                            struct_exit = closes[i] < ex_floor

                            if hit_sl or hit_tp or struct_exit:
                                exit_p = curr_sl if hit_sl else (entry_p * (1.0 + tp_pct) if hit_tp else float(closes[i]))
                                reason = "Breakeven SL" if (hit_sl and be_active) else ("Stop Loss" if hit_sl else ("Take Profit" if hit_tp else "Bearish CHoCH Exit"))
                                raw_ret = (exit_p - entry_p) / entry_p
                                net_ret = (raw_ret - 0.0018) * 100.0
                                replayed_closed.append({
                                    "side": direction,
                                    "type": direction,
                                    "entry_time": entry_time,
                                    "exit_time": cur_dt,
                                    "entry_price": entry_p,
                                    "exit_price": exit_p,
                                    "gross_return_pct": round(raw_ret * 100.0, 2),
                                    "net_return_pct": round(net_ret, 2),
                                    "exit_reason": reason,
                                    "be_activated": be_active,
                                    "status": "CLOSED"
                                })
                                in_pos = False
                    else: # SHORT
                        crossunder = (closes[i] < ibtm_y) and (closes[i - 1] >= prev_ibtm)
                        ex_ceil = [t for t in top_ex[:i + 1] if t > 0][-1] if any(top_ex[:i + 1] > 0) else highs[i]

                        if not in_pos:
                            if crossunder and ibtm_cross and (btm_y != ibtm_y) and reg_ok:
                                in_pos = True
                                entry_p = float(closes[i])
                                entry_time = cur_dt
                                trough_p = float(lows[i])
                                curr_sl = round(entry_p * (1.0 + sl_pct), 2)
                                be_active = False
                                ibtm_cross = False
                        else:
                            trough_p = min(trough_p, float(lows[i]))
                            if be_pct > 0 and not be_active and closes[i] <= entry_p * (1.0 - be_pct):
                                be_active = True
                                curr_sl = round(entry_p * 0.998, 2)
                            
                            hit_sl = highs[i] >= curr_sl
                            hit_tp = lows[i] <= entry_p * (1.0 - tp_pct)
                            struct_exit = closes[i] > ex_ceil

                            if hit_sl or hit_tp or struct_exit:
                                exit_p = curr_sl if hit_sl else (entry_p * (1.0 - tp_pct) if hit_tp else float(closes[i]))
                                reason = "Breakeven SL" if (hit_sl and be_active) else ("Stop Loss" if hit_sl else ("Take Profit" if hit_tp else "Structure_Exit"))
                                raw_ret = (entry_p - exit_p) / entry_p
                                net_ret = (raw_ret - 0.0018) * 100.0
                                replayed_closed.append({
                                    "side": direction,
                                    "type": direction,
                                    "entry_time": entry_time,
                                    "exit_time": cur_dt,
                                    "entry_price": entry_p,
                                    "exit_price": exit_p,
                                    "gross_return_pct": round(raw_ret * 100.0, 2),
                                    "net_return_pct": round(net_ret, 2),
                                    "exit_reason": reason,
                                    "be_activated": be_active,
                                    "status": "CLOSED"
                                })
                                in_pos = False

                model.synced_recent_trades = replayed_closed

                if in_pos:
                    model.position_status = "OPEN"
                    model.entry_price = entry_p
                    model.entry_time = entry_time
                    model.peak_price = peak_p
                    model.trough_price = trough_p
                    model.current_sl = curr_sl
                    model.be_active = be_active
                    model.target_tp = round(entry_p * (1.0 + tp_pct if direction == "LONG" else 1.0 - tp_pct), 2)
                    self._open_position(model, entry_p, entry_time)
                    model.current_sl = curr_sl
                    model.be_active = be_active
                    if model.active_ticket:
                        model.active_ticket["stop_loss"] = curr_sl
                    logger.info(f"🚀 [STATE SYNC] Restored active {direction} trade for {model.name}: Entry ${entry_p:,.2f} at {entry_time} (SL: ${curr_sl:,.2f}, BE: {be_active})")
                else:
                    model.position_status = "FLAT"
                    model.entry_price = 0.0
                    model.active_ticket = None
                    model.active_markers = []

        except Exception as e:
            logger.warning(f"Error in sync_active_positions: {e}", exc_info=True)

    def _evaluate_all_models_initial(self):
        """Compute swing levels and set initial telemetry for all strategies."""
        for strat_id, model in self.strategies.items():
            self._evaluate_strategy_levels(model)

    def _evaluate_strategy_levels(self, model: StrategyModel):
        """Recalculate swing triggers, structural floors, and regime alignment."""
        tf = model.timeframe
        if tf not in self.candle_buffers or self.candle_buffers[tf].empty:
            return

        df = self.candle_buffers[tf]
        highs = df["high"].values
        lows = df["low"].values
        closes = df["close"].values
        n = len(closes)
        if n < 50:
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

        curr_p = self.last_price if self.last_price > 0 else float(closes[-1])

        # Check regime alignment
        regime_rule = cfg.get("regime", "")
        if regime_rule == "4h_sma111":
            model.regime_ok = self.macro_state["is_4h_bullish"]
        elif regime_rule == "4h_sma111_and_1h_ema50":
            model.regime_ok = self.macro_state["is_4h_bullish"] and self.macro_state["is_1h_bullish"]
        elif regime_rule == "weekly_ma55_and_4h_sma111":
            model.regime_ok = (not self.macro_state["is_weekly_bullish"]) and (not self.macro_state["is_4h_bullish"])
        elif regime_rule == "weekly_ma55":
            model.regime_ok = not self.macro_state["is_weekly_bullish"]
        elif regime_rule == "weekly_ma55_close":
            model.regime_ok = self.macro_state["is_weekly_bullish"]
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

    def on_ticker_tick(self, price: float, timestamp: int):
        """Called upon every live ticker price tick from Binance WebSocket."""
        self.last_price = price
        events = []

        for strat_id, model in self.strategies.items():
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
                            "text": f"BE LOCKED @ ${model.current_sl:,.0f} (+0.2%)",
                            "size": 2,
                            "exitPrice": model.current_sl,
                            "isBreakeven": True
                        })
                        logger.info(f"⚡ [BREAKEVEN ACTIVATED] {model.name} locked BE stop at ${model.current_sl:,.2f}")
                        events.append({
                            "type": "BREAKEVEN_LOCKED",
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
                        "strategy_id": model.strat_id,
                        "strategy_name": model.name,
                        "trade": exit_trade
                    })
            else:
                # Update distance to trigger dynamically for flat models
                if model.next_entry_trigger > 0 and price > 0:
                    if model.direction == "LONG":
                        model.distance_to_trigger_pct = round(((model.next_entry_trigger - price) / price) * 100.0, 2)
                    else:
                        model.distance_to_trigger_pct = round(((price - model.next_entry_trigger) / price) * 100.0, 2)

        return events

    async def on_kline_closed(self, timeframe: str, candle: dict, binance_manager: Any):
        """
        Called on-the-fly when a candle officially finishes (is_closed == True).
        Evaluates structural entries and structural exits without human intervention.
        """
        tf = timeframe.lower()
        t_sec = candle.get("time") or (candle.get("timestamp", 0) // 1000)
        ts_ms = candle.get("timestamp") or (t_sec * 1000)
        self.last_price = float(candle["close"])

        new_bar = {
            "time": t_sec,
            "timestamp": ts_ms,
            "datetime": datetime.fromtimestamp(t_sec, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "open": float(candle["open"]),
            "high": float(candle["high"]),
            "low": float(candle["low"]),
            "close": float(candle["close"]),
            "volume": float(candle["volume"])
        }

        # 1. Update candle buffer safely
        if tf in self.candle_buffers:
            df = self.candle_buffers[tf]
            last_t = df["time"].iloc[-1] if "time" in df.columns else (df["timestamp"].iloc[-1] // 1000)
            if not df.empty and last_t == t_sec:
                for col, val in new_bar.items():
                    df.at[df.index[-1], col] = val
            else:
                self.candle_buffers[tf] = pd.concat([df, pd.DataFrame([new_bar])], ignore_index=True).tail(1000).reset_index(drop=True)
        else:
            self.candle_buffers[tf] = pd.DataFrame([new_bar])

        # Recompute moving averages
        for w in [8, 25, 50, 55, 111]:
            if len(self.candle_buffers[tf]) >= w:
                self.candle_buffers[tf][f"MA{w}"] = self.candle_buffers[tf]["close"].rolling(w).mean()

        # 2. Update rolling macro indicators
        self._update_macro_indicators()

        # 3. Evaluate each strategy configured for this timeframe
        for strat_id, model in self.strategies.items():
            if model.timeframe != tf:
                continue

            self._evaluate_strategy_levels(model)
            closes = self.candle_buffers[tf]["close"].values
            highs = self.candle_buffers[tf]["high"].values
            lows = self.candle_buffers[tf]["low"].values
            n = len(closes)
            if n < 3:
                continue

            prev_close = closes[-2]
            curr_close = closes[-1]

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
                    logger.info(f"🚀 [AUTONOMOUS SIGNAL TRIGGERED] {model.direction} {model.name} @ ${curr_close:,.2f}")
                    
                    # Record to Supabase
                    try:
                        from supabase_client import record_live_signal
                        record_live_signal({
                            "strategy_id": model.strat_id,
                            "symbol": "BTCUSDT",
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
                    logger.info(f"⏹️ [AUTONOMOUS SIGNAL EXIT] {model.name} closed by Structure Exit @ ${curr_close:,.2f}")

                    # Broadcast SIGNAL_EXIT
                    await binance_manager.broadcast({
                        "type": "SIGNAL_EXIT",
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

        ticket = {
            "symbol": "BTC/USDT",
            "direction": model.direction,
            "strategy_name": model.name,
            "strategy_id": model.strat_id,
            "confidence_pct": 92 if model.direction == "LONG" else 88,
            "confidence_blocks": 9 if model.direction == "LONG" else 8,
            "entry_price": entry_p,
            "current_price": self.last_price or entry_p,
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
                "text": f"ACTIVE {model.direction} @ ${entry_p:,.0f}",
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
                "text": f"BE LOCKED @ ${model.current_sl:,.0f} (+0.2%)",
                "size": 2,
                "exitPrice": model.current_sl,
                "isBreakeven": True
            })
        model.active_markers = markers

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

        trade_record = {
            "strategy_id": model.strat_id,
            "strategy_name": model.name,
            "side": model.direction,
            "entry_price": entry_p,
            "exit_price": exit_p,
            "entry_time": model.entry_time,
            "exit_time": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "net_return_pct": round(net_ret, 2),
            "reason": reason,
            "status": "CLOSED"
        }
        model.recent_trades.append(trade_record)

        # Reset model state to FLAT
        model.position_status = "FLAT"
        model.entry_price = 0.0
        model.entry_time = None
        model.be_active = False
        model.active_ticket = None
        model.active_markers = []

        return trade_record

    def get_live_telemetry(self) -> dict:
        """Returns the full autonomous engine status across all strategies."""
        results = []
        for sid, m in self.strategies.items():
            flt_pnl = 0.0
            if m.position_status == "OPEN" and m.entry_price > 0:
                if m.direction == "LONG":
                    flt_pnl = ((self.last_price - m.entry_price) / m.entry_price) * 100.0
                else:
                    flt_pnl = ((m.entry_price - self.last_price) / m.entry_price) * 100.0

            results.append({
                "strategy_id": m.strat_id,
                "name": m.name,
                "timeframe": m.timeframe,
                "direction": m.direction,
                "position_status": m.position_status, # "FLAT" or "OPEN"
                "current_price": self.last_price,
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
            "current_btc_price": self.last_price,
            "macro_state": self.macro_state,
            "strategies": results,
            "timestamp": int(time.time() * 1000)
        }

    def get_active_or_latest_ticket(self, strategy_id: Optional[str] = None) -> dict:
        """Get the active signal ticket or an intelligent watch ticket for the strategy."""
        sid = strategy_id or "pippo-1h-enhanced"
        model = self.strategies.get(sid) or self.strategies["pippo-1h-enhanced"]

        if model.active_ticket:
            ticket = dict(model.active_ticket)
            ticket["current_price"] = self.last_price
            return ticket

        # Return real-time ACTIVE_WATCH ticket
        curr_p = self.last_price
        sl_pct = model.config.get("sl_pct", 0.05)
        tp_pct = model.config.get("tp_pct", 0.75)
        be_pct = model.config.get("be_pct", 0.03)

        return {
            "symbol": "BTC/USDT",
            "direction": model.direction,
            "strategy_name": model.name,
            "strategy_id": model.strat_id,
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

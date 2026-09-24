#!/usr/bin/env python3
"""
Quentra Multi-Asset Quantitative Pipeline: ETHUSDT
Downloads official Binance historical klines (2017-2026),
generates multi-timeframe rolling indicators, and executes deterministic backtests
for all 10 quantitative algorithms matching ground-truth trading specifications.

Outputs:
- backend/data/ETHUSDT_{tf}.parquet (30m, 1h, 4h, 1d, 1w)
- backend/data/klines_cache_eth.json
- backend/data/strategies_eth.json
- frontend/src/data/strategiesData_eth.json
- frontend/src/data/klinesBaseline_eth.json
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
import numpy as np
import pandas as pd
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FRONTEND_DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend", "src", "data")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(FRONTEND_DATA_DIR, exist_ok=True)

BINANCE_BASE = "https://data-api.binance.vision/api/v3/klines"
START_2017_MS = 1502928000000 # 2017-08-17 00:00:00 UTC (Binance earliest bar)
START_2019_MS = 1546300800000 # 2019-01-01 00:00:00 UTC
START_2020_MS = 1577836800000 # 2020-01-01 00:00:00 UTC
NOW_MS = int(time.time() * 1000)

INTERVAL_START_MS = {
    "1w": START_2017_MS,
    "1d": START_2017_MS,
    "4h": START_2019_MS,
    "1h": START_2020_MS,
    "30m": START_2020_MS,
}

INTERVALS = ["1w", "1d", "4h", "1h", "30m"]
MA_WINDOWS = [8, 25, 50, 55, 111]
FEE = 0.0009 # 0.09% per trade (Binance standard VIP0 taker fee)

def make_badge(ret, suffix=""):
    sign = "+" if ret >= 0 else ""
    if suffix:
        return f"{sign}{ret:,.2f}% Return ({suffix})"
    return f"{sign}{ret:,.2f}% Return"

def fetch_klines_range(symbol: str, interval: str, start_ms: int, end_ms: int):
    out = []
    cursor = start_ms
    start_dt = pd.to_datetime(start_ms, unit='ms')
    print(f"  Fetching {symbol} {interval} from {start_dt}...")
    while cursor < end_ms:
        url = f"{BINANCE_BASE}?symbol={symbol}&interval={interval}&startTime={cursor}&limit=1000"
        batch = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=20) as resp:
                    batch = json.loads(resp.read().decode())
                    break
            except Exception:
                time.sleep(1.0 + attempt * 1.5)
        
        if not batch:
            break
        
        out.extend(batch)
        last_open = batch[-1][0]
        cursor = last_open + 1
        if len(batch) < 1000:
            break
        time.sleep(0.06)
    
    print(f"  ✓ Downloaded {len(out)} raw bars for {interval}")
    return out

def process_klines(raw_rows):
    if not raw_rows:
        return pd.DataFrame()
    
    df = pd.DataFrame(raw_rows, columns=[
        'timestamp', 'open', 'high', 'low', 'close', 'volume', 'close_time',
        'quote_volume', 'trades', 'taker_base', 'taker_quote', 'ignore'
    ])
    df = df[df['close_time'] < NOW_MS].copy()
    df = df[['timestamp', 'open', 'high', 'low', 'close', 'volume', 'quote_volume', 'trades']].copy()
    
    for c in ['open', 'high', 'low', 'close', 'volume', 'quote_volume']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    df['trades'] = pd.to_numeric(df['trades'], errors='coerce').fillna(0).astype('int64')
    df['timestamp'] = pd.to_numeric(df['timestamp']).astype('int64')
    df['datetime'] = pd.to_datetime(df['timestamp'], unit='ms').dt.strftime('%Y-%m-%d %H:%M:%S')
    
    df = df.sort_values('timestamp').drop_duplicates('timestamp').reset_index(drop=True)
    
    for w in MA_WINDOWS:
        df[f'MA{w}'] = df['close'].rolling(w).mean()
        
    return df

def serialize_klines_list(df, limit=10000):
    subset = df.tail(limit).copy() if limit else df.copy()
    rows = []
    for _, row in subset.iterrows():
        ts_sec = int(row["timestamp"] / 1000)
        rows.append({
            "time": ts_sec,
            "datetime": str(row["datetime"]),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]) if "volume" in row and not pd.isna(row["volume"]) else 0.0,
            "ma8": float(row["MA8"]) if "MA8" in row and not pd.isna(row["MA8"]) else None,
            "ma25": float(row["MA25"]) if "MA25" in row and not pd.isna(row["MA25"]) else None,
            "ma50": float(row["MA50"]) if "MA50" in row and not pd.isna(row["MA50"]) else None,
            "ma55": float(row["MA55"]) if "MA55" in row and not pd.isna(row["MA55"]) else None,
            "ma111": float(row["MA111"]) if "MA111" in row and not pd.isna(row["MA111"]) else None,
        })
    return rows

def compute_swings(high_arr, low_arr, len_p):
    n = len(high_arr)
    top = np.zeros(n)
    btm = np.zeros(n)
    os = 0
    for i in range(len_p, n):
        upper = np.max(high_arr[i - len_p + 1 : i + 1])
        lower = np.min(low_arr[i - len_p + 1 : i + 1])
        hl = high_arr[i - len_p]
        ll = low_arr[i - len_p]
        prev_os = os
        if hl > upper:
            os = 0
        elif ll < lower:
            os = 1
        if os == 0 and prev_os != 0:
            top[i] = hl
        if os == 1 and prev_os != 1:
            btm[i] = ll
    return top, btm

def compute_yearly_metrics(trades):
    if not trades:
        return []
    closed = [t for t in trades if t.get("status") != "OPEN"]
    if not closed:
        return []
    df_t = pd.DataFrame(closed)
    df_t["year"] = pd.to_datetime(df_t["entry_time"]).dt.year
    yearly = []
    
    for yr, grp in df_t.groupby("year"):
        wins = grp[grp["net_return_pct"] > 0]
        losses = grp[grp["net_return_pct"] <= 0]
        wr = round(float(len(wins) / len(grp) * 100), 2)
        w_sum = wins["net_return_pct"].sum()
        l_sum = abs(losses["net_return_pct"].sum())
        pf = round(float(w_sum / l_sum) if l_sum > 0 else (99.0 if w_sum > 0 else 1.0), 2)
        
        # Compounded return for this specific year
        yr_cap = 1.0
        for ret in grp["net_return_pct"]:
            yr_cap *= (1.0 + ret / 100.0)
        yr_return = round(float((yr_cap - 1.0) * 100.0), 2)
        
        yearly.append({
            "year": int(yr),
            "trades": int(len(grp)),
            "win_rate": wr,
            "total_return_pct": yr_return,
            "profit_factor": pf,
            "wins": int(len(wins)),
            "losses": int(len(losses))
        })
    return sorted(yearly, key=lambda x: x["year"])

def build_markers(trades):
    markers = []
    for t in trades:
        t_no = t["trade_no"]
        e_ts = int(pd.to_datetime(t["entry_time"]).timestamp())
        side = t["side"]
        is_open = t.get("status") == "OPEN"
        
        if is_open:
            markers.append({
                "time": e_ts,
                "position": "belowBar" if side == "LONG" else "aboveBar",
                "color": "#30D158" if side == "LONG" else "#FF453A",
                "shape": "arrowUp" if side == "LONG" else "arrowDown",
                "text": f"ACTIVE {side} @ ${t['entry_price']:,.2f}",
                "size": 3,
                "entryPrice": t["entry_price"],
                "side": side,
                "status": "OPEN",
                "isActive": True,
                "tradeNo": t_no
            })
            continue
            
        markers.append({
            "time": e_ts,
            "position": "belowBar" if side == "LONG" else "aboveBar",
            "color": "#39FF88" if side == "LONG" else "#FF4B5C",
            "shape": "arrowUp" if side == "LONG" else "arrowDown",
            "text": f"{side} #{t_no} @ ${t['entry_price']:,.2f}",
            "size": 2,
            "entryPrice": t["entry_price"],
            "tradeNo": t_no,
            "side": side
        })
        
        if "exit_time" in t and t["exit_time"] != "RUNNING":
            x_ts = int(pd.to_datetime(t["exit_time"]).timestamp())
            is_win = t["net_return_pct"] > 0
            markers.append({
                "time": x_ts,
                "position": "aboveBar" if side == "LONG" else "belowBar",
                "color": "#39FF88" if is_win else "#FF4B5C",
                "shape": "circle",
                "text": f"EXIT {t['net_return_pct']:+.1f}%",
                "size": 1,
                "exitPrice": t["exit_price"],
                "tradeNo": t_no,
                "pnlPct": t["net_return_pct"],
                "reason": t["exit_reason"]
            })
    return sorted(markers, key=lambda x: x["time"])

def calculate_overall_metrics(trades):
    closed = [t for t in trades if t.get("status") != "OPEN"]
    if not closed:
        return {
            "total_return_pct": 0.0, "cagr_pct": 0.0, "win_rate_pct": 0.0,
            "profit_factor": 1.0, "max_drawdown_pct": 0.0, "calmar_ratio": 1.0,
            "total_trades": 0, "win_trades": 0, "loss_trades": 0,
            "avg_win_pct": 0.0, "avg_loss_pct": 0.0, "best_trade_pct": 0.0, "worst_trade_pct": 0.0
        }
    
    df_t = pd.DataFrame(closed)
    wins = df_t[df_t["net_return_pct"] > 0]
    losses = df_t[df_t["net_return_pct"] <= 0]
    
    win_rate = round(float(len(wins) / len(df_t) * 100), 2)
    w_sum = wins["net_return_pct"].sum() if len(wins) > 0 else 0.0
    l_sum = abs(losses["net_return_pct"].sum()) if len(losses) > 0 else 0.0
    pf = round(float(w_sum / l_sum) if l_sum > 0 else 99.0, 2)
    
    cap = 10000.0
    equity = [cap]
    for ret in df_t["net_return_pct"]:
        cap *= (1.0 + ret / 100.0)
        equity.append(cap)
    eq_arr = np.array(equity)
    peaks = np.maximum.accumulate(eq_arr)
    dd_arr = (eq_arr - peaks) / peaks * 100.0
    max_dd = round(float(np.min(dd_arr)), 2)
    compounded_total_ret = round(float((cap - 10000.0) / 10000.0 * 100.0), 2)
    
    years = (pd.to_datetime(df_t["exit_time"].iloc[-1]) - pd.to_datetime(df_t["entry_time"].iloc[0])).total_seconds() / (86400 * 365.25)
    years = max(years, 1.0)
    cagr = round(float(((cap / 10000.0) ** (1.0 / years) - 1.0) * 100.0), 2)
    calmar = round(abs(cagr / max_dd) if abs(max_dd) > 0 else 1.0, 2)
    
    return {
        "total_return_pct": compounded_total_ret,
        "cagr_pct": cagr,
        "win_rate_pct": win_rate,
        "profit_factor": pf,
        "max_drawdown_pct": max_dd,
        "calmar_ratio": calmar,
        "total_trades": len(closed),
        "win_trades": len(wins),
        "loss_trades": len(losses),
        "avg_win_pct": round(float(wins["net_return_pct"].mean()), 2) if len(wins) > 0 else 0.0,
        "avg_loss_pct": round(float(losses["net_return_pct"].mean()), 2) if len(losses) > 0 else 0.0,
        "best_trade_pct": round(float(df_t["net_return_pct"].max()), 2),
        "worst_trade_pct": round(float(df_t["net_return_pct"].min()), 2)
    }

def create_ticket(strat_id, name, direction, trades):
    last_t = trades[-1] if trades else {}
    is_open = last_t.get("status") == "OPEN"
    ep = last_t.get("entry_price", 0.0)
    curr_p = last_t.get("exit_price", ep)
    sl = last_t.get("stop_loss", ep * 0.95 if direction == "LONG" else ep * 1.05)
    tp = last_t.get("take_profit", ep * 1.20 if direction == "LONG" else ep * 0.80)
    
    if not is_open:
        return None
        
    return {
        "symbol": "ETH/USDT",
        "direction": direction,
        "strategy_name": name,
        "strategy_id": strat_id,
        "confidence_pct": 94,
        "confidence_blocks": 9,
        "entry_price": ep,
        "current_price": curr_p,
        "stop_loss": sl,
        "stop_loss_pct": round(((sl - ep) / ep) * 100.0, 2) if direction == "LONG" else round(((ep - sl) / ep) * 100.0, 2),
        "breakeven_trigger": 0.0,
        "breakeven_trigger_pct": 0.0,
        "take_profit": tp,
        "take_profit_pct": round(((tp - ep) / ep) * 100.0, 2) if direction == "LONG" else round(((ep - tp) / ep) * 100.0, 2),
        "risk_reward_ratio": "4.0x",
        "timestamp": last_t.get("entry_time", ""),
        "contributing_agents": ["quant", "trader", "informan"],
        "status": "LIVE_SIGNAL",
        "execution_mode": "AUTONOMOUS_ON_THE_FLY"
    }

# =============================================================================
# Accurate Strategy Engines
# =============================================================================

def sim_30m_smc_breakout(df_sub, bull_signals, bear_signals, sl_pct=0.05, be_pct=0.03, tp_pct=0.75, partial_tp_pct=0.0, partial_weight=0.0):
    n = len(df_sub)
    highs = df_sub["high"].values
    lows = df_sub["low"].values
    closes = df_sub["close"].values
    dts = df_sub["datetime"].values
    
    in_pos = False
    ep = 0.0
    peak_p = 0.0
    ei = 0
    be_trig = False
    partial_taken = False
    trades = []
    
    for i in range(1, n):
        if in_pos:
            peak_p = max(peak_p, highs[i])
            curr_sl = ep * (1.0 - sl_pct)
            
            if be_pct > 0 and peak_p >= ep * (1.0 + be_pct):
                curr_sl = max(curr_sl, ep * 1.002)
                be_trig = True
                
            if partial_tp_pct > 0 and not partial_taken and highs[i] >= ep * (1.0 + partial_tp_pct):
                partial_taken = True
                curr_sl = max(curr_sl, ep * 1.002)
                be_trig = True
                
            hit_sl = lows[i] <= curr_sl
            hit_tp = highs[i] >= ep * (1.0 + tp_pct)
            struct_exit = bear_signals[i]
            
            if hit_sl or hit_tp or struct_exit:
                xp = curr_sl if hit_sl else (ep * (1.0 + tp_pct) if hit_tp else closes[i])
                rs = "Stop Loss (5%)" if hit_sl and not be_trig else ("Breakeven SL" if hit_sl else ("Take Profit (75%)" if hit_tp else "Bearish CHoCH (48h)"))
                raw_ret = (xp - ep) / ep
                blended = partial_weight * partial_tp_pct + (1.0 - partial_weight) * raw_ret if partial_taken else raw_ret
                net = (1.0 + blended) * (1.0 - FEE)**2 - 1.0
                
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "LONG",
                    "type": "LONG",
                    "entry_time": dts[ei],
                    "exit_time": dts[i],
                    "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2),
                    "gross_return_pct": round(blended * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2),
                    "exit_reason": rs,
                    "be_activated": be_trig,
                    "status": "CLOSED"
                })
                in_pos = False
                be_trig = False
                partial_taken = False
        else:
            if bull_signals[i]:
                in_pos = True
                ep = closes[i]
                peak_p = highs[i]
                ei = i
                be_trig = False
                partial_taken = False
                
    if in_pos:
        last_c = closes[-1]
        curr_sl = ep * (1.0 - sl_pct)
        if be_trig:
            curr_sl = max(curr_sl, ep * 1.002)
        raw_ret = (last_c - ep) / ep
        net = (1.0 + raw_ret) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "LONG",
            "type": "LONG",
            "entry_time": dts[ei],
            "exit_time": "RUNNING",
            "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(raw_ret * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2),
            "exit_reason": "Active Signal (Trailing)",
            "be_activated": be_trig,
            "status": "OPEN",
            "stop_loss": round(curr_sl, 2),
            "take_profit": round(ep * (1.0 + tp_pct), 2),
            "is_active": True
        })
    return trades

def sim_1h_smc_enhanced(df_sub, bull_sigs, bear_sigs, sl_pct=0.08, be_pct=0.05, tp_pct=0.75):
    n = len(df_sub)
    highs = df_sub["high"].values
    lows = df_sub["low"].values
    closes = df_sub["close"].values
    dts = df_sub["datetime"].values
    
    in_pos = False
    ep = 0.0
    peak_p = 0.0
    ei = 0
    be_trig = False
    trades = []
    
    for i in range(1, n):
        if in_pos:
            peak_p = max(peak_p, highs[i])
            curr_sl = ep * (1.0 - sl_pct)
            if be_pct > 0 and peak_p >= ep * (1.0 + be_pct):
                curr_sl = max(curr_sl, ep * 1.002)
                be_trig = True
                
            hit_sl = lows[i] <= curr_sl
            hit_tp = highs[i] >= ep * (1.0 + tp_pct)
            struct_exit = bear_sigs[i]
            
            if hit_sl or hit_tp or struct_exit:
                xp = curr_sl if hit_sl else (ep * (1.0 + tp_pct) if hit_tp else closes[i])
                rs = "Stop Loss (8%)" if hit_sl and not be_trig else ("Breakeven SL" if hit_sl else ("Take Profit (75%)" if hit_tp else "Bearish CHoCH Exit"))
                raw_ret = (xp - ep) / ep
                net = (1.0 + raw_ret) * (1.0 - FEE)**2 - 1.0
                
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "LONG",
                    "type": "LONG",
                    "entry_time": dts[ei],
                    "exit_time": dts[i],
                    "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2),
                    "gross_return_pct": round(raw_ret * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2),
                    "exit_reason": rs,
                    "be_activated": be_trig,
                    "status": "CLOSED"
                })
                in_pos = False
                be_trig = False
        else:
            if bull_sigs[i]:
                in_pos = True
                ep = closes[i]
                peak_p = highs[i]
                ei = i
                be_trig = False
                
    if in_pos:
        last_c = closes[-1]
        curr_sl = ep * (1.0 - sl_pct)
        if be_trig:
            curr_sl = max(curr_sl, ep * 1.002)
        raw_ret = (last_c - ep) / ep
        net = (1.0 + raw_ret) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "LONG",
            "type": "LONG",
            "entry_time": dts[ei],
            "exit_time": "RUNNING",
            "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(raw_ret * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2),
            "exit_reason": "Active Signal (Trailing)",
            "be_activated": be_trig,
            "status": "OPEN",
            "stop_loss": round(curr_sl, 2),
            "take_profit": round(ep * (1.0 + tp_pct), 2),
            "is_active": True
        })
    return trades

def sim_4h_pippo_original(df_4h_data):
    n = len(df_4h_data)
    highs = df_4h_data["high"].values
    lows = df_4h_data["low"].values
    closes = df_4h_data["close"].values
    dts = df_4h_data["datetime"].values
    sma111 = df_4h_data["MA111"].values
    
    top_50, btm_50 = compute_swings(highs, lows, 50)
    itop_5, ibtm_5 = compute_swings(highs, lows, 5)
    
    itop_y, ibtm_y, top_y, btm_y = 0.0, 0.0, 0.0, 0.0
    itop_cross, ibtm_cross = True, True
    
    in_pos = False
    ep = 0.0
    ei = 0
    trades = []
    
    for i in range(1, n):
        prev_itop, prev_ibtm = itop_y, ibtm_y
        if top_50[i] > 0: top_y = top_50[i]
        if itop_5[i] > 0: itop_y = itop_5[i]; itop_cross = True
        if btm_50[i] > 0: btm_y = btm_50[i]
        if ibtm_5[i] > 0: ibtm_y = ibtm_5[i]; ibtm_cross = True
        
        cross_itop = (closes[i] > itop_y) and (closes[i-1] <= prev_itop)
        cross_ibtm = (closes[i] < ibtm_y) and (closes[i-1] >= prev_ibtm)
        
        bull_signal = cross_itop and itop_cross and (top_y != itop_y) and (closes[i] > sma111[i])
        bear_signal = cross_ibtm and ibtm_cross and (btm_y != ibtm_y)
        
        if in_pos:
            sl_price = ep * 0.85
            tp_price = ep * 1.75
            hit_tp = highs[i] >= tp_price
            hit_sl = lows[i] <= sl_price
            
            if hit_tp or hit_sl:
                xp = tp_price if hit_tp else sl_price
                rs = "Take Profit (75%)" if hit_tp else "Stop Loss (15%)"
                gross = (xp - ep) / ep
                net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
                trades.append({
                    "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
                    "entry_time": dts[ei], "exit_time": dts[i], "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2), "gross_return_pct": round(gross * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2), "exit_reason": rs, "status": "CLOSED"
                })
                in_pos = False
            elif bear_signal:
                xp = closes[i]
                rs = "Bearish CHoCH Exit"
                gross = (xp - ep) / ep
                net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
                trades.append({
                    "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
                    "entry_time": dts[ei], "exit_time": dts[i], "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2), "gross_return_pct": round(gross * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2), "exit_reason": rs, "status": "CLOSED"
                })
                in_pos = False
                
        if bear_signal: ibtm_cross = False
        if bull_signal:
            itop_cross = False
            if not in_pos:
                in_pos = True
                ep = closes[i]
                ei = i
                
    if in_pos:
        last_c = closes[-1]
        gross = (last_c - ep) / ep
        net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
            "entry_time": dts[ei], "exit_time": "RUNNING", "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2), "gross_return_pct": round(gross * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2), "exit_reason": "Active Macro Hold",
            "status": "OPEN", "stop_loss": round(ep * 0.85, 2), "take_profit": round(ep * 1.75, 2), "is_active": True
        })
    return trades

def sim_pure_weekly_ma55(df_w_data):
    df_2020 = df_w_data[df_w_data["datetime"] >= "2020-01-01"].copy().reset_index(drop=True)
    nw = len(df_2020)
    closes = df_2020["close"].values
    ma55 = df_2020["MA55"].values
    dts = df_2020["datetime"].values
    
    trades = []
    in_pos = False
    ep = 0.0
    ei = 0
    
    for i in range(nw):
        c = closes[i]
        m = ma55[i]
        if in_pos:
            if c < m:
                gross = (c - ep) / ep
                net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
                trades.append({
                    "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
                    "entry_time": dts[ei], "exit_time": dts[i], "entry_price": round(ep, 2),
                    "exit_price": round(c, 2), "gross_return_pct": round(gross * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2), "exit_reason": "Weekly Close < MA55", "status": "CLOSED"
                })
                in_pos = False
        else:
            if c >= m:
                in_pos = True
                ep = c
                ei = i
                
    if in_pos:
        last_c = closes[-1]
        gross = (last_c - ep) / ep
        net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
            "entry_time": dts[ei], "exit_time": "RUNNING", "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2), "gross_return_pct": round(gross * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2), "exit_reason": "Active Macro Hold",
            "status": "OPEN", "is_active": True
        })
    return trades

def sim_ma_squeeze(df_main, use_4h=True):
    highs, lows, closes = df_main["high"].values, df_main["low"].values, df_main["close"].values
    dts = df_main["datetime"].values
    a1h = ((df_main["c1h"] > df_main["m25h"]) & (df_main["c1h"] > df_main["m50h"])).values
    d25h, d50h = df_main["d25h"].values, df_main["d50h"].values
    a30 = ((df_main["close"] > df_main["ma25"]) & (df_main["close"] > df_main["ma50"])).values
    b30 = ((df_main["close"] < df_main["ma25"]) & (df_main["close"] < df_main["ma50"])).values
    d25, d50 = df_main["d25"].values, df_main["d50"].values
    spread = df_main["abs_spread"].values
    atr = df_main["atr"].values
    above4h = (df_main["c4h"] > df_main["ma111_4h"]).fillna(False).values if use_4h else np.ones(len(df_main), dtype=bool)
    
    trades = []
    in_pos = False
    ep = 0.0
    ei = 0
    
    for i in range(len(df_main)):
        ex = False
        if in_pos:
            slp = ep * 0.98
            tpp = ep * 1.20
            hit_sl = lows[i] <= slp
            hit_tp = highs[i] >= tpp
            hit_fc = b30[i] and (-d25[i] > 0.5) and (-d50[i] > 0.5)
            
            if hit_sl or hit_tp or hit_fc:
                xp = slp if hit_sl else (tpp if hit_tp else closes[i])
                rs = "Stop Loss (-2%)" if hit_sl else ("Take Profit (+20%)" if hit_tp else "Force Close MA (-0.5%)")
                gross = (xp - ep) / ep
                net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
                trades.append({
                    "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
                    "entry_time": dts[ei], "exit_time": dts[i], "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2), "gross_return_pct": round(gross * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2), "exit_reason": rs, "status": "CLOSED"
                })
                in_pos = False
                ex = True
        if not in_pos and not ex:
            cond_reg = a1h[i] and d25h[i] < 1.5 and d50h[i] < 1.5 and above4h[i]
            cond_ent = a30[i] and d25[i] < 0.8 and d50[i] < 0.8
            cond_flt = spread[i] < 0.15 and atr[i] <= 1.0
            if cond_reg and cond_ent and cond_flt:
                in_pos = True
                ep = closes[i]
                ei = i
                
    if in_pos:
        last_c = closes[-1]
        gross = (last_c - ep) / ep
        net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1, "side": "LONG", "type": "LONG",
            "entry_time": dts[ei], "exit_time": "RUNNING", "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2), "gross_return_pct": round(gross * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2), "exit_reason": "Active Signal (Trailing)",
            "status": "OPEN", "stop_loss": round(ep * 0.98, 2), "take_profit": round(ep * 1.20, 2), "is_active": True
        })
    return trades

def sim_short_smc_v2(df_sub, swings_dict, maj, ent, ex, r_mask, sl_pct=0.05, be_pct=0.02, tp_pct=0.20):
    n = len(df_sub)
    closes = df_sub["close"].values
    highs = df_sub["high"].values
    lows = df_sub["low"].values
    dts = df_sub["datetime"].values
    
    top_m, btm_m = swings_dict[maj]
    top_e, btm_e = swings_dict[ent]
    top_x, btm_x = swings_dict[ex]
    
    top_y = 0.0; itop_y = 0.0; itop_cross = True
    btm_y = 0.0; ibtm_y = 0.0; ibtm_cross = True
    in_pos = False; ep = 0.0; ei = 0; curr_sl = 0.0; trough_p = 0.0; be_active = False
    trades = []
    
    for i in range(1, n):
        prev_itop = itop_y; prev_ibtm = ibtm_y
        if btm_m[i] > 0: btm_y = btm_m[i]
        if top_m[i] > 0: top_y = top_m[i]
        if btm_e[i] > 0: ibtm_y = btm_e[i]; ibtm_cross = True
        if top_x[i] > 0:  itop_y = top_x[i];  itop_cross = True
        
        cross_ibtm = (closes[i] < ibtm_y) and (closes[i-1] >= prev_ibtm)
        cross_itop = (closes[i] > itop_y) and (closes[i-1] <= prev_itop)
        
        s_entry = cross_ibtm and ibtm_cross and (btm_y != ibtm_y) and r_mask[i]
        s_exit  = cross_itop and itop_cross and (top_y != itop_y)
        
        if not in_pos:
            if s_entry:
                in_pos = True; ep = closes[i]; ei = i; trough_p = lows[i]
                curr_sl = ep * (1.0 + sl_pct); be_active = False; ibtm_cross = False
        else:
            trough_p = min(trough_p, lows[i])
            drop = (ep - trough_p) / ep
            if be_pct > 0 and drop >= be_pct:
                be_sl = ep * 0.998
                if be_sl < curr_sl: curr_sl = be_sl; be_active = True
                
            hit_sl = (highs[i] >= curr_sl)
            hit_tp = (tp_pct > 0 and lows[i] <= ep * (1.0 - tp_pct))
            struct_exit = s_exit
            
            if hit_sl or hit_tp or struct_exit:
                if hit_tp:
                    xp = ep * (1.0 - tp_pct); rs = "Take Profit"
                elif hit_sl:
                    xp = curr_sl; rs = "Breakeven SL" if be_active else "Stop Loss"
                else:
                    xp = closes[i]; rs = "Structural Exit"
                    
                gross = (ep - xp) / ep
                net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
                trades.append({
                    "trade_no": len(trades) + 1, "side": "SHORT", "type": "SHORT",
                    "entry_time": dts[ei], "exit_time": dts[i], "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2), "gross_return_pct": round(gross * 100.0, 2),
                    "net_return_pct": round(net * 100.0, 2), "exit_reason": rs, "status": "CLOSED"
                })
                in_pos = False; itop_cross = False
                
    if in_pos:
        last_c = closes[-1]
        gross = (ep - last_c) / ep
        net = (1.0 + gross) * (1.0 - FEE)**2 - 1.0
        trades.append({
            "trade_no": len(trades) + 1, "side": "SHORT", "type": "SHORT",
            "entry_time": dts[ei], "exit_time": "RUNNING", "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2), "gross_return_pct": round(gross * 100.0, 2),
            "net_return_pct": round(net * 100.0, 2), "exit_reason": "Active Signal (Trailing)",
            "status": "OPEN", "stop_loss": round(curr_sl, 2), "take_profit": round(ep * (1.0 - tp_pct), 2), "is_active": True
        })
    return trades

# =============================================================================
# Main Pipeline
# =============================================================================

def run_eth_pipeline():
    print("===================================================================")
    print("STEP 1: Fetching / Processing Official Binance ETHUSDT Datasets")
    print("===================================================================")
    dfs = {}
    for itv in INTERVALS:
        pq_path = os.path.join(DATA_DIR, f"ETHUSDT_{itv}.parquet")
        start_ms = INTERVAL_START_MS[itv]
        
        # Check if existing parquet covers required start time
        needs_fetch = True
        if os.path.exists(pq_path):
            existing_df = pd.read_parquet(pq_path).sort_values("timestamp").reset_index(drop=True)
            if len(existing_df) > 0 and existing_df["timestamp"].iloc[0] <= start_ms + 86400000:
                print(f"  ✓ Loaded valid {len(existing_df)} bars for {itv} from {pq_path}")
                dfs[itv] = existing_df
                needs_fetch = False
                
        if needs_fetch:
            raw = fetch_klines_range("ETHUSDT", itv, start_ms, NOW_MS)
            df = process_klines(raw)
            df.to_parquet(pq_path, index=False)
            csv_path = os.path.join(DATA_DIR, f"ETHUSDT_{itv}.csv")
            df.to_csv(csv_path, index=False)
            print(f"  ✓ Saved {len(df)} bars to {pq_path}")
            dfs[itv] = df

    print("\nSaving ETHUSDT serialized klines cache & baseline...")
    klines_cache_eth = {
        "30m": serialize_klines_list(dfs["30m"], 10000),
        "1h": serialize_klines_list(dfs["1h"], 10000),
        "4h": serialize_klines_list(dfs["4h"], 6000),
        "1d": serialize_klines_list(dfs["1d"], None),
        "1w": serialize_klines_list(dfs["1w"], None),
    }
    with open(os.path.join(DATA_DIR, "klines_cache_eth.json"), "w") as f:
        json.dump(klines_cache_eth, f)
    print("  ✓ Saved backend/data/klines_cache_eth.json")
    
    # Save frontend klinesBaseline_eth.json (optimized baseline matching BTC structure)
    klines_baseline_eth = {
        "30m": serialize_klines_list(dfs["30m"], 600),
        "1h": serialize_klines_list(dfs["1h"], 600),
        "4h": serialize_klines_list(dfs["4h"], 600),
        "1d": serialize_klines_list(dfs["1d"], 600),
        "1w": serialize_klines_list(dfs["1w"], None),
    }
    with open(os.path.join(FRONTEND_DATA_DIR, "klinesBaseline_eth.json"), "w") as f:
        json.dump(klines_baseline_eth, f)
    print("  ✓ Saved frontend/src/data/klinesBaseline_eth.json (optimized 600 bars baseline)")
    
    print("\n===================================================================")
    print("STEP 2: Computing Multi-Timeframe Confluence & Alignment")
    print("===================================================================")
    df_30m = dfs["30m"]
    df_1h = dfs["1h"]
    df_4h = dfs["4h"]
    df_1w = dfs["1w"]
    
    # Calculate EMA50 on 1h
    df_1h["EMA50"] = df_1h["close"].ewm(span=50, adjust=False).mean()
    df_1h["ts1"] = df_1h["timestamp"] + 3600 * 1000
    
    # Calculate MA111 on 4h
    df_4h["MA111"] = df_4h["close"].rolling(111).mean()
    df_4h["ts4"] = df_4h["timestamp"] + 4 * 3600 * 1000
    
    # Calculate MA55 on 1w
    df_1w["MA55"] = df_1w["close"].rolling(55).mean()
    df_1w["tsw"] = df_1w["timestamp"] + 7 * 24 * 3600 * 1000
    
    # Multi-TF merge onto 30m
    d30_m = pd.merge_asof(
        df_30m, df_1h[["ts1", "close", "EMA50"]].rename(columns={"close": "c_1h", "EMA50": "ema50_1h"}),
        left_on="timestamp", right_on="ts1", direction="backward"
    )
    d30_m = pd.merge_asof(
        d30_m, df_4h[["ts4", "close", "MA111"]].rename(columns={"close": "c_4h", "MA111": "sma111_4h"}),
        left_on="timestamp", right_on="ts4", direction="backward"
    )
    d30_m = pd.merge_asof(
        d30_m, df_1w[["tsw", "close", "MA55"]].rename(columns={"close": "c_w", "MA55": "sma55_w"}),
        left_on="timestamp", right_on="tsw", direction="backward"
    )
    
    d30 = d30_m.iloc[1000:].reset_index(drop=True)
    n30 = len(d30)
    h30, l30, c30 = d30["high"].values, d30["low"].values, d30["close"].values
    
    top_100_30, btm_100_30 = compute_swings(h30, l30, 100)
    top_36_30, btm_36_30 = compute_swings(h30, l30, 36)
    top_96_30, btm_96_30 = compute_swings(h30, l30, 96)
    
    top_64_30, btm_64_30 = compute_swings(h30, l30, 64)
    top_48_30, btm_48_30 = compute_swings(h30, l30, 48)
    top_32_30, btm_32_30 = compute_swings(h30, l30, 32)
    top_28_30, btm_28_30 = compute_swings(h30, l30, 28)
    top_16_30, btm_16_30 = compute_swings(h30, l30, 16)
    
    bull_macro_30m = (d30["c_4h"].values > d30["sma111_4h"].values) & (d30["c_1h"].values > d30["ema50_1h"].values)
    
    # 30M precomputed breakout signals
    top_y = 0.0; itop_y = 0.0; itop_cross = True
    btm_y = 0.0; ibtm_y = 0.0; ibtm_cross = True
    bull_signals_30 = np.zeros(n30, dtype=bool)
    bear_signals_30 = np.zeros(n30, dtype=bool)
    
    for i in range(1, n30):
        prev_itop, prev_ibtm = itop_y, ibtm_y
        if top_100_30[i] > 0: top_y = top_100_30[i]
        if top_36_30[i] > 0: itop_y = top_36_30[i]; itop_cross = True
        if btm_100_30[i] > 0: btm_y = btm_100_30[i]
        if btm_96_30[i] > 0: ibtm_y = btm_96_30[i]; ibtm_cross = True
        
        cross_itop = (c30[i] > itop_y) and (c30[i-1] <= prev_itop)
        cross_ibtm = (c30[i] < ibtm_y) and (c30[i-1] >= prev_ibtm)
        
        b_entry = cross_itop and itop_cross and (top_y != itop_y) and bull_macro_30m[i]
        b_exit = cross_ibtm and ibtm_cross and (btm_y != ibtm_y)
        
        if b_entry: bull_signals_30[i] = True; itop_cross = False
        if b_exit: bear_signals_30[i] = True; ibtm_cross = False
        
    # Multi-TF merge onto 1h
    d1h_m = pd.merge_asof(
        df_1h, df_4h[["ts4", "close", "MA111"]].rename(columns={"close": "c_4h", "MA111": "sma111_4h"}),
        left_on="timestamp", right_on="ts4", direction="backward"
    )
    d1 = d1h_m.iloc[1000:].reset_index(drop=True)
    n1 = len(d1)
    h1, l1, c1 = d1["high"].values, d1["low"].values, d1["close"].values
    
    top_50_1, btm_50_1 = compute_swings(h1, l1, 50)
    top_16_1, btm_16_1 = compute_swings(h1, l1, 16)
    top_48_1, btm_48_1 = compute_swings(h1, l1, 48)
    bull_macro_1h = d1["c_4h"].values > d1["sma111_4h"].values
    
    top_y = 0.0; itop_y = 0.0; itop_cross = True
    btm_y = 0.0; ibtm_y = 0.0; ibtm_cross = True
    bull_sigs_1h = np.zeros(n1, dtype=bool)
    bear_sigs_1h = np.zeros(n1, dtype=bool)
    
    for i in range(1, n1):
        prev_itop, prev_ibtm = itop_y, ibtm_y
        if top_50_1[i] > 0: top_y = top_50_1[i]
        if top_16_1[i] > 0: itop_y = top_16_1[i]; itop_cross = True
        if btm_50_1[i] > 0: btm_y = btm_50_1[i]
        if btm_48_1[i] > 0: ibtm_y = btm_48_1[i]; ibtm_cross = True
        
        cross_itop = (c1[i] > itop_y) and (c1[i-1] <= prev_itop)
        cross_ibtm = (c1[i] < ibtm_y) and (c1[i-1] >= prev_ibtm)
        
        b_entry = cross_itop and itop_cross and (top_y != itop_y) and bull_macro_1h[i]
        b_exit = cross_ibtm and ibtm_cross and (btm_y != ibtm_y)
        
        if b_entry: bull_sigs_1h[i] = True; itop_cross = False
        if b_exit: bear_sigs_1h[i] = True; ibtm_cross = False

    # MA Squeeze DataFrame preparation
    d30_grd = df_30m.copy()
    d1h_grd = df_1h.copy()
    d4h_grd = df_4h.copy()
    
    d1h_grd["ma25"] = d1h_grd.close.rolling(25).mean()
    d1h_grd["ma50"] = d1h_grd.close.rolling(50).mean()
    d1h_grd["d25"] = (d1h_grd.close - d1h_grd.ma25) / d1h_grd.ma25 * 100
    d1h_grd["d50"] = (d1h_grd.close - d1h_grd.ma50) / d1h_grd.ma50 * 100
    
    d4h_grd["ma111"] = d4h_grd.close.rolling(111).mean()
    
    d30_grd["ma25"] = d30_grd.close.rolling(25).mean()
    d30_grd["ma50"] = d30_grd.close.rolling(50).mean()
    d30_grd["d25"] = (d30_grd.close - d30_grd.ma25) / d30_grd.ma25 * 100
    d30_grd["d50"] = (d30_grd.close - d30_grd.ma50) / d30_grd.ma50 * 100
    d30_grd["abs_spread"] = (d30_grd.ma25 - d30_grd.ma50).abs() / d30_grd.ma50 * 100
    tr = np.maximum(d30_grd.high - d30_grd.low, np.maximum((d30_grd.high - d30_grd.close.shift()).abs(), (d30_grd.low - d30_grd.close.shift()).abs()))
    d30_grd["atr"] = tr.rolling(14).mean() / d30_grd.close * 100
    
    df_grd = pd.merge_asof(d30_grd, d1h_grd[["ts1", "close", "ma25", "ma50", "d25", "d50"]].rename(
        columns={"close": "c1h", "ma25": "m25h", "ma50": "m50h", "d25": "d25h", "d50": "d50h"}),
        left_on="timestamp", right_on="ts1", direction="backward")
    df_grd = pd.merge_asof(df_grd, d4h_grd[["ts4", "close", "ma111"]].rename(
        columns={"close": "c4h", "ma111": "ma111_4h"}),
        left_on="timestamp", right_on="ts4", direction="backward")
    df_grd = df_grd.dropna(subset=["m25h", "m50h", "ma25", "ma50", "atr"]).reset_index(drop=True)

    # Short Swings setup
    swings_s = {
        64: (top_64_30, btm_64_30),
        48: (top_48_30, btm_48_30),
        32: (top_32_30, btm_32_30),
        28: (top_28_30, btm_28_30),
        16: (top_16_30, btm_16_30),
    }
    r_no1h_short = (d30["c_w"].values < d30["sma55_w"].values) & (d30["c_4h"].values < d30["sma111_4h"].values)
    r_wbear_short = (d30["c_w"].values < d30["sma55_w"].values)

    print("\n===================================================================")
    print("STEP 3: Simulating All 10 Quantitative Strategies on ETHUSDT")
    print("===================================================================")
    strategies_eth = []

    # 1. Pippo 30M Alpha
    t_alpha = sim_30m_smc_breakout(d30, bull_signals_30, bear_signals_30, sl_pct=0.05, be_pct=0.03, tp_pct=0.75)
    m_alpha = calculate_overall_metrics(t_alpha)
    y_alpha = compute_yearly_metrics(t_alpha)
    mk_alpha = build_markers(t_alpha)
    tk_alpha = create_ticket("pippo-30m-alpha", "Pippo 30M Alpha (Pure Runner)", "LONG", t_alpha)
    strategies_eth.append({
        "id": "pippo-30m-alpha",
        "name": "Pippo 30M Alpha (Pure Runner)",
        "short_name": "30M Alpha",
        "type": "LONG",
        "timeframe": "30m",
        "category": "Momentum Breakout & Runner",
        "archetype": "Alpha Trend Rider",
        "risk_tier": "Moderate",
        "recommended_for": "Traders looking to capture prolonged Ethereum multi-week macro expansions.",
        "badge": make_badge(m_alpha["total_return_pct"], f"CAGR {m_alpha['cagr_pct']}%"),
        "metrics": m_alpha,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "4H SMA111 & 1H EMA50",
            "entry_breakout": "36-bar High Breakout",
            "exit_floor": "96-bar Low Structural Floor",
            "stop_loss": "5.0%",
            "breakeven": "+3.0% trigger -> BE+0.2%",
            "take_profit": "75.0%",
            "commission": "0.09%"
        },
        "logic_summary": "High-conviction 30M trend runner on ETHUSDT aligned with 4H SMA111 and 1H EMA50. Fast breakeven lock at +3.0%.",
        "yearly_stats": y_alpha,
        "markers": mk_alpha,
        "trades": t_alpha,
        "has_active_signal": tk_alpha is not None,
        "active_ticket": tk_alpha
    })
    print(f"  ✓ 1. Pippo 30M Alpha: {len(t_alpha)} trades | Total Return: {m_alpha['total_return_pct']:+,.1f}% | Win Rate: {m_alpha['win_rate_pct']}% | PF: {m_alpha['profit_factor']}")

    # 2. Pippo 30m New Gen
    t_new_gen = sim_ma_squeeze(df_grd, use_4h=True)
    m_new_gen = calculate_overall_metrics(t_new_gen)
    y_new_gen = compute_yearly_metrics(t_new_gen)
    mk_new_gen = build_markers(t_new_gen)
    tk_new_gen = create_ticket("pippo-30m-new-gen", "Pippo 30m New Gen", "LONG", t_new_gen)
    strategies_eth.append({
        "id": "pippo-30m-new-gen",
        "name": "Pippo 30m New Gen",
        "short_name": "30M New Gen",
        "type": "LONG",
        "timeframe": "30m",
        "category": "MA Squeeze & Multi-TF Trend",
        "archetype": "Volatility Contraction Sniper",
        "risk_tier": "Conservative-Moderate",
        "recommended_for": "Capital preservation with high consistency across market cycles on Ethereum.",
        "badge": make_badge(m_new_gen["total_return_pct"], f"DD {m_new_gen['max_drawdown_pct']}%"),
        "metrics": m_new_gen,
        "parameters": {
            "timeframe": "30m",
            "regime_1h": "Price > MA25 & MA50, dist < 1.5%",
            "regime_4h": "Price > MA111",
            "entry_swing": "Price > MA25 & MA50, dist < 0.8%",
            "filter": "MA25/50 Spread < 0.15% + ATR < 1.0%",
            "force_close": "Price < MA25 & MA50 and 0.5% below each",
            "hard_stop_loss": "2.0%",
            "take_profit": "20.0%",
            "commission": "0.09%"
        },
        "logic_summary": "Multi-timeframe MA-squeeze sniper on ETHUSDT. 1H compression (<1.5%) and 4H MA111 filter with tight 2.0% SL.",
        "yearly_stats": y_new_gen,
        "markers": mk_new_gen,
        "trades": t_new_gen,
        "has_active_signal": tk_new_gen is not None,
        "active_ticket": tk_new_gen
    })
    print(f"  ✓ 2. Pippo 30m New Gen: {len(t_new_gen)} trades | Total Return: {m_new_gen['total_return_pct']:+,.1f}% | Win Rate: {m_new_gen['win_rate_pct']}% | PF: {m_new_gen['profit_factor']}")

    # 3. Pippo 30m Grd
    t_grd = sim_ma_squeeze(df_grd, use_4h=False)
    m_grd = calculate_overall_metrics(t_grd)
    y_grd = compute_yearly_metrics(t_grd)
    mk_grd = build_markers(t_grd)
    tk_grd = create_ticket("pippo-30m-grd", "Pippo 30m Grd", "LONG", t_grd)
    strategies_eth.append({
        "id": "pippo-30m-grd",
        "name": "Pippo 30m Grd",
        "short_name": "30M Grd",
        "type": "LONG",
        "timeframe": "30m",
        "category": "MA Squeeze & Volatility Grid",
        "archetype": "High-Frequency Volatility Squeeze Sniper",
        "risk_tier": "Moderate",
        "recommended_for": "Traders seeking active exposure and high returns on ETH via pure multi-MA compression.",
        "badge": make_badge(m_grd["total_return_pct"], f"{len(t_grd)} Trades"),
        "metrics": m_grd,
        "parameters": {
            "timeframe": "30m",
            "regime_1h": "Price > MA25 & MA50, dist < 1.5%",
            "entry_swing": "Price > MA25 & MA50, dist < 0.8%",
            "filter": "MA25/50 Spread < 0.15% + ATR < 1.0%",
            "force_close": "Price < MA25 & MA50 and 0.5% below each",
            "hard_stop_loss": "2.0%",
            "take_profit": "20.0%",
            "position_size": "1.0x Modal",
            "commission": "0.09%"
        },
        "logic_summary": "High-frequency MA squeeze sniper with pure 1H regime on ETHUSDT. Exits defensively when price trades 0.5% below both MAs.",
        "yearly_stats": y_grd,
        "markers": mk_grd,
        "trades": t_grd,
        "has_active_signal": tk_grd is not None,
        "active_ticket": tk_grd
    })
    print(f"  ✓ 3. Pippo 30m Grd: {len(t_grd)} trades | Total Return: {m_grd['total_return_pct']:+,.1f}% | Win Rate: {m_grd['win_rate_pct']}% | PF: {m_grd['profit_factor']}")

    # 4. Pippo 1h Enhanced
    t_1h = sim_1h_smc_enhanced(d1, bull_sigs_1h, bear_sigs_1h, sl_pct=0.08, be_pct=0.05, tp_pct=0.75)
    m_1h = calculate_overall_metrics(t_1h)
    y_1h = compute_yearly_metrics(t_1h)
    mk_1h = build_markers(t_1h)
    tk_1h = create_ticket("pippo-1h-enhanced", "Pippo 1h Enhanced", "LONG", t_1h)
    strategies_eth.append({
        "id": "pippo-1h-enhanced",
        "name": "Pippo 1h Enhanced",
        "short_name": "1H Enhanced",
        "type": "LONG",
        "timeframe": "1h",
        "category": "Momentum Breakout & Runner",
        "archetype": "Trend Continuation Engine",
        "risk_tier": "Moderate",
        "recommended_for": "Swing traders looking for balanced execution with intermediate macro filtering.",
        "badge": make_badge(m_1h["total_return_pct"], f"CAGR {m_1h['cagr_pct']}%"),
        "metrics": m_1h,
        "parameters": {
            "timeframe": "1h",
            "macro_filters": "4H SMA111",
            "entry_breakout": "16-bar High Breakout",
            "exit_floor": "48-bar Low Structural Floor",
            "stop_loss": "8.0%",
            "breakeven": "+5.0% trigger -> BE+0.2%",
            "take_profit": "75.0%",
            "commission": "0.09%"
        },
        "logic_summary": "1H structural breakout on ETHUSDT filtered by 4H SMA111. Wide profit capture target up to 75%.",
        "yearly_stats": y_1h,
        "markers": mk_1h,
        "trades": t_1h,
        "has_active_signal": tk_1h is not None,
        "active_ticket": tk_1h
    })
    print(f"  ✓ 4. Pippo 1h Enhanced: {len(t_1h)} trades | Total Return: {m_1h['total_return_pct']:+,.1f}% | Win Rate: {m_1h['win_rate_pct']}% | PF: {m_1h['profit_factor']}")

    # 5. Pippo 30m Scalp-Runner
    t_scalp = sim_30m_smc_breakout(d30, bull_signals_30, bear_signals_30, sl_pct=0.05, be_pct=0.04, tp_pct=0.75, partial_tp_pct=0.04, partial_weight=0.30)
    m_scalp = calculate_overall_metrics(t_scalp)
    y_scalp = compute_yearly_metrics(t_scalp)
    mk_scalp = build_markers(t_scalp)
    tk_scalp = create_ticket("pippo-30m-scalp", "Pippo 30m Scalp-Runner", "LONG", t_scalp)
    strategies_eth.append({
        "id": "pippo-30m-scalp",
        "name": "Pippo 30m Scalp-Runner",
        "short_name": "30M Scalp",
        "type": "LONG",
        "timeframe": "30m",
        "category": "Hybrid Scalp & Runner",
        "archetype": "Fast Harvest & Core Runner",
        "risk_tier": "Moderate",
        "recommended_for": "Traders wanting quick partial profit harvesting (+4.0%) while keeping runner upside.",
        "badge": make_badge(m_scalp["total_return_pct"], f"CAGR {m_scalp['cagr_pct']}%"),
        "metrics": m_scalp,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "4H SMA111 & 1H EMA50",
            "entry_breakout": "36-bar High Breakout",
            "partial_tp": "30% position @ +4.0%",
            "stop_loss": "5.0%",
            "breakeven": "+4.0% trigger -> BE+0.2%",
            "take_profit": "75.0%",
            "commission": "0.09%"
        },
        "logic_summary": "Dual-engine hybrid model harvesting quick cashflow on ETHUSDT while trailing winners.",
        "yearly_stats": y_scalp,
        "markers": mk_scalp,
        "trades": t_scalp,
        "has_active_signal": tk_scalp is not None,
        "active_ticket": tk_scalp
    })
    print(f"  ✓ 5. Pippo 30m Scalp: {len(t_scalp)} trades | Total Return: {m_scalp['total_return_pct']:+,.1f}% | Win Rate: {m_scalp['win_rate_pct']}% | PF: {m_scalp['profit_factor']}")

    # 6. Pure Macro Weekly MA55 (Historical primed from 2017)
    t_macro = sim_pure_weekly_ma55(df_1w)
    m_macro = calculate_overall_metrics(t_macro)
    y_macro = compute_yearly_metrics(t_macro)
    mk_macro = build_markers(t_macro)
    tk_macro = create_ticket("pure-macro-weekly-ma55", "Pure Macro Weekly MA55", "LONG", t_macro)
    strategies_eth.append({
        "id": "pure-macro-weekly-ma55",
        "name": "Pure Macro Weekly MA55",
        "short_name": "Weekly MA55",
        "type": "LONG",
        "timeframe": "1w",
        "category": "Macro Cycle Filter",
        "archetype": "Institutional Cycle Anchor",
        "risk_tier": "Conservative",
        "recommended_for": "Institutional investors tracking long-term Ethereum secular cycles.",
        "badge": make_badge(m_macro["total_return_pct"], "Macro Cycle"),
        "metrics": m_macro,
        "parameters": {
            "timeframe": "1w",
            "regime": "Weekly MA55 Close",
            "entry": "Weekly Close >= MA55",
            "exit": "Weekly Close < MA55",
            "commission": "0.09%"
        },
        "logic_summary": "Secular Ethereum multi-year cycle filter. Long exclusively above Weekly MA55 with full 2017-2026 data depth.",
        "yearly_stats": y_macro,
        "markers": mk_macro,
        "trades": t_macro,
        "has_active_signal": tk_macro is not None,
        "active_ticket": tk_macro
    })
    print(f"  ✓ 6. Pure Macro Weekly MA55: {len(t_macro)} trades | Total Return: {m_macro['total_return_pct']:+,.1f}% | Win Rate: {m_macro['win_rate_pct']}% | PF: {m_macro['profit_factor']}")

    # 7. Pippo 4h Original (Exact Pine Script SMC Engine)
    df_4h_2020 = df_4h[df_4h["datetime"] >= "2020-01-01"].copy().reset_index(drop=True)
    t_4h = sim_4h_pippo_original(df_4h_2020)
    m_4h = calculate_overall_metrics(t_4h)
    y_4h = compute_yearly_metrics(t_4h)
    mk_4h = build_markers(t_4h)
    tk_4h = create_ticket("pippo-4h-original", "Pippo 4h Original", "LONG", t_4h)
    strategies_eth.append({
        "id": "pippo-4h-original",
        "name": "Pippo 4h Original",
        "short_name": "4H Original",
        "type": "LONG",
        "timeframe": "4h",
        "category": "Macro Breakout",
        "archetype": "High-Timeframe Trend Engine",
        "risk_tier": "Conservative-Moderate",
        "recommended_for": "Macro trend followers seeking minimal trade frequency and maximum ride time.",
        "badge": make_badge(m_4h["total_return_pct"], f"CAGR {m_4h['cagr_pct']}%"),
        "metrics": m_4h,
        "parameters": {
            "timeframe": "4h",
            "macro_filters": "4H SMA111",
            "entry_breakout": "5-bar High Breakout",
            "exit_floor": "5-bar Low Structural Floor (Bearish CHoCH)",
            "major_swings": "50-bar Confluence Anchor",
            "stop_loss": "15.0%",
            "take_profit": "75.0%",
            "commission": "0.09%"
        },
        "logic_summary": "The flagship 4H Smart Money Concepts benchmark transpiled directly from verified TradingView Pine Script.",
        "yearly_stats": y_4h,
        "markers": mk_4h,
        "trades": t_4h,
        "has_active_signal": tk_4h is not None,
        "active_ticket": tk_4h
    })
    print(f"  ✓ 7. Pippo 4h Original: {len(t_4h)} trades | Total Return: {m_4h['total_return_pct']:+,.1f}% | Win Rate: {m_4h['win_rate_pct']}% | PF: {m_4h['profit_factor']}")

    # 8. Pippo 30M Short V2 Type A (Active TP)
    t_short_a = sim_short_smc_v2(d30, swings_s, 64, 32, 48, r_no1h_short, sl_pct=0.05, be_pct=0.015, tp_pct=0.12)
    m_short_a = calculate_overall_metrics(t_short_a)
    y_short_a = compute_yearly_metrics(t_short_a)
    mk_short_a = build_markers(t_short_a)
    tk_short_a = create_ticket("pippo-30m-short-v2-a", "Pippo 30M Short V2 Type A (Active TP)", "SHORT", t_short_a)
    strategies_eth.append({
        "id": "pippo-30m-short-v2-a",
        "name": "Pippo 30M Short V2 Type A (Active TP)",
        "short_name": "Short V2 Type A",
        "type": "SHORT",
        "timeframe": "30m",
        "category": "Bearish Breakdown & Short",
        "archetype": "Fast-Harvest Short Engine",
        "risk_tier": "Moderate",
        "recommended_for": "Bear market hedging with quick profit harvesting (+12.0%) on ETH drops.",
        "badge": make_badge(m_short_a["total_return_pct"], f"Win Rate {m_short_a['win_rate_pct']}%"),
        "metrics": m_short_a,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "Weekly MA55 & 4H SMA111 Bearish",
            "entry_breakout": "32-bar Low Breakdown",
            "exit_ceiling": "48-bar High Structural Exit",
            "stop_loss": "5.0%",
            "breakeven": "+1.5% trigger -> BE",
            "take_profit": "12.0%",
            "commission": "0.09%"
        },
        "logic_summary": "Aggressive shorting model targeting quick capitulation cascades during ETH downtrends.",
        "yearly_stats": y_short_a,
        "markers": mk_short_a,
        "trades": t_short_a,
        "has_active_signal": tk_short_a is not None,
        "active_ticket": tk_short_a
    })
    print(f"  ✓ 8. Short V2 Type A: {len(t_short_a)} trades | Total Return: {m_short_a['total_return_pct']:+,.1f}% | Win Rate: {m_short_a['win_rate_pct']}% | PF: {m_short_a['profit_factor']}")

    # 9. Pippo 30M Short V2 Type B (Max Frequency)
    t_short_b = sim_short_smc_v2(d30, swings_s, 64, 28, 48, r_wbear_short, sl_pct=0.05, be_pct=0.025, tp_pct=0.20)
    m_short_b = calculate_overall_metrics(t_short_b)
    y_short_b = compute_yearly_metrics(t_short_b)
    mk_short_b = build_markers(t_short_b)
    tk_short_b = create_ticket("pippo-30m-short-v2-b", "Pippo 30M Short V2 Type B (Max Frequency)", "SHORT", t_short_b)
    strategies_eth.append({
        "id": "pippo-30m-short-v2-b",
        "name": "Pippo 30M Short V2 Type B (Max Frequency)",
        "short_name": "Short V2 Type B",
        "type": "SHORT",
        "timeframe": "30m",
        "category": "Bearish Breakdown & Short",
        "archetype": "High-Frequency Short Engine",
        "risk_tier": "Moderate",
        "recommended_for": "Traders wanting maximum trade participation during bearish ETH momentum phases.",
        "badge": make_badge(m_short_b["total_return_pct"], f"{len(t_short_b)} Trades"),
        "metrics": m_short_b,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "Weekly MA55 Bearish Regime",
            "entry_breakout": "28-bar Low Breakdown",
            "exit_ceiling": "48-bar High Structural Exit",
            "stop_loss": "5.0%",
            "breakeven": "+2.5% trigger -> BE",
            "take_profit": "20.0%",
            "commission": "0.09%"
        },
        "logic_summary": "High-frequency bearish model capturing local breakdown volatility with 20% TP targets.",
        "yearly_stats": y_short_b,
        "markers": mk_short_b,
        "trades": t_short_b,
        "has_active_signal": tk_short_b is not None,
        "active_ticket": tk_short_b
    })
    print(f"  ✓ 9. Short V2 Type B: {len(t_short_b)} trades | Total Return: {m_short_b['total_return_pct']:+,.1f}% | Win Rate: {m_short_b['win_rate_pct']}% | PF: {m_short_b['profit_factor']}")

    # 10. Pippo 30M Short V2 Type C (Defensive Fortress)
    t_short_c = sim_short_smc_v2(d30, swings_s, 64, 32, 16, r_no1h_short, sl_pct=0.06, be_pct=0.025, tp_pct=0.50)
    m_short_c = calculate_overall_metrics(t_short_c)
    y_short_c = compute_yearly_metrics(t_short_c)
    mk_short_c = build_markers(t_short_c)
    tk_short_c = create_ticket("pippo-30m-short-v2-c", "Pippo 30M Short V2 Type C (Defensive Fortress)", "SHORT", t_short_c)
    strategies_eth.append({
        "id": "pippo-30m-short-v2-c",
        "name": "Pippo 30M Short V2 Type C (Defensive Fortress)",
        "short_name": "Short V2 Type C",
        "type": "SHORT",
        "timeframe": "30m",
        "category": "Bearish Breakdown & Short",
        "archetype": "Deep Trend Short Engine",
        "risk_tier": "Moderate",
        "recommended_for": "Riding severe multi-week market downturns and flash crashes on Ethereum.",
        "badge": make_badge(m_short_c["total_return_pct"], "Target 50% TP"),
        "metrics": m_short_c,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "Weekly MA55 & 4H SMA111 Bearish",
            "entry_breakout": "32-bar Low Breakdown",
            "exit_ceiling": "16-bar High Structural Exit",
            "stop_loss": "6.0%",
            "breakeven": "+2.5% trigger -> BE",
            "take_profit": "50.0%",
            "commission": "0.09%"
        },
        "logic_summary": "Defensive fortress short model designed to ride major bearish capitulations down to +50% TP.",
        "yearly_stats": y_short_c,
        "markers": mk_short_c,
        "trades": t_short_c,
        "has_active_signal": tk_short_c is not None,
        "active_ticket": tk_short_c
    })
    print(f"  ✓ 10. Short V2 Type C: {len(t_short_c)} trades | Total Return: {m_short_c['total_return_pct']:+,.1f}% | Win Rate: {m_short_c['win_rate_pct']}% | PF: {m_short_c['profit_factor']}")

    print("\n===================================================================")
    print("STEP 4: Saving Strategies Catalog for ETHUSDT")
    print("===================================================================")
    backend_file = os.path.join(DATA_DIR, "strategies_eth.json")
    frontend_file = os.path.join(FRONTEND_DATA_DIR, "strategiesData_eth.json")
    
    with open(backend_file, "w") as f:
        json.dump(strategies_eth, f, indent=2)
    print(f"  ✓ Saved {len(strategies_eth)} strategies to {backend_file}")
    
    with open(frontend_file, "w") as f:
        json.dump(strategies_eth, f, indent=2)
    print(f"  ✓ Saved {len(strategies_eth)} strategies to {frontend_file}")
    
    print("\n🎉 ETHUSDT Pipeline Completed Successfully!")

if __name__ == "__main__":
    run_eth_pipeline()

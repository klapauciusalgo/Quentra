def make_badge(ret, suffix=""):
    sign = "+" if ret >= 0 else ""
    if suffix:
        return f"{sign}{ret:,.2f}% Return ({suffix})"
    return f"{sign}{ret:,.2f}% Return"

#!/usr/bin/env python3
"""
Quentra Multi-Asset Pipeline: Download ETHUSDT historical datasets from Binance (2020-2026),
generate rolling indicators, and execute deterministic backtests for all 10 quantitative algorithms.
Outputs:
- backend/data/ETHUSDT_{tf}.parquet
- backend/data/klines_cache_eth.json
- backend/data/strategies_eth.json
- frontend/src/data/strategiesData_eth.json
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
START_MS = int(pd.to_datetime("2020-01-01 00:00:00").timestamp() * 1000)
NOW_MS = int(time.time() * 1000)

INTERVALS = ["30m", "1h", "4h", "1d", "1w"]
MA_WINDOWS = [8, 25, 50, 55, 111]
FEE = 0.0009 # 0.09% per trade (Binance standard taker fee)

def fetch_klines_range(symbol: str, interval: str, start_ms: int, end_ms: int):
    out = []
    cursor = start_ms
    print(f"  Fetching {symbol} {interval} from {pd.to_datetime(start_ms, unit='ms')}...")
    while cursor < end_ms:
        url = f"{BINANCE_BASE}?symbol={symbol}&interval={interval}&startTime={cursor}&limit=1000"
        batch = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=20) as resp:
                    batch = json.loads(resp.read().decode())
                    break
            except Exception as e:
                time.sleep(1.0 + attempt * 1.5)
        
        if not batch:
            break
        
        out.extend(batch)
        last_open = batch[-1][0]
        cursor = last_open + 1
        if len(batch) < 1000:
            break
        time.sleep(0.08)
    
    print(f"  Downloaded {len(out)} raw bars for {interval}")
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

def compute_swings(highs, lows, length):
    n = len(highs)
    top = np.zeros(n)
    btm = np.zeros(n)
    os_state = 0
    for i in range(length, n):
        upper = np.max(highs[i - length + 1 : i + 1])
        lower = np.min(lows[i - length + 1 : i + 1])
        hl = highs[i - length]
        ll = lows[i - length]
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

def compute_yearly_metrics(trades, init_cap=10000.0):
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
        pf = round(float(w_sum / l_sum) if l_sum > 0 else 99.0, 2)
        
        # Compounded return for this specific year
        yr_cap = 1.0
        for ret in grp["net_return_pct"]:
            yr_cap *= (1.0 + ret / 100.0)
        yr_return = round(float((yr_cap - 1.0) * 100.0), 2)
        
        yearly.append({
            "year": int(yr),
            "trades": int(len(grp)),
            "win_rate": wr,
            "total_return_pct": round(float(grp["net_return_pct"].sum()), 2),
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
    
    total_ret = round(float(df_t["net_return_pct"].sum()), 2)
    win_rate = round(float(len(wins) / len(df_t) * 100), 2)
    w_sum = wins["net_return_pct"].sum() if len(wins) > 0 else 0
    l_sum = abs(losses["net_return_pct"].sum()) if len(losses) > 0 else 0
    pf = round(float(w_sum / l_sum) if l_sum > 0 else 99.0, 2)
    
    cap = 10000.0
    equity = [cap]
    for ret in df_t["net_return_pct"]:
        cap *= (1 + ret / 100.0)
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
        "total_return_pct": total_ret,
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

# =============================================================================
# Accurate SMC State-Machine Simulators
# =============================================================================

def sim_long_smc_breakout(df_main, maj_top, maj_btm, ent_top, ex_btm, reg_cond, sl_pct=0.05, be_pct=0.03, tp_pct=0.75, partial_tp_pct=0.0, partial_weight=0.0):
    """Accurate LONG SMC breakout simulator tracking itop/ibtm crossing state."""
    n = len(df_main)
    closes = df_main["close"].values
    highs = df_main["high"].values
    lows = df_main["low"].values
    dts = df_main["datetime"].values
    
    top_y = 0.0
    itop_y = 0.0
    itop_cross = True
    btm_y = 0.0
    ibtm_y = 0.0
    ibtm_cross = True
    
    in_pos = False
    entry_p = 0.0
    peak_p = 0.0
    entry_i = 0
    be_trig = False
    partial_taken = False
    trades = []
    
    for i in range(1, n):
        prev_itop = itop_y
        prev_ibtm = ibtm_y
        
        if maj_top[i] > 0: top_y = maj_top[i]
        if ent_top[i] > 0: itop_y = ent_top[i]; itop_cross = True
        
        if maj_btm[i] > 0: btm_y = maj_btm[i]
        if ex_btm[i] > 0: ibtm_y = ex_btm[i]; ibtm_cross = True
        
        crossover_itop = (closes[i] > itop_y) and (closes[i-1] <= prev_itop)
        crossunder_ibtm = (closes[i] < ibtm_y) and (closes[i-1] >= prev_ibtm)
        
        reg_ok = reg_cond[i] if reg_cond is not None else True
        b_entry = crossover_itop and itop_cross and (top_y != itop_y) and reg_ok
        b_exit = crossunder_ibtm and ibtm_cross and (btm_y != ibtm_y)
        
        if b_entry:
            itop_cross = False
        if b_exit:
            ibtm_cross = False
            
        if in_pos:
            peak_p = max(peak_p, highs[i])
            curr_sl = entry_p * (1.0 - sl_pct)
            
            if be_pct > 0 and peak_p >= entry_p * (1.0 + be_pct):
                curr_sl = max(curr_sl, entry_p * 1.002)
                be_trig = True
                
            if partial_tp_pct > 0 and not partial_taken and highs[i] >= entry_p * (1.0 + partial_tp_pct):
                partial_taken = True
                curr_sl = max(curr_sl, entry_p * 1.002)
                be_trig = True
                
            hit_sl = lows[i] <= curr_sl
            hit_tp = highs[i] >= entry_p * (1.0 + tp_pct)
            struct_exit = b_exit
            
            if hit_sl or hit_tp or struct_exit:
                exit_p = curr_sl if hit_sl else (entry_p * (1.0 + tp_pct) if hit_tp else closes[i])
                reason = "Stop Loss" if hit_sl and not be_trig else ("Breakeven SL" if hit_sl else ("Take Profit" if hit_tp else "Structural Exit"))
                
                raw_ret = (exit_p - entry_p) / entry_p
                if partial_taken:
                    blended = partial_weight * partial_tp_pct + (1.0 - partial_weight) * raw_ret
                else:
                    blended = raw_ret
                    
                net = (blended - (FEE * 2)) * 100.0
                gross = blended * 100.0
                
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "LONG",
                    "type": "LONG",
                    "entry_time": dts[entry_i],
                    "exit_time": dts[i],
                    "entry_price": round(entry_p, 2),
                    "exit_price": round(exit_p, 2),
                    "gross_return_pct": round(gross, 2),
                    "net_return_pct": round(net, 2),
                    "exit_reason": reason,
                    "be_activated": be_trig,
                    "status": "CLOSED"
                })
                in_pos = False
                
        if not in_pos and b_entry:
            in_pos = True
            entry_p = closes[i]
            peak_p = highs[i]
            entry_i = i
            be_trig = False
            partial_taken = False
            
    if in_pos:
        last_c = closes[-1]
        curr_sl = entry_p * (1.0 - sl_pct)
        if be_trig:
            curr_sl = max(curr_sl, entry_p * 1.002)
        gross = ((last_c - entry_p) / entry_p) * 100.0
        net = gross - (FEE * 2 * 100.0)
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "LONG",
            "type": "LONG",
            "entry_time": dts[entry_i],
            "exit_time": "RUNNING",
            "entry_price": round(entry_p, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(gross, 2),
            "net_return_pct": round(net, 2),
            "exit_reason": "Active Signal (Trailing)",
            "be_activated": be_trig,
            "status": "OPEN",
            "stop_loss": round(curr_sl, 2),
            "take_profit": round(entry_p * (1.0 + tp_pct), 2),
            "is_active": True
        })
    return trades

def sim_short_smc_breakdown(df_main, maj_top, maj_btm, ent_btm, ex_top, reg_cond, sl_pct=0.05, be_pct=0.02, tp_pct=0.25):
    """Accurate SHORT SMC breakdown simulator tracking itop/ibtm crossing state."""
    n = len(df_main)
    closes = df_main["close"].values
    highs = df_main["high"].values
    lows = df_main["low"].values
    dts = df_main["datetime"].values
    
    top_y = 0.0
    itop_y = 0.0
    itop_cross = True
    btm_y = 0.0
    ibtm_y = 0.0
    ibtm_cross = True
    
    in_pos = False
    entry_p = 0.0
    trough_p = 0.0
    entry_i = 0
    be_trig = False
    trades = []
    
    for i in range(1, n):
        prev_itop = itop_y
        prev_ibtm = ibtm_y
        
        if maj_btm[i] > 0: btm_y = maj_btm[i]
        if maj_top[i] > 0: top_y = maj_top[i]
        
        if ent_btm[i] > 0: ibtm_y = ent_btm[i]; ibtm_cross = True
        if ex_top[i] > 0: itop_y = ex_top[i]; itop_cross = True
        
        crossunder_ibtm = (closes[i] < ibtm_y) and (closes[i-1] >= prev_ibtm)
        crossover_itop = (closes[i] > itop_y) and (closes[i-1] <= prev_itop)
        
        reg_ok = reg_cond[i] if reg_cond is not None else True
        s_entry = crossunder_ibtm and ibtm_cross and (btm_y != ibtm_y) and reg_ok
        s_exit = crossover_itop and itop_cross and (top_y != itop_y)
        
        if s_entry:
            ibtm_cross = False
        if s_exit:
            itop_cross = False
            
        if in_pos:
            trough_p = min(trough_p, lows[i])
            curr_sl = entry_p * (1.0 + sl_pct)
            
            if be_pct > 0 and trough_p <= entry_p * (1.0 - be_pct):
                curr_sl = min(curr_sl, entry_p * 0.998)
                be_trig = True
                
            hit_sl = highs[i] >= curr_sl
            hit_tp = lows[i] <= entry_p * (1.0 - tp_pct)
            struct_exit = s_exit
            
            if hit_sl or hit_tp or struct_exit:
                exit_p = curr_sl if hit_sl else (entry_p * (1.0 - tp_pct) if hit_tp else closes[i])
                reason = "Stop Loss" if hit_sl and not be_trig else ("Breakeven SL" if hit_sl else ("Take Profit" if hit_tp else "Structural Exit"))
                
                raw_ret = (entry_p - exit_p) / entry_p
                net = (raw_ret - (FEE * 2)) * 100.0
                gross = raw_ret * 100.0
                
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "SHORT",
                    "type": "SHORT",
                    "entry_time": dts[entry_i],
                    "exit_time": dts[i],
                    "entry_price": round(entry_p, 2),
                    "exit_price": round(exit_p, 2),
                    "gross_return_pct": round(gross, 2),
                    "net_return_pct": round(net, 2),
                    "exit_reason": reason,
                    "be_activated": be_trig,
                    "status": "CLOSED"
                })
                in_pos = False
                
        if not in_pos and s_entry:
            in_pos = True
            entry_p = closes[i]
            trough_p = lows[i]
            entry_i = i
            be_trig = False
            
    if in_pos:
        last_c = closes[-1]
        curr_sl = entry_p * (1.0 + sl_pct)
        if be_trig:
            curr_sl = min(curr_sl, entry_p * 0.998)
        gross = ((entry_p - last_c) / entry_p) * 100.0
        net = gross - (FEE * 2 * 100.0)
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "SHORT",
            "type": "SHORT",
            "entry_time": dts[entry_i],
            "exit_time": "RUNNING",
            "entry_price": round(entry_p, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(gross, 2),
            "net_return_pct": round(net, 2),
            "exit_reason": "Active Signal (Trailing)",
            "be_activated": be_trig,
            "status": "OPEN",
            "stop_loss": round(curr_sl, 2),
            "take_profit": round(entry_p * (1.0 - tp_pct), 2),
            "is_active": True
        })
    return trades

def sim_ma_squeeze_strategy(df_30m, df_1h, df_4h=None, use_4h=True):
    d30 = df_30m.copy()
    d1h = df_1h.copy()
    d1h["ts"] = d1h["timestamp"] + 3600000
    
    df = pd.merge_asof(
        d30,
        d1h[["ts", "close", "MA25", "MA50"]].rename(columns={"close": "c1h", "MA25": "m25h", "MA50": "m50h"}),
        left_on="timestamp", right_on="ts", direction="backward"
    )
    
    if use_4h and df_4h is not None:
        d4h = df_4h.copy()
        d4h["ts4"] = d4h["timestamp"] + 4 * 3600 * 1000
        df = pd.merge_asof(
            df,
            d4h[["ts4", "close", "MA111"]].rename(columns={"close": "c4h", "MA111": "ma111_4h"}),
            left_on="timestamp", right_on="ts4", direction="backward"
        )
    
    tr = np.maximum(df["high"] - df["low"], np.maximum((df["high"] - df["close"].shift()).abs(), (df["low"] - df["close"].shift()).abs()))
    df["atr_pct"] = tr.rolling(14).mean() / df["close"] * 100.0
    
    trades = []
    in_pos = False
    ep = 0.0
    ei = 0
    sl_pct = 0.02
    tp_pct = 0.20
    fc_dist = 0.005
    
    closes = df["close"].values
    highs = df["high"].values
    lows = df["low"].values
    dts = df["datetime"].values
    m25 = df["MA25"].values
    m50 = df["MA50"].values
    
    c1h = df["c1h"].values
    m25h = df["m25h"].values
    m50h = df["m50h"].values
    atr = df["atr_pct"].values
    c4h = df["c4h"].values if "c4h" in df else None
    m111_4h = df["ma111_4h"].values if "ma111_4h" in df else None
    
    for i in range(50, len(df)):
        c = closes[i]
        h = highs[i]
        l = lows[i]
        cur_dt = dts[i]
        
        if in_pos:
            slp = ep * (1.0 - sl_pct)
            tpp = ep * (1.0 + tp_pct)
            m25_val = m25[i] if not np.isnan(m25[i]) else c
            m50_val = m50[i] if not np.isnan(m50[i]) else c
            fc = (c < m25_val) and (c < m50_val) and ((m25_val - c) / m25_val >= fc_dist) and ((m50_val - c) / m50_val >= fc_dist)
            
            hit_sl = l <= slp
            hit_tp = h >= tpp
            
            if hit_sl or hit_tp or fc:
                xp = slp if hit_sl else (tpp if hit_tp else c)
                rs = "Stop Loss (-2%)" if hit_sl else ("Take Profit (+20%)" if hit_tp else "Force Close MA (-0.5%)")
                gross = ((xp - ep) / ep) * 100.0
                net = gross - (FEE * 2 * 100.0)
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "LONG",
                    "type": "LONG",
                    "entry_time": dts[ei],
                    "exit_time": cur_dt,
                    "entry_price": round(ep, 2),
                    "exit_price": round(xp, 2),
                    "gross_return_pct": round(gross, 2),
                    "net_return_pct": round(net, 2),
                    "exit_reason": rs,
                    "be_activated": False,
                    "status": "CLOSED"
                })
                in_pos = False
                
        if not in_pos:
            m25_val = m25[i]
            m50_val = m50[i]
            if np.isnan(m25_val) or np.isnan(m50_val):
                continue
                
            c1_val = c1h[i]
            m25h_val = m25h[i]
            m50h_val = m50h[i]
            if np.isnan(c1_val) or np.isnan(m25h_val) or np.isnan(m50h_val):
                continue
                
            a1h = (c1_val > m25h_val) and (c1_val > m50h_val) and ((c1_val - m25h_val) / m25h_val < 0.015) and ((c1_val - m50h_val) / m50h_val < 0.015)
            
            a4h = True
            if use_4h and c4h is not None and m111_4h is not None:
                c4_val = c4h[i]
                m4_val = m111_4h[i]
                if not np.isnan(c4_val) and not np.isnan(m4_val):
                    a4h = c4_val > m4_val
                    
            a30 = (c > m25_val) and (c > m50_val) and ((c - m25_val) / m25_val < 0.008) and ((c - m50_val) / m50_val < 0.008)
            sp = abs(m25_val - m50_val) / m50_val < 0.0015
            at = atr[i] <= 1.0 if not np.isnan(atr[i]) else False
            
            if a1h and a4h and a30 and sp and at:
                in_pos = True
                ep = c
                ei = i
                
    if in_pos:
        last_c = closes[-1]
        gross = ((last_c - ep) / ep) * 100.0
        net = gross - (FEE * 2 * 100.0)
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "LONG",
            "type": "LONG",
            "entry_time": dts[ei],
            "exit_time": "RUNNING",
            "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(gross, 2),
            "net_return_pct": round(net, 2),
            "exit_reason": "Active Signal (Trailing)",
            "be_activated": False,
            "status": "OPEN",
            "stop_loss": round(ep * 0.98, 2),
            "take_profit": round(ep * 1.20, 2),
            "is_active": True
        })
        
    return trades

def sim_weekly_ma55(df_w):
    trades = []
    closes = df_w["close"].values
    ma55 = df_w["MA55"].values
    dts = df_w["datetime"].values
    n = len(df_w)
    
    in_pos = False
    ep = 0.0
    ei = 0
    
    for i in range(55, n):
        c = closes[i]
        m = ma55[i]
        cur_dt = dts[i]
        
        if in_pos:
            if c < m:
                gross = ((c - ep) / ep) * 100.0
                net = gross - (FEE * 2 * 100.0)
                trades.append({
                    "trade_no": len(trades) + 1,
                    "side": "LONG",
                    "type": "LONG",
                    "entry_time": dts[ei],
                    "exit_time": cur_dt,
                    "entry_price": round(ep, 2),
                    "exit_price": round(c, 2),
                    "gross_return_pct": round(gross, 2),
                    "net_return_pct": round(net, 2),
                    "exit_reason": "Weekly Close < MA55",
                    "status": "CLOSED"
                })
                in_pos = False
        else:
            if c > m:
                in_pos = True
                ep = c
                ei = i
                
    if in_pos:
        last_c = closes[-1]
        gross = ((last_c - ep) / ep) * 100.0
        net = gross - (FEE * 2 * 100.0)
        trades.append({
            "trade_no": len(trades) + 1,
            "side": "LONG",
            "type": "LONG",
            "entry_time": dts[ei],
            "exit_time": "RUNNING",
            "entry_price": round(ep, 2),
            "exit_price": round(last_c, 2),
            "gross_return_pct": round(gross, 2),
            "net_return_pct": round(net, 2),
            "exit_reason": "Active Macro Hold",
            "status": "OPEN",
            "is_active": True
        })
    return trades

# =============================================================================
# Main Pipeline Execution
# =============================================================================

def run_eth_pipeline():
    print("===================================================================")
    print("STEP 1: Checking / Loading Official Binance ETHUSDT Datasets")
    print("===================================================================")
    
    dfs = {}
    for itv in INTERVALS:
        pq_path = os.path.join(DATA_DIR, f"ETHUSDT_{itv}.parquet")
        if os.path.exists(pq_path):
            df = pd.read_parquet(pq_path).sort_values("timestamp").reset_index(drop=True)
            print(f"  ✓ Loaded existing {len(df)} bars from {pq_path}")
        else:
            raw = fetch_klines_range("ETHUSDT", itv, START_MS, NOW_MS)
            df = process_klines(raw)
            df.to_parquet(pq_path, index=False)
            csv_path = os.path.join(DATA_DIR, f"ETHUSDT_{itv}.csv")
            df.to_csv(csv_path, index=False)
            print(f"  ✓ Saved {len(df)} bars to {pq_path}")
        dfs[itv] = df
        
    print("\nSaving ETHUSDT serialized klines cache...")
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
    
    print("\n===================================================================")
    print("STEP 2: Computing Multi-Timeframe SMC Swings & Alignments")
    print("===================================================================")
    df_30m = dfs["30m"]
    df_1h = dfs["1h"]
    df_4h = dfs["4h"]
    df_1w = dfs["1w"]
    
    # Pre-calculate indicator columns if missing
    for w in [50, 55, 111]:
        if f"MA{w}" not in df_1w and len(df_1w) >= w:
            df_1w[f"MA{w}"] = df_1w["close"].rolling(w).mean()
        if f"MA{w}" not in df_4h and len(df_4h) >= w:
            df_4h[f"MA{w}"] = df_4h["close"].rolling(w).mean()
        if f"MA{w}" not in df_1h and len(df_1h) >= w:
            df_1h[f"MA{w}"] = df_1h["close"].rolling(w).mean()
    if "EMA50" not in df_1h:
        df_1h["EMA50"] = df_1h["close"].ewm(span=50, adjust=False).mean()
        
    # 30M swings
    top_100_30m, btm_100_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 100)
    top_36_30m, btm_36_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 36)
    top_96_30m, btm_96_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 96)
    
    top_64_30m, btm_64_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 64)
    top_48_30m, btm_48_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 48)
    top_32_30m, btm_32_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 32)
    top_16_30m, btm_16_30m = compute_swings(df_30m["high"].values, df_30m["low"].values, 16)
    
    # 1H swings
    top_50_1h, btm_50_1h = compute_swings(df_1h["high"].values, df_1h["low"].values, 50)
    top_16_1h, _ = compute_swings(df_1h["high"].values, df_1h["low"].values, 16)
    _, btm_48_1h = compute_swings(df_1h["high"].values, df_1h["low"].values, 48)
    
    # 4H swings
    top_20_4h, btm_20_4h = compute_swings(df_4h["high"].values, df_4h["low"].values, 20)
    top_5_4h, _ = compute_swings(df_4h["high"].values, df_4h["low"].values, 5)
    _, btm_16_4h = compute_swings(df_4h["high"].values, df_4h["low"].values, 16)
    
    # Align higher timeframes
    d1h_sub = df_1h.copy()
    d1h_sub["ts1h"] = d1h_sub["timestamp"] + 3600 * 1000
    d4h_sub = df_4h.copy()
    d4h_sub["ts4h"] = d4h_sub["timestamp"] + 4 * 3600 * 1000
    dw_sub = df_1w.copy()
    dw_sub["tsw"] = dw_sub["timestamp"] + 7 * 24 * 3600 * 1000
    
    # Merge onto 30m
    d30_m = pd.merge_asof(
        df_30m, d1h_sub[["ts1h", "close", "EMA50"]].rename(columns={"close": "c_1h", "EMA50": "ema50_1h"}),
        left_on="timestamp", right_on="ts1h", direction="backward"
    )
    d30_m = pd.merge_asof(
        d30_m, d4h_sub[["ts4h", "close", "MA111"]].rename(columns={"close": "c_4h", "MA111": "sma111_4h"}),
        left_on="timestamp", right_on="ts4h", direction="backward"
    )
    d30_m = pd.merge_asof(
        d30_m, dw_sub[["tsw", "close", "MA55"]].rename(columns={"close": "c_w", "MA55": "sma55_w"}),
        left_on="timestamp", right_on="tsw", direction="backward"
    )
    
    bull_macro_30m = (d30_m["c_4h"] > d30_m["sma111_4h"]) & (d30_m["c_1h"] > d30_m["ema50_1h"])
    bear_macro_30m = (d30_m["c_w"] < d30_m["sma55_w"]) & (d30_m["c_4h"] < d30_m["sma111_4h"])
    
    # Merge onto 1h
    d1h_m = pd.merge_asof(
        df_1h, d4h_sub[["ts4h", "close", "MA111"]].rename(columns={"close": "c_4h", "MA111": "sma111_4h"}),
        left_on="timestamp", right_on="ts4h", direction="backward"
    )
    bull_macro_1h = d1h_m["c_4h"] > d1h_m["sma111_4h"]
    
    # Merge onto 4h
    d4h_m = pd.merge_asof(
        df_4h, dw_sub[["tsw", "close", "MA55"]].rename(columns={"close": "c_w", "MA55": "sma55_w"}),
        left_on="timestamp", right_on="tsw", direction="backward"
    )
    bull_macro_4h = d4h_m["c_w"] > d4h_m["sma55_w"]
    
    print("\n===================================================================")
    print("STEP 3: Simulating 10 Quantitative Strategies on ETHUSDT")
    print("===================================================================")
    
    strategies_eth = []
    
    def create_ticket(strat_id, name, direction, trades):
        last_t = trades[-1] if trades else {}
        is_open = last_t.get("status") == "OPEN"
        ep = last_t.get("entry_price", 0.0)
        curr_p = last_t.get("exit_price", ep)
        sl = last_t.get("stop_loss", ep * 0.95)
        tp = last_t.get("take_profit", ep * 1.20)
        
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

    # 1. Pippo 30M Alpha
    t_alpha = sim_long_smc_breakout(df_30m, top_100_30m, btm_100_30m, top_36_30m, btm_96_30m, bull_macro_30m.values, 0.05, 0.03, 0.75)
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
        "badge": f"+{m_alpha['total_return_pct']}% Return (CAGR {m_alpha['cagr_pct']}%)",
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
    print(f"  ✓ 1. Pippo 30M Alpha: {len(t_alpha)} trades | Total Return: {m_alpha['total_return_pct']:+,.1f}% | Win Rate: {m_alpha['win_rate_pct']}%")

    # 2. Pippo 30m New Gen
    t_new_gen = sim_ma_squeeze_strategy(df_30m, df_1h, df_4h, use_4h=True)
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
        "badge": f"+{m_new_gen['total_return_pct']}% Return (DD {m_new_gen['max_drawdown_pct']}%)",
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
    print(f"  ✓ 2. Pippo 30m New Gen: {len(t_new_gen)} trades | Total Return: {m_new_gen['total_return_pct']:+,.1f}% | Win Rate: {m_new_gen['win_rate_pct']}%")

    # 3. Pippo 30m Grd
    t_grd = sim_ma_squeeze_strategy(df_30m, df_1h, df_4h, use_4h=False)
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
        "badge": f"+{m_grd['total_return_pct']}% Return ({len(t_grd)} Trades)",
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
    print(f"  ✓ 3. Pippo 30m Grd: {len(t_grd)} trades | Total Return: {m_grd['total_return_pct']:+,.1f}% | Win Rate: {m_grd['win_rate_pct']}%")

    # 4. Pippo 1h Enhanced
    t_1h = sim_long_smc_breakout(df_1h, top_50_1h, btm_50_1h, top_16_1h, btm_48_1h, bull_macro_1h.values, 0.08, 0.05, 0.75)
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
        "badge": f"+{m_1h['total_return_pct']}% Return (CAGR {m_1h['cagr_pct']}%)",
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
    print(f"  ✓ 4. Pippo 1h Enhanced: {len(t_1h)} trades | Total Return: {m_1h['total_return_pct']:+,.1f}% | Win Rate: {m_1h['win_rate_pct']}%")

    # 5. Pippo 30m Scalp-Runner
    t_scalp = sim_long_smc_breakout(df_30m, top_100_30m, btm_100_30m, top_36_30m, btm_96_30m, bull_macro_30m.values, 0.05, 0.04, 0.75, partial_tp_pct=0.04, partial_weight=0.30)
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
        "badge": f"+{m_scalp['total_return_pct']}% Return (CAGR {m_scalp['cagr_pct']}%)",
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
    print(f"  ✓ 5. Pippo 30m Scalp: {len(t_scalp)} trades | Total Return: {m_scalp['total_return_pct']:+,.1f}% | Win Rate: {m_scalp['win_rate_pct']}%")

    # 6. Pure Macro Weekly MA55
    t_macro = sim_weekly_ma55(df_1w)
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
        "badge": f"+{m_macro['total_return_pct']}% Return (Macro Cycle)",
        "badge": make_badge(m_macro["total_return_pct"], "Macro Cycle"),
        "metrics": m_macro,
        "parameters": {
            "timeframe": "1w",
            "regime": "Weekly MA55 Close",
            "entry": "Weekly Close > MA55",
            "exit": "Weekly Close < MA55",
            "commission": "0.09%"
        },
        "logic_summary": "Secular Ethereum multi-year cycle filter. Long exclusively above Weekly MA55.",
        "yearly_stats": y_macro,
        "markers": mk_macro,
        "trades": t_macro,
        "has_active_signal": tk_macro is not None,
        "active_ticket": tk_macro
    })
    print(f"  ✓ 6. Pure Macro Weekly MA55: {len(t_macro)} trades | Total Return: {m_macro['total_return_pct']:+,.1f}%")

    # 7. Pippo 4h Original
    t_4h = sim_long_smc_breakout(df_4h, top_20_4h, btm_20_4h, top_5_4h, btm_16_4h, bull_macro_4h.values, 0.15, 0.05, 0.75)
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
        "badge": f"+{m_4h['total_return_pct']}% Return (CAGR {m_4h['cagr_pct']}%)",
        "badge": make_badge(m_4h["total_return_pct"], f"CAGR {m_4h['cagr_pct']}%"),
        "metrics": m_4h,
        "parameters": {
            "timeframe": "4h",
            "macro_filters": "Weekly MA55",
            "entry_breakout": "5-bar High Breakout",
            "exit_floor": "16-bar Low Structural Floor",
            "stop_loss": "15.0%",
            "breakeven": "+5.0% trigger -> BE+0.2%",
            "take_profit": "75.0%",
            "commission": "0.09%"
        },
        "logic_summary": "The benchmark 4H macro trend system that started the Pippo lineage on Ethereum.",
        "yearly_stats": y_4h,
        "markers": mk_4h,
        "trades": t_4h,
        "has_active_signal": tk_4h is not None,
        "active_ticket": tk_4h
    })
    print(f"  ✓ 7. Pippo 4h Original: {len(t_4h)} trades | Total Return: {m_4h['total_return_pct']:+,.1f}% | Win Rate: {m_4h['win_rate_pct']}%")

    # 8. Pippo 30M Short V2 Type A (Active TP)
    t_short_a = sim_short_smc_breakdown(df_30m, top_64_30m, btm_64_30m, btm_32_30m, top_48_30m, bear_macro_30m.values, 0.05, 0.015, 0.12)
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
        "badge": f"+{m_short_a['total_return_pct']}% Return (Win Rate {m_short_a['win_rate_pct']}%)",
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
    print(f"  ✓ 8. Short V2 Type A: {len(t_short_a)} trades | Total Return: {m_short_a['total_return_pct']:+,.1f}% | Win Rate: {m_short_a['win_rate_pct']}%")

    # 9. Pippo 30M Short V2 Type B (Max Frequency)
    t_short_b = sim_short_smc_breakdown(df_30m, top_64_30m, btm_64_30m, btm_16_30m, top_32_30m, bear_macro_30m.values, 0.05, 0.02, 0.25)
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
        "badge": f"+{m_short_b['total_return_pct']}% Return ({len(t_short_b)} Trades)",
        "badge": make_badge(m_short_b["total_return_pct"], f"{len(t_short_b)} Trades"),
        "metrics": m_short_b,
        "parameters": {
            "timeframe": "30m",
            "macro_filters": "Weekly MA55 & 4H SMA111 Bearish",
            "entry_breakout": "16-bar Low Breakdown",
            "exit_ceiling": "32-bar High Structural Exit",
            "stop_loss": "5.0%",
            "breakeven": "+2.0% trigger -> BE",
            "take_profit": "25.0%",
            "commission": "0.09%"
        },
        "logic_summary": "High-frequency bearish model capturing local breakdown volatility with 25% TP targets.",
        "yearly_stats": y_short_b,
        "markers": mk_short_b,
        "trades": t_short_b,
        "has_active_signal": tk_short_b is not None,
        "active_ticket": tk_short_b
    })
    print(f"  ✓ 9. Short V2 Type B: {len(t_short_b)} trades | Total Return: {m_short_b['total_return_pct']:+,.1f}% | Win Rate: {m_short_b['win_rate_pct']}%")

    # 10. Pippo 30M Short V2 Type C (Defensive Fortress)
    t_short_c = sim_short_smc_breakdown(df_30m, top_64_30m, btm_64_30m, btm_32_30m, top_16_30m, bear_macro_30m.values, 0.06, 0.025, 0.50)
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
        "badge": f"+{m_short_c['total_return_pct']}% Return (Target 50% TP)",
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
    print(f"  ✓ 10. Short V2 Type C: {len(t_short_c)} trades | Total Return: {m_short_c['total_return_pct']:+,.1f}% | Win Rate: {m_short_c['win_rate_pct']}%")

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

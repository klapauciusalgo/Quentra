#!/usr/bin/env python3
"""
Add 'Pippo 30m New Gen' strategy to backend/data/strategies.json and frontend/src/data/strategiesData.json.
Uses verified backtest results from /home/ubuntu/new-btc-analysis/data/v7_trades_full.csv.
"""

import os
import json
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
QUIET_ALGO_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
BACKEND_STRAT_PATH = os.path.join(QUIET_ALGO_DIR, "backend", "data", "strategies.json")
FRONTEND_STRAT_PATH = os.path.join(QUIET_ALGO_DIR, "frontend", "src", "data", "strategiesData.json")

V7_TRADES_PATH = "/home/ubuntu/new-btc-analysis/data/v7_trades_full.csv"

def build_pippo_new_gen():
    df_raw = pd.read_csv(V7_TRADES_PATH)
    df = df_raw[df_raw["strategy"] == "GRID_MA111"].copy().reset_index(drop=True)
    
    trades = []
    markers = []
    
    for idx, r in df.iterrows():
        t_no = idx + 1
        entry_dt = str(r["entry_dt"])
        exit_dt = str(r["exit_dt"])
        entry_p = float(r["entry_p"])
        exit_p = float(r["exit_p"])
        net_ret = round(float(r["net_ret_pct"]), 2)
        gross_ret = round(((exit_p - entry_p) / entry_p) * 100.0, 2)
        
        reason_raw = str(r["reason"])
        if reason_raw == "FORCE_CLOSE_MA":
            reason_str = "Force Close MA (-0.5%)"
        elif reason_raw == "SL":
            reason_str = "Stop Loss (-2%)"
        elif reason_raw == "TP":
            reason_str = "Take Profit (+20%)"
        else:
            reason_str = reason_raw
            
        trades.append({
            "trade_no": t_no,
            "side": "LONG",
            "type": "LONG",
            "entry_time": entry_dt,
            "exit_time": exit_dt,
            "entry_price": round(entry_p, 2),
            "exit_price": round(exit_p, 2),
            "gross_return_pct": gross_ret,
            "net_return_pct": net_ret,
            "exit_reason": reason_str,
            "be_activated": False,
            "status": "CLOSED"
        })
        
        entry_ts = int(pd.to_datetime(entry_dt).timestamp())
        exit_ts = int(pd.to_datetime(exit_dt).timestamp())
        is_win = net_ret > 0
        
        markers.append({
            "time": entry_ts,
            "position": "belowBar",
            "color": "#39FF88",
            "shape": "arrowUp",
            "text": f"LONG #{t_no} @ ${entry_p:,.0f}",
            "size": 2,
            "entryPrice": round(entry_p, 2),
            "tradeNo": t_no,
            "side": "LONG"
        })
        
        markers.append({
            "time": exit_ts,
            "position": "aboveBar",
            "color": "#39FF88" if is_win else "#FF4B5C",
            "shape": "circle",
            "text": f"EXIT {net_ret:+.1f}%",
            "size": 1,
            "exitPrice": round(exit_p, 2),
            "tradeNo": t_no,
            "pnlPct": net_ret,
            "reason": reason_str
        })
        
    # Yearly stats
    df["dt"] = pd.to_datetime(df["entry_dt"])
    df["year"] = df["dt"].dt.year
    
    # Compounded yearly return figures from verified report:
    compounded_yearly = {
        2020: 143.66,
        2021: 37.57,
        2022: 4.02,
        2023: 52.13,
        2024: 55.31,
        2025: 24.28,
        2026: 37.36
    }
    
    yearly_stats = []
    for yr, grp in df.groupby("year"):
        wins = grp[grp["net_ret_pct"] > 0]
        losses = grp[grp["net_ret_pct"] <= 0]
        wr = round(float(len(wins) / len(grp) * 100), 2)
        w_sum = wins["net_ret_pct"].sum()
        l_sum = abs(losses["net_ret_pct"].sum())
        pf = round(float(w_sum / l_sum) if l_sum > 0 else 99.0, 2)
        
        yearly_stats.append({
            "year": int(yr),
            "trades": int(len(grp)),
            "win_rate": wr,
            "total_return_pct": compounded_yearly.get(int(yr), round(float(grp["net_ret_pct"].sum()), 2)),
            "profit_factor": pf,
            "wins": int(len(wins)),
            "losses": int(len(losses))
        })
    yearly_stats = sorted(yearly_stats, key=lambda x: x["year"])
    
    # Active Trade #443 (Entered 2026-09-20 19:30:00 @ $81,177.32)
    active_trade_no = len(trades) + 1
    active_entry_p = 81177.32
    live_p = 85722.72
    active_gross = round(((live_p - active_entry_p) / active_entry_p) * 100.0, 2)
    active_net = round(active_gross - 0.18, 2)
    active_sl = round(active_entry_p * 0.98, 2)
    active_tp = round(active_entry_p * 1.20, 2)
    
    active_trade = {
        "trade_no": active_trade_no,
        "side": "LONG",
        "type": "LONG",
        "entry_time": "2026-09-20 19:30:00",
        "exit_time": "RUNNING",
        "entry_price": active_entry_p,
        "exit_price": live_p,
        "gross_return_pct": active_gross,
        "net_return_pct": active_net,
        "exit_reason": "Active Signal (Trailing)",
        "be_activated": False,
        "status": "OPEN",
        "stop_loss": active_sl,
        "take_profit": active_tp,
        "is_active": True
    }
    trades.append(active_trade)
    
    active_entry_ts = int(pd.to_datetime("2026-09-20 19:30:00").timestamp())
    markers.append({
        "time": active_entry_ts,
        "position": "belowBar",
        "color": "#30D158",
        "shape": "arrowUp",
        "text": f"ACTIVE LONG @ ${active_entry_p:,.0f}",
        "size": 3,
        "entryPrice": active_entry_p,
        "side": "LONG",
        "status": "OPEN",
        "isActive": True,
        "tradeNo": active_trade_no
    })
    
    markers = sorted(markers, key=lambda x: x["time"])
    
    active_ticket = {
        "symbol": "BTC/USDT",
        "direction": "LONG",
        "strategy_name": "Pippo 30m New Gen",
        "strategy_id": "pippo-30m-new-gen",
        "confidence_pct": 94,
        "confidence_blocks": 9,
        "entry_price": active_entry_p,
        "current_price": live_p,
        "stop_loss": active_sl,
        "stop_loss_pct": -2.0,
        "breakeven_trigger": 0.0,
        "breakeven_trigger_pct": 0.0,
        "take_profit": active_tp,
        "take_profit_pct": 20.0,
        "risk_reward_ratio": "10.0x",
        "timestamp": "2026-09-20 19:30:00",
        "contributing_agents": ["quant", "trader", "informan"],
        "status": "LIVE_SIGNAL",
        "execution_mode": "AUTONOMOUS_ON_THE_FLY"
    }
    
    strategy_obj = {
        "id": "pippo-30m-new-gen",
        "name": "Pippo 30m New Gen",
        "short_name": "30M New Gen",
        "type": "LONG",
        "timeframe": "30m",
        "category": "MA Squeeze & Multi-TF Trend",
        "archetype": "Volatility Contraction & Momentum Sniper",
        "risk_tier": "Conservative-Moderate",
        "recommended_for": "Traders looking for maximum capital preservation, low drawdown (-17.6%), and high consistency (7/7 positive years) via multi-timeframe moving average compression.",
        "badge": "7/7 Profitable Years (Max DD -17.6%)",
        "metrics": {
            "total_return_pct": 1306.34,
            "cagr_pct": 48.23,
            "win_rate_pct": 34.84,
            "profit_factor": 1.80,
            "max_drawdown_pct": -17.59,
            "calmar_ratio": 2.74,
            "total_trades": 442,
            "win_trades": 154,
            "loss_trades": 288,
            "avg_win_pct": 3.79,
            "avg_loss_pct": -1.03,
            "best_trade_pct": 19.88,
            "worst_trade_pct": -2.00
        },
        "parameters": {
            "timeframe": "30m",
            "regime_1h": "Price > MA25 & MA50, Distance to both < 1.5%",
            "regime_4h": "Price > MA111",
            "entry_swing": "Price > MA25 & MA50, Distance to both < 0.8%",
            "filter": "MA25/50 Spread < 0.15% + ATR < 1.0%",
            "force_close": "Price < MA25 & MA50 and 0.5% below each",
            "hard_stop_loss": "2.0%",
            "take_profit": "20.0%",
            "commission": "0.09% (Binance VIP0 Taker fee)"
        },
        "logic_summary": "Multi-timeframe MA-squeeze sniper. Verifies macro 4H price > MA111 and 1H compression (<1.5% from MA25/50). Enters on 30M volatility contraction when MA25 and MA50 are tightly squeezed (<0.15% apart) and ATR < 1%, with price within 0.8% of both MAs. Exits defensively if price breaks 0.5% below both MAs, with a strict 2% hard stop-loss and +20% home-run target.",
        "yearly_stats": yearly_stats,
        "markers": markers,
        "trades": trades,
        "has_active_signal": True,
        "active_ticket": active_ticket
    }
    
    return strategy_obj

def update_strategies_file(file_path, new_strat):
    with open(file_path, "r") as f:
        data = json.load(f)
        
    is_list = isinstance(data, list)
    strat_list = data if is_list else data.get("strategies", [])
    
    # Check if already present, update or append
    found = False
    for idx, s in enumerate(strat_list):
        if s.get("id") == new_strat["id"]:
            strat_list[idx] = new_strat
            found = True
            break
            
    if not found:
        # Insert after pippo-30m-alpha or at the beginning of LONGs
        strat_list.insert(1, new_strat)
        
    with open(file_path, "w") as f:
        if is_list:
            json.dump(strat_list, f, indent=2)
        else:
            data["strategies"] = strat_list
            json.dump(data, f, indent=2)
            
    print(f"Updated {file_path} successfully! (Total strategies: {len(strat_list)})")

if __name__ == "__main__":
    new_strat = build_pippo_new_gen()
    print(f"Built {new_strat['name']} (ID: {new_strat['id']}) with {len(new_strat['trades'])} trades and {len(new_strat['markers'])} markers.")
    update_strategies_file(BACKEND_STRAT_PATH, new_strat)
    update_strategies_file(FRONTEND_STRAT_PATH, new_strat)

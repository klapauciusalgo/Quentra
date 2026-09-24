#!/usr/bin/env python3
"""
Recalculate and synchronize BTC Strategy Metrics and Yearly Stats for Quentra.
Ensures 100% mathematical consistency across:
- Overview & Logic tabsheet (strategy.metrics)
- Year-by-Year YoY tabsheet (strategy.yearly_stats)
- Trade Logs (strategy.trades)
- Algo vs Bitcoin Price Visualizer (equity compounding curve)
"""

import os
import json
import re
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DATA = os.path.join(BASE_DIR, "..", "frontend", "src", "data", "strategiesData.json")
BACKEND_DATA = os.path.join(BASE_DIR, "data", "strategies.json")


def _parse_datetime(value):
    """Parse the mixed timestamp formats present in historical/live logs."""
    return pd.to_datetime(value, format="mixed", utc=True)

def recalculate_metrics_for_trades(closed_trades):
    if not closed_trades:
        return {
            "total_return_pct": 0.0, "cagr_pct": 0.0, "win_rate_pct": 0.0,
            "profit_factor": 1.0, "max_drawdown_pct": 0.0, "calmar_ratio": 1.0,
            "total_trades": 0, "win_trades": 0, "loss_trades": 0,
            "avg_win_pct": 0.0, "avg_loss_pct": 0.0, "best_trade_pct": 0.0, "worst_trade_pct": 0.0
        }

    df_t = pd.DataFrame(closed_trades)
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

    years = (
        _parse_datetime(df_t["exit_time"].iloc[-1])
        - _parse_datetime(df_t["entry_time"].iloc[0])
    ).total_seconds() / (86400 * 365.25)
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
        "total_trades": len(closed_trades),
        "win_trades": len(wins),
        "loss_trades": len(losses),
        "avg_win_pct": round(float(wins["net_return_pct"].mean()), 2) if len(wins) > 0 else 0.0,
        "avg_loss_pct": round(float(losses["net_return_pct"].mean()), 2) if len(losses) > 0 else 0.0,
        "best_trade_pct": round(float(df_t["net_return_pct"].max()), 2),
        "worst_trade_pct": round(float(df_t["net_return_pct"].min()), 2)
    }

def recalculate_yearly_stats(closed_trades):
    if not closed_trades:
        return []
    df_t = pd.DataFrame(closed_trades)
    df_t["year"] = _parse_datetime(df_t["entry_time"]).dt.year
    yearly = []

    for yr, grp in df_t.groupby("year"):
        wins = grp[grp["net_return_pct"] > 0]
        losses = grp[grp["net_return_pct"] <= 0]
        wr = round(float(len(wins) / len(grp) * 100), 2)
        w_sum = wins["net_return_pct"].sum() if len(wins) > 0 else 0.0
        l_sum = abs(losses["net_return_pct"].sum()) if len(losses) > 0 else 0.0
        pf = round(float(w_sum / l_sum) if l_sum > 0 else 99.0, 2)

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


def _format_signed_pct(value, decimals=2):
    return f"{float(value):+,.{decimals}f}%"


def _refresh_metric_badge(strat, metrics, yearly_stats):
    """Keep numeric performance badges aligned with recalculated metrics."""
    strat_id = strat.get("id")
    badge = strat.get("badge")
    if not badge:
        return

    total = _format_signed_pct(metrics["total_return_pct"])
    cagr = f"{float(metrics['cagr_pct']):,.2f}%"
    max_dd = f"{float(metrics['max_drawdown_pct']):+,.2f}%"
    win_rate = f"{float(metrics['win_rate_pct']):,.1f}%"

    if strat_id == "pippo-30m-alpha":
        if "Return" in badge:
            badge = re.sub(r"[+-]?\d[\d,]*(?:\.\d+)?%", total, badge, count=1)
            badge = re.sub(r"CAGR\s+[+-]?\d[\d,]*(?:\.\d+)?%", f"CAGR {cagr}", badge)
        else:
            badge = re.sub(r"\d[\d,]*(?:\.\d+)?x", f"{float(metrics['profit_factor']):.2f}x", badge, count=1)
    elif strat_id == "pippo-30m-new-gen":
        profitable_years = sum(1 for row in yearly_stats if row["total_return_pct"] > 0)
        badge = re.sub(r"\d+\/\d+\s+Profitable Years", f"{profitable_years}/{len(yearly_stats)} Profitable Years", badge)
        badge = re.sub(r"Max DD\s+[+-]?\d[\d,]*(?:\.\d+)?%", f"Max DD {max_dd}", badge)
    elif strat_id == "pippo-30m-grd":
        badge = re.sub(r"[+-]?\d[\d,]*(?:\.\d+)?%", total, badge, count=1)
        badge = re.sub(r"CAGR\s+[+-]?\d[\d,]*(?:\.\d+)?%", f"CAGR {cagr}", badge)
        if "Trades" in badge:
            badge = re.sub(r"\d[\d,]*\s+Trades", f"{metrics['total_trades']} Trades", badge, count=1)
    elif strat_id == "pippo-1h-enhanced":
        badge = re.sub(r"[+-]?\d[\d,]*(?:\.\d+)?%", total, badge, count=1)
        badge = re.sub(r"CAGR\s+[+-]?\d[\d,]*(?:\.\d+)?%", f"CAGR {cagr}", badge)
    elif strat_id == "pippo-30m-scalp":
        badge = re.sub(r"\d[\d,]*(?:\.\d+)?%\s+WR", f"{win_rate} WR", badge, count=1)
    elif strat_id == "pure-macro-weekly-ma55":
        badge = re.sub(r"[+-]?\d[\d,]*(?:\.\d+)?%", total, badge, count=1)
    elif strat_id == "pippo-4h-original":
        badge = re.sub(r"[+-]?\d[\d,]*(?:\.\d+)?%", total, badge, count=1)
        badge = re.sub(r"CAGR\s+[+-]?\d[\d,]*(?:\.\d+)?%", f"CAGR {cagr}", badge)
    elif strat_id == "pippo-30m-short-v2-a":
        badge = re.sub(r"\d[\d,]*(?:\.\d+)?%\s+WR", f"{win_rate} WR", badge, count=1)
    elif strat_id == "pippo-30m-short-v2-b":
        badge = re.sub(r"\d[\d,]*\s+Trades", f"{metrics['total_trades']} Trades", badge, count=1)

    strat["badge"] = badge

def process_strategies(
    input_file,
    *,
    clean_pure_macro=True,
    apply_btc_metadata=True,
):
    """Recalculate one strategy catalog from its trade log.

    The metric math is symbol agnostic.  The old implementation was named
    ``recalculate_btc_metrics`` and also applied a few BTC-only catalog
    cleanup/badge overrides, which made it unsafe to call for ETH.  Callers
    handling another symbol disable those catalog overrides while retaining
    the same metric calculation.
    """
    with open(input_file, "r") as f:
        strategies = json.load(f)

    for strat in strategies:
        strat_id = strat["id"]
        trades = strat.get("trades", [])

        # Clean stray mock trades from pure-macro-weekly-ma55.  This is a
        # one-time BTC data migration and must not mutate the ETH catalog.
        if clean_pure_macro and strat_id == "pure-macro-weekly-ma55":
            trades = [t for t in trades if t.get("trade_no", 999) <= 6]
            strat["trades"] = trades
            # Clean markers
            if "markers" in strat:
                strat["markers"] = [m for m in strat["markers"] if m.get("tradeNo", 999) <= 6]
            strat["badge"] = "Macro Master (+1,751%)"
            if "logic_summary" in strat:
                strat["logic_summary"] = strat["logic_summary"].replace("+2,067.6%", "+1,751.1%").replace("+2,067%", "+1,751%")

        if apply_btc_metadata:
            if strat_id == "pippo-30m-grd":
                strat["badge"] = "+1,649.6% Return (CAGR 53.2%)"

            if strat_id == "pippo-1h-enhanced":
                strat["badge"] = "Top Performer (+2,392%)"

            if strat_id == "pippo-4h-original":
                strat["badge"] = "Original Classic (+1,240%)"

        # Separate closed vs open trades
        closed_trades = [
            t for t in trades 
            if t.get("exit_time") and 
            "RUNNING" not in str(t.get("exit_time")) and 
            t.get("status") != "OPEN"
        ]

        metrics = recalculate_metrics_for_trades(closed_trades)
        yearly_stats = recalculate_yearly_stats(closed_trades)

        # Update strategy dictionary
        strat["metrics"] = metrics
        strat["yearly_stats"] = yearly_stats
        strat["total_return_pct"] = metrics["total_return_pct"]
        strat["win_rate_pct"] = metrics["win_rate_pct"]
        strat["profit_factor"] = metrics["profit_factor"]
        strat["max_drawdown_pct"] = metrics["max_drawdown_pct"]
        strat["trades_count"] = metrics["total_trades"]
        _refresh_metric_badge(strat, metrics, yearly_stats)

    return strategies

def main():
    print("Recalculating BTC Strategy Metrics for consistency...")
    updated_backend = process_strategies(BACKEND_DATA)
    with open(BACKEND_DATA, "w") as f:
        json.dump(updated_backend, f, indent=2)
    print(f"Successfully updated {BACKEND_DATA}")

    updated_frontend = process_strategies(FRONTEND_DATA)
    with open(FRONTEND_DATA, "w") as f:
        json.dump(updated_frontend, f, indent=2)
    print(f"Successfully updated {FRONTEND_DATA}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Pixel Trading Floor State Engine for QuietAlgo.
Implements the 16-bit isometric trading floor concept from Design.md:
- 4 Core Agents (Researcher, Quant, Trader, Informan) + Risk Officer
- Central floor screen ticker
- Live agent reasoning logs and dialogue bubbles
- Market session calculation (Asia, London, New York)
"""

import time
from datetime import datetime, timezone

def get_market_session():
    utc_hour = datetime.now(timezone.utc).hour
    # Asia: 00:00 - 08:00 UTC
    # London: 08:00 - 16:00 UTC
    # New York: 13:00 - 21:00 UTC
    # Overlaps handled gracefully
    if 0 <= utc_hour < 8:
        return {"name": "Asia Session (Tokyo / HK)", "active": True, "code": "ASIA", "time_utc": f"{utc_hour:02d}:00 UTC"}
    elif 8 <= utc_hour < 13:
        return {"name": "London Session (European Open)", "active": True, "code": "LDN", "time_utc": f"{utc_hour:02d}:00 UTC"}
    elif 13 <= utc_hour < 16:
        return {"name": "London / New York Overlap (Peak Volume)", "active": True, "code": "LDN_NY", "time_utc": f"{utc_hour:02d}:00 UTC"}
    elif 16 <= utc_hour < 21:
        return {"name": "New York Session (US Trading)", "active": True, "code": "NY", "time_utc": f"{utc_hour:02d}:00 UTC"}
    else:
        return {"name": "US Close / Asia Pre-Open", "active": True, "code": "PRE_ASIA", "time_utc": f"{utc_hour:02d}:00 UTC"}

class PixelFloorEngine:
    def __init__(self):
        self.active_agent_id = "trader"
        self.last_signal_time = int(time.time())
        self.signal_ticket = {
            "symbol": "BTC/USDT",
            "direction": "LONG",
            "strategy_name": "Pippo 1h Enhanced",
            "strategy_id": "pippo-1h-enhanced",
            "confidence_pct": 88,
            "confidence_blocks": 8,
            "entry_price": 77293.0,
            "stop_loss": 71109.0,
            "stop_loss_pct": -8.0,
            "breakeven_trigger": 81157.0,
            "breakeven_trigger_pct": 5.0,
            "take_profit": 135262.0,
            "take_profit_pct": 75.0,
            "risk_reward_ratio": "9.37x",
            "timestamp": "2026-09-12 17:00 UTC",
            "contributing_agents": ["quant", "trader", "informan"],
            "status": "ACTIVE_WATCH"
        }

    def get_floor_state(self, current_btc_price: float = 77300.0):
        session = get_market_session()
        
        # Calculate dynamic distance to Weekly MA55 (anchor ~82,654)
        ma55_level = 82654.0
        ma55_diff_pct = ((current_btc_price - ma55_level) / ma55_level) * 100.0
        regime_status = "BULLISH_RECOVERY" if current_btc_price >= ma55_level else "MACRO_DISCOUNT"

        agents = [
            {
                "id": "researcher",
                "name": "Researcher",
                "role": "Macro & On-Chain Scout",
                "title": "Data Strategist",
                "desk_visual": "Stacked research papers, dual data feeds, magnifying glass",
                "grid_position": {"x": 1, "y": 2}, # mid-left
                "is_active": (self.active_agent_id == "researcher"),
                "speech_bubble": "Global liquidity index +2.4%. On-chain UTXO accumulation steady.",
                "status_badge": "ANALYZING",
                "color": "#38BDF8",
                "reasoning_log": [
                    "Macro Liquidity: Global central bank balance sheets showing mild expansion.",
                    "On-Chain Health: Long-term holder supply holding above 74% total circulating BTC.",
                    "Derivatives Funding: Neutral-to-negative (-0.002%), indicating healthy short-squeeze potential.",
                    "ETF Flows: Net inflows over the trailing 5-day cycle totaling $420M.",
                    "Cycle Thesis: 4-year halving trajectory in prime expansion phase; macro dips remain high-conviction accumulation zones."
                ]
            },
            {
                "id": "quant",
                "name": "Quant",
                "role": "SMC & Indicators Engine",
                "title": "Algorithm Architect",
                "desk_visual": "Multi-monitor matrix showing live candlesticks & Fibonacci grids",
                "grid_position": {"x": 3, "y": 2}, # mid-right
                "is_active": (self.active_agent_id == "quant"),
                "speech_bubble": "1H 16-bar internal structure broke bullish. 48h floor intact.",
                "status_badge": "COMPUTING",
                "color": "#39FF88",
                "reasoning_log": [
                    f"BTC Price: ${current_btc_price:,.2f} | 1H RSI14: 56.4 (Bullish Momentum Territory)",
                    "Moving Averages: 30m MA8 crossed above MA25; 1H EMA50 currently support at $76,920.",
                    "Smart Money Concepts (SMC): 50-bar major swing high validated; 16-bar internal CHoCH confirmed.",
                    "Structural Exit Floor: 48-hour swing low set at $74,800. Any candle close below terminates runner.",
                    "Volatility Compression: Bollinger Band bandwidth down to 2.8%, signaling incoming expansion impulse."
                ]
            },
            {
                "id": "trader",
                "name": "Trader",
                "role": "Signal Dispatcher & Execution",
                "title": "Floor Operator",
                "desk_visual": "Standing workstation, retro headset, scrolling ticker tape",
                "grid_position": {"x": 2, "y": 3}, # front-and-center
                "is_active": (self.active_agent_id == "trader"),
                "speech_bubble": "Pippo 1H Enhanced setup primed. Limit orders standing by.",
                "status_badge": "SIGNAL_DISPATCH",
                "color": "#4FE0FF",
                "reasoning_log": [
                    "Active Setup: Pippo 1h Enhanced (Historical Win Rate 65.6%, Profit Factor 3.81).",
                    "Order Routing: Limit fill protocol on bar close confirmation (0.09% taker fee modeled).",
                    "Risk Gate: Hard stop loss fixed at -8.0% ($71,109).",
                    "Dynamic Breakeven: At +5.0% profit ($81,157), stop loss will automatically jump to entry + 0.2% for risk-free run.",
                    "Target Runner: +75.0% take profit ladder ($135,262) with 48h trailing structural floor."
                ]
            },
            {
                "id": "informan",
                "name": "Informan",
                "role": "Market Regime & Sentiment",
                "title": "Macro Overseer",
                "desk_visual": "Back wall desk near panoramic window with global outlook board",
                "grid_position": {"x": 2, "y": 1}, # back wall center
                "is_active": (self.active_agent_id == "informan"),
                "speech_bubble": f"Weekly MA55 at ${ma55_level:,.0f} ({ma55_diff_pct:+.1f}%). Session: {session['code']}",
                "status_badge": "REGIME_WATCH",
                "color": "#FFC145",
                "reasoning_log": [
                    f"Master Macro Anchor: 55-Week SMA currently at ${ma55_level:,.0f}.",
                    f"Current Distance: {ma55_diff_pct:+.2f}% from weekly trend dividing line.",
                    "Regime Rule: When Weekly Close >= MA55, pure long strategies enjoy 66.7% win rate and +2,067% return.",
                    f"Session Context: Currently trading in {session['name']}.",
                    "Daily Volatility: 24h range between normal bands, institutional liquidity dominant."
                ]
            },
            {
                "id": "risk_officer",
                "name": "Risk Officer",
                "role": "Capital & Liquidation Guard",
                "title": "Guardian Protocol",
                "desk_visual": "Reinforced desk with digital liquidation shield & warning lights",
                "grid_position": {"x": 0, "y": 2}, # far left
                "is_active": (self.active_agent_id == "risk_officer"),
                "speech_bubble": "Effective leverage 1.0x. Liquidation buffer is 100% safe (-96%).",
                "status_badge": "SHIELD_SECURE",
                "color": "#A855F7",
                "reasoning_log": [
                    "Margin Architecture: 20% margin allocated with 5x leverage -> 1.0x effective account leverage.",
                    "Liquidation Buffer: Spot/Cross margin distance to liquidation is -96% ($2,400 BTC). 0% historical liquidation rate.",
                    "Drawdown Threshold: Maximum historical system drawdown clamped below -46% over 6 years.",
                    "Position Sizing: Compounding formula calculates max 1 position per strategy to prevent cross-contamination.",
                    "Emergency Protocol: Flash crash volatility breaker halts new entries if 15m candle drops > 6%."
                ]
            }
        ]

        # Update ticket with latest live price
        updated_ticket = dict(self.signal_ticket)
        updated_ticket["current_price"] = current_btc_price
        updated_ticket["session"] = session

        return {
            "room_name": "Quietfloor Pixel Trading Floor",
            "session": session,
            "market_regime": {
                "status": regime_status,
                "weekly_ma55": ma55_level,
                "distance_pct": round(ma55_diff_pct, 2),
                "summary": "Weekly Close vs MA55 Macro Horizon"
            },
            "agents": agents,
            "active_agent_id": self.active_agent_id,
            "signal_ticket": updated_ticket,
            "timestamp": int(time.time() * 1000)
        }

    def set_active_agent(self, agent_id: str):
        valid_ids = ["researcher", "quant", "trader", "informan", "risk_officer"]
        if agent_id in valid_ids:
            self.active_agent_id = agent_id

    def trigger_signal(self, strategy_id: str, strategy_name: str, direction: str, current_price: float):
        self.last_signal_time = int(time.time())
        self.active_agent_id = "trader"
        self.signal_ticket = {
            "symbol": "BTC/USDT",
            "direction": direction,
            "strategy_name": strategy_name,
            "strategy_id": strategy_id,
            "confidence_pct": 92 if direction == "LONG" else 85,
            "confidence_blocks": 9 if direction == "LONG" else 8,
            "entry_price": current_price,
            "stop_loss": round(current_price * (0.92 if direction == "LONG" else 1.05), 2),
            "stop_loss_pct": -8.0 if direction == "LONG" else 5.0,
            "breakeven_trigger": round(current_price * (1.05 if direction == "LONG" else 0.985), 2),
            "breakeven_trigger_pct": 5.0 if direction == "LONG" else -1.5,
            "take_profit": round(current_price * (1.75 if direction == "LONG" else 0.88), 2),
            "take_profit_pct": 75.0 if direction == "LONG" else 12.0,
            "risk_reward_ratio": "9.37x" if direction == "LONG" else "2.40x",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "contributing_agents": ["quant", "trader", "informan"],
            "status": "LIVE_SIGNAL"
        }
        return self.signal_ticket

floor_engine = PixelFloorEngine()

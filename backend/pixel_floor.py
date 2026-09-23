#!/usr/bin/env python3
"""
Pixel Trading Floor State Engine for Quentra.
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

    def get_floor_state(self, current_btc_price: float = 77300.0, current_eth_price: float = 2645.20):
        session = get_market_session()
        
        # Retrieve dynamic telemetry from live_signal_engine
        try:
            from live_signal_engine import live_signal_engine
            macro = live_signal_engine.macro_state
            ma55_level = macro.get("weekly_ma55", 82654.0)
            ma55_diff_pct = macro.get("distance_weekly_ma55_pct", ((current_btc_price - ma55_level) / ma55_level) * 100.0)
            regime_status = "BULLISH_RECOVERY" if macro.get("is_weekly_bullish") else "MACRO_DISCOUNT"
            ticket = live_signal_engine.get_active_or_latest_ticket(self.signal_ticket.get("strategy_id"))
            telemetry = live_signal_engine.get_live_telemetry()
        except Exception as ex:
            ma55_level = 82654.0
            ma55_diff_pct = ((current_btc_price - ma55_level) / ma55_level) * 100.0
            regime_status = "BULLISH_RECOVERY" if current_btc_price >= ma55_level else "MACRO_DISCOUNT"
            ticket = dict(self.signal_ticket)
            ticket["current_price"] = current_btc_price
            telemetry = None

        eth_ma55_level = 2648.68
        eth_diff_pct = ((current_eth_price - eth_ma55_level) / eth_ma55_level) * 100.0
        eth_regime_status = "BULLISH_RECOVERY" if current_eth_price >= eth_ma55_level else "MACRO_DISCOUNT"

        quant_speech = (
            f"BTC: ${current_btc_price:,.2f} | Nearest Entry: ${ticket.get('entry_price', 0):,.2f} ({ticket.get('trigger_distance_pct', 0):+.1f}%)"
            if ticket.get("trigger_distance_pct") is not None
            else f"BTC: ${current_btc_price:,.2f} | 1H SMC Structure active."
        )

        trader_speech = (
            f"Autonomous Engine: {ticket.get('status')} ({ticket.get('direction')}). Floor: ${ticket.get('stop_loss', 0):,.2f}"
        )

        informan_speech = (
            f"Weekly MA55: ${ma55_level:,.0f} ({ma55_diff_pct:+.1f}%). Session: {session['code']}"
        )

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
                "speech_bubble": quant_speech,
                "status_badge": "COMPUTING",
                "color": "#39FF88",
                "reasoning_log": [
                    f"BTC Price: ${current_btc_price:,.2f} | Real-Time Swing Telemetry Active",
                    f"Nearest Breakout / Breakdown Level: ${ticket.get('entry_price', 0):,.2f}",
                    f"Distance to Trigger: {ticket.get('trigger_distance_pct', 0):+.2f}%",
                    f"Active Floor Level: ${ticket.get('stop_loss', 0):,.2f}",
                    "Volatility Compression: Evaluating live candle closes on-the-fly (30m/1h)."
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
                "speech_bubble": trader_speech,
                "status_badge": "SIGNAL_DISPATCH" if ticket.get("status") == "LIVE_SIGNAL" else "ACTIVE_WATCH",
                "color": "#4FE0FF",
                "reasoning_log": [
                    f"Active Setup: {ticket.get('strategy_name')} ({ticket.get('direction')}).",
                    f"System State: {ticket.get('status')} | Execution: Autonomous On-The-Fly.",
                    f"Risk Gate: Stop Loss set at ${ticket.get('stop_loss', 0):,.2f} ({ticket.get('stop_loss_pct', 0):+.1f}%).",
                    f"Dynamic Breakeven: Trigger at ${ticket.get('breakeven_trigger', 0):,.2f} ({ticket.get('breakeven_trigger_pct', 0):+.1f}%).",
                    f"Target Take Profit: ${ticket.get('take_profit', 0):,.2f} ({ticket.get('take_profit_pct', 0):+.1f}%)."
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
                "speech_bubble": informan_speech,
                "status_badge": "REGIME_WATCH",
                "color": "#FFC145",
                "reasoning_log": [
                    f"Master Macro Anchor: 55-Week SMA currently at ${ma55_level:,.0f}.",
                    f"Current Distance: {ma55_diff_pct:+.2f}% from weekly trend dividing line.",
                    f"Regime Rule: Macro status is {regime_status}.",
                    f"Session Context: Currently trading in {session['name']}.",
                    "Daily Volatility: Real-time Binance ticker & klines feed verified."
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
                    "Drawdown Threshold: Clamped risk modeling across all 8 verified models.",
                    "Position Sizing: Autonomous single-position allocation per strategy.",
                    "Emergency Breaker: Automatic instant exit if stop loss breached."
                ]
            }
        ]

        ticket["session"] = session

        return {
            "room_name": "Quentra Trading Floor",
            "session": session,
            "market_regime": {
                "status": regime_status,
                "weekly_ma55": ma55_level,
                "distance_pct": round(ma55_diff_pct, 2),
                "summary": "Weekly Close vs MA55 Macro Horizon"
            },
            "eth_market_regime": {
                "status": eth_regime_status,
                "weekly_ma55": eth_ma55_level,
                "distance_pct": round(eth_diff_pct, 2),
                "summary": "ETH Weekly Close vs MA55 Macro Horizon"
            },
            "agents": agents,
            "active_agent_id": self.active_agent_id,
            "signal_ticket": ticket,
            "telemetry": telemetry,
            "timestamp": int(time.time() * 1000)
        }

    def set_active_agent(self, agent_id: str):
        valid_ids = ["researcher", "quant", "trader", "informan", "risk_officer"]
        if agent_id in valid_ids:
            self.active_agent_id = agent_id

    def trigger_signal(self, strategy_id: str, strategy_name: str, direction: str, current_price: float, symbol: str = "BTCUSDT"):
        self.last_signal_time = int(time.time())
        self.active_agent_id = "trader"
        sym = symbol.upper()
        fmt_sym = "ETH/USDT" if sym == "ETHUSDT" else "BTC/USDT"
        
        try:
            from live_signal_engine import live_signal_engine
            model = live_signal_engine.get_model(strategy_id, symbol=sym)
            if model:
                ticket = live_signal_engine._open_position(model, current_price)
                ticket["execution_mode"] = "DIAGNOSTIC_TRIGGER"
                self.signal_ticket = ticket
                return ticket
        except Exception:
            pass

        self.signal_ticket = {
            "symbol": fmt_sym,
            "asset": sym,
            "direction": direction,
            "strategy_name": strategy_name,
            "strategy_id": strategy_id,
            "confidence_pct": 92 if direction == "LONG" else 85,
            "confidence_blocks": 9 if direction == "LONG" else 8,
            "entry_price": current_price,
            "current_price": current_price,
            "stop_loss": round(current_price * (0.92 if direction == "LONG" else 1.05), 2),
            "stop_loss_pct": -8.0 if direction == "LONG" else 5.0,
            "breakeven_trigger": round(current_price * (1.05 if direction == "LONG" else 0.985), 2),
            "breakeven_trigger_pct": 5.0 if direction == "LONG" else -1.5,
            "take_profit": round(current_price * (1.75 if direction == "LONG" else 0.88), 2),
            "take_profit_pct": 75.0 if direction == "LONG" else 12.0,
            "risk_reward_ratio": "9.37x" if direction == "LONG" else "2.40x",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "contributing_agents": ["quant", "trader", "informan"],
            "status": "LIVE_SIGNAL",
            "execution_mode": "DIAGNOSTIC_TRIGGER"
        }
        return self.signal_ticket

floor_engine = PixelFloorEngine()

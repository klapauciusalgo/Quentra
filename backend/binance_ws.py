#!/usr/bin/env python3
"""
Binance WebSocket Client for Quentra.
Connects to Binance public WebSocket streams (btcusdt@ticker and btcusdt@kline_30m).
Maintains live price, 24h statistics, latest candle updates, and broadcasts to connected frontend clients.
"""

import asyncio
import json
import logging
import time
from typing import Set
import websockets
from fastapi import WebSocket

logger = logging.getLogger("binance_ws")
logger.setLevel(logging.INFO)

BINANCE_WS_TICKER_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker"
BINANCE_WS_KLINE_30M_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_30m"

class BinanceManager:
    def __init__(self):
        self.connected_clients: Set[WebSocket] = set()
        self.is_connected = False
        self.last_tick_time = 0
        self.last_error = None
        self.ticker_data = {
            "symbol": "BTCUSDT",
            "price": 77300.0,
            "change_24h_pct": 0.0,
            "high_24h": 78500.0,
            "low_24h": 76200.0,
            "volume_24h": 24500.0,
            "quote_volume_24h": 1890000000.0,
            "timestamp": int(time.time() * 1000),
            "status": "INITIALIZING"
        }
        self.latest_candles = {
            "30m": None,
            "1h": None,
            "4h": None,
            "1d": None,
            "1w": None
        }

    async def register(self, websocket: WebSocket):
        await websocket.accept()
        self.connected_clients.add(websocket)
        # Send initial snapshot immediately
        try:
            await websocket.send_json({
                "type": "SNAPSHOT",
                "ticker": self.ticker_data,
                "binance_connected": self.is_connected,
                "timestamp": int(time.time() * 1000)
            })
        except Exception as e:
            logger.warning(f"Error sending snapshot: {e}")

    def unregister(self, websocket: WebSocket):
        self.connected_clients.discard(websocket)

    async def broadcast(self, message: dict):
        if not self.connected_clients:
            return
        dead_clients = set()
        for client in self.connected_clients:
            try:
                await client.send_json(message)
            except Exception:
                dead_clients.add(client)
        for dead in dead_clients:
            self.connected_clients.discard(dead)

    async def start_ticker_stream(self):
        retry_delay = 2
        while True:
            try:
                logger.info(f"Connecting to Binance Ticker WS: {BINANCE_WS_TICKER_URL}")
                async with websockets.connect(BINANCE_WS_TICKER_URL, ping_interval=20, ping_timeout=10) as ws:
                    self.is_connected = True
                    self.ticker_data["status"] = "LIVE"
                    self.last_error = None
                    retry_delay = 2
                    logger.info("Connected to Binance Ticker WebSocket successfully!")

                    # Broadcast connected status
                    await self.broadcast({
                        "type": "STATUS",
                        "binance_connected": True,
                        "status": "LIVE"
                    })

                    async for raw_msg in ws:
                        data = json.loads(raw_msg)
                        price = float(data.get("c", 0))
                        change_pct = float(data.get("P", 0))
                        high_24h = float(data.get("h", 0))
                        low_24h = float(data.get("l", 0))
                        volume_24h = float(data.get("v", 0))
                        quote_volume_24h = float(data.get("q", 0))
                        event_time = int(data.get("E", time.time() * 1000))

                        self.last_tick_time = event_time
                        self.ticker_data.update({
                            "symbol": "BTCUSDT",
                            "price": price,
                            "change_24h_pct": change_pct,
                            "high_24h": high_24h,
                            "low_24h": low_24h,
                            "volume_24h": volume_24h,
                            "quote_volume_24h": quote_volume_24h,
                            "timestamp": event_time,
                            "status": "LIVE"
                        })

                        # Broadcast ticker update to all active frontend clients
                        await self.broadcast({
                            "type": "TICKER",
                            "data": self.ticker_data
                        })

                        # On-the-fly live signal ticker evaluation (dynamic breakeven & intra-bar SL/TP)
                        try:
                            from live_signal_engine import live_signal_engine
                            events = live_signal_engine.on_ticker_tick(price, event_time)
                            for ev in events:
                                await self.broadcast(ev)
                        except Exception as ex:
                            logger.debug(f"Ticker signal eval: {ex}")

            except asyncio.CancelledError:
                logger.info("Binance WS stream cancelled.")
                break
            except Exception as e:
                self.is_connected = False
                self.last_error = str(e)
                self.ticker_data["status"] = "RECONNECTING"
                logger.warning(f"Binance WS connection error: {e}. Retrying in {retry_delay}s...")
                await self.broadcast({
                    "type": "STATUS",
                    "binance_connected": False,
                    "status": "RECONNECTING",
                    "error": str(e)
                })
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30)

    async def start_kline_stream(self):
        """Dual-stream (30m and 1h) kline listener for real-time bar close and autonomous signal triggering"""
        combined_kline_url = "wss://stream.binance.com:9443/stream?streams=btcusdt@kline_30m/btcusdt@kline_1h"
        retry_delay = 5
        while True:
            try:
                logger.info(f"Connecting to Binance Combined Klines WS: {combined_kline_url}")
                async with websockets.connect(combined_kline_url, ping_interval=20, ping_timeout=10) as ws:
                    async for raw_msg in ws:
                        msg = json.loads(raw_msg)
                        stream = msg.get("stream", "")
                        tf = "1h" if "1h" in stream else "30m"
                        data = msg.get("data", {})
                        k = data.get("k", {})
                        if k:
                            candle = {
                                "time": int(k["t"] / 1000),
                                "open": float(k["o"]),
                                "high": float(k["h"]),
                                "low": float(k["l"]),
                                "close": float(k["c"]),
                                "volume": float(k["v"]),
                                "is_closed": bool(k["x"])
                            }
                            self.latest_candles[tf] = candle
                            await self.broadcast({
                                "type": "KLINE",
                                "timeframe": tf,
                                "candle": candle
                            })

                            # Autonomous on-the-fly signal evaluation upon candle closure
                            if candle["is_closed"]:
                                try:
                                    from live_signal_engine import live_signal_engine
                                    await live_signal_engine.on_kline_closed(tf, candle, self)
                                except Exception as eval_err:
                                    logger.error(f"Error evaluating closed {tf} candle: {eval_err}", exc_info=True)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Kline WS stream error: {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30)

binance_manager = BinanceManager()

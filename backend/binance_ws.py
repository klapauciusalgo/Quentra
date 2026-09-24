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

BINANCE_WS_TICKER_URL = "wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/ethusdt@ticker"
BINANCE_WS_KLINE_30M_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_30m"

class BinanceManager:
    def __init__(self):
        self.connected_clients: Set[WebSocket] = set()
        self.is_connected = False
        self.last_tick_time = 0
        self.last_error = None
        self.ticker_data_map = {
            "BTCUSDT": {
                "symbol": "BTCUSDT",
                "price": 0.0,
                "change_24h_pct": 0.0,
                "high_24h": 0.0,
                "low_24h": 0.0,
                "volume_24h": 0.0,
                "quote_volume_24h": 0.0,
                "timestamp": int(time.time() * 1000),
                "status": "INITIALIZING"
            },
            "ETHUSDT": {
                "symbol": "ETHUSDT",
                "price": 0.0,
                "change_24h_pct": 0.0,
                "high_24h": 0.0,
                "low_24h": 0.0,
                "volume_24h": 0.0,
                "quote_volume_24h": 0.0,
                "timestamp": int(time.time() * 1000),
                "status": "INITIALIZING"
            }
        }
        self.ticker_data = self.ticker_data_map["BTCUSDT"]
        self.latest_candles = {
            "30m": None,
            "1h": None,
            "4h": None,
            "1d": None,
            "1w": None
        }

    def get_ticker(self, symbol: str = "BTCUSDT"):
        return self.ticker_data_map.get(symbol.upper(), self.ticker_data)

    async def register(self, websocket: WebSocket):
        await websocket.accept()
        self.connected_clients.add(websocket)
        # Send initial snapshot immediately
        try:
            await websocket.send_json({
                "type": "SNAPSHOT",
                "ticker": self.ticker_data,
                "tickers": self.ticker_data_map,
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
                    for t in self.ticker_data_map.values():
                        t["status"] = "LIVE"
                    self.last_error = None
                    retry_delay = 2
                    logger.info("Connected to Binance Multi-Ticker WebSocket successfully!")

                    # Broadcast connected status
                    await self.broadcast({
                        "type": "STATUS",
                        "binance_connected": True,
                        "status": "LIVE"
                    })

                    async for raw_msg in ws:
                        msg = json.loads(raw_msg)
                        data = msg.get("data", msg)
                        sym = str(data.get("s", "BTCUSDT")).upper()
                        if sym not in self.ticker_data_map:
                            continue

                        price = float(data.get("c", 0))
                        change_pct = float(data.get("P", 0))
                        high_24h = float(data.get("h", 0))
                        low_24h = float(data.get("l", 0))
                        volume_24h = float(data.get("v", 0))
                        quote_volume_24h = float(data.get("q", 0))
                        event_time = int(data.get("E", time.time() * 1000))

                        self.last_tick_time = event_time
                        self.ticker_data_map[sym].update({
                            "symbol": sym,
                            "price": price,
                            "change_24h_pct": change_pct,
                            "high_24h": high_24h,
                            "low_24h": low_24h,
                            "volume_24h": volume_24h,
                            "quote_volume_24h": quote_volume_24h,
                            "timestamp": event_time,
                            "status": "LIVE"
                        })

                        if sym == "BTCUSDT":
                            self.ticker_data = self.ticker_data_map["BTCUSDT"]

                        # Broadcast ticker update with symbol to all active frontend clients
                        await self.broadcast({
                            "type": "TICKER",
                            "symbol": sym,
                            "data": self.ticker_data_map[sym]
                        })

                        # On-the-fly live signal ticker evaluation for BTC and ETH
                        try:
                            from live_signal_engine import live_signal_engine
                            events = live_signal_engine.on_ticker_tick(price, event_time, symbol=sym)
                            for ev in events:
                                await self.broadcast(ev)
                        except Exception as ex:
                            logger.debug(f"Ticker signal eval ({sym}): {ex}")

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
        """Multi-timeframe (30m, 1h, 4h, 1d, 1w) kline listener for real-time bar close and autonomous signal triggering for BTC & ETH"""
        combined_kline_url = (
            "wss://stream.binance.com:9443/stream?streams="
            "btcusdt@kline_30m/btcusdt@kline_1h/btcusdt@kline_4h/btcusdt@kline_1d/btcusdt@kline_1w/"
            "ethusdt@kline_30m/ethusdt@kline_1h/ethusdt@kline_4h/ethusdt@kline_1d/ethusdt@kline_1w"
        )
        retry_delay = 5
        while True:
            try:
                logger.info(f"Connecting to Binance Combined Klines WS: {combined_kline_url}")
                async with websockets.connect(combined_kline_url, ping_interval=20, ping_timeout=10) as ws:
                    async for raw_msg in ws:
                        msg = json.loads(raw_msg)
                        stream = msg.get("stream", "")
                        sym = "ETHUSDT" if "ethusdt" in stream else "BTCUSDT"
                        tf = None
                        for candidate in ["30m", "1h", "4h", "1d", "1w"]:
                            if f"kline_{candidate}" in stream:
                                tf = candidate
                                break
                        if not tf:
                            continue

                        data = msg.get("data", {})
                        k = data.get("k", {})
                        if k:
                            candle = {
                                "time": int(k["t"] / 1000),
                                "timestamp": int(k["t"]),
                                "open": float(k["o"]),
                                "high": float(k["h"]),
                                "low": float(k["l"]),
                                "close": float(k["c"]),
                                "volume": float(k["v"]),
                                "is_closed": bool(k["x"])
                            }
                            if sym == "BTCUSDT":
                                self.latest_candles[tf] = candle
                            await self.broadcast({
                                "type": "KLINE",
                                "symbol": sym,
                                "timeframe": tf,
                                "candle": candle
                            })

                            # Autonomous on-the-fly signal evaluation upon candle closure
                            if candle["is_closed"]:
                                try:
                                    from live_signal_engine import live_signal_engine
                                    await live_signal_engine.on_kline_closed(tf, candle, self, symbol=sym)
                                    # Keep the REST chart feed on the same closed candle
                                    # sequence used by the signal engine.
                                    import main as backend_main
                                    backend_main.update_live_kline_cache(sym, tf, candle)
                                except Exception as eval_err:
                                    logger.error(f"Error evaluating closed {sym} {tf} candle: {eval_err}", exc_info=True)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Kline WS stream error: {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay = min(retry_delay * 1.5, 30)

def fetch_binance_klines_rest(symbol: str = "BTCUSDT", interval: str = "30m", limit: int = 1000, start_time: int = None):
    """
    Fetch historical closed klines from Binance public REST APIs.
    Fallback across official endpoints if needed.
    """
    import urllib.request
    from datetime import datetime, timezone

    urls = [
        "https://api.binance.com/api/v3/klines",
        "https://data-api.binance.vision/api/v3/klines",
        "https://api1.binance.com/api/v3/klines"
    ]
    params = f"?symbol={symbol}&interval={interval}&limit={limit}"
    if start_time:
        params += f"&startTime={start_time}"

    for base in urls:
        try:
            req = urllib.request.Request(base + params, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                raw = json.loads(resp.read().decode())
                candles = []
                for b in raw:
                    ts_ms = int(b[0])
                    candles.append({
                        "timestamp": ts_ms,
                        "time": ts_ms // 1000,
                        "datetime": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        "open": float(b[1]),
                        "high": float(b[2]),
                        "low": float(b[3]),
                        "close": float(b[4]),
                        "volume": float(b[5]),
                        "quote_volume": float(b[7]),
                        "trades": int(b[8]),
                        "close_time": int(b[6])
                    })
                return candles
        except Exception as err:
            logger.debug(f"REST klines error on {base}: {err}")
            continue
    return []

binance_manager = BinanceManager()

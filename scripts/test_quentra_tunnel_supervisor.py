import importlib.util
import json
import os
import queue
import sys
import tempfile
import time
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("quentra_tunnel_supervisor.py")
SPEC = importlib.util.spec_from_file_location("quentra_tunnel_supervisor", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ExtractQuickTunnelUrlTests(unittest.TestCase):
    def test_extracts_url_from_cloudflared_json_message(self):
        line = json.dumps({
            "level": "info",
            "message": "Your quick Tunnel has been created! Visit it at https://quiet-example.trycloudflare.com",
        })

        self.assertEqual(
            MODULE.extract_quick_tunnel_url(line),
            "https://quiet-example.trycloudflare.com",
        )

    def test_ignores_non_tunnel_log_lines(self):
        line = json.dumps({"level": "info", "message": "Registered tunnel connection"})

        self.assertIsNone(MODULE.extract_quick_tunnel_url(line))

    def test_log_pump_retains_only_one_tunnel_url_and_drains_the_rest(self):
        tunnel_url = "https://bounded-example.trycloudflare.com"
        lines = [
            json.dumps({"level": "info", "message": f"routine log {index}"}) + "\n"
            for index in range(200)
        ]
        for index in (25, 100, 175):
            lines.insert(index, json.dumps({"level": "info", "message": tunnel_url}) + "\n")

        class FakeProcess:
            stdout = lines

        discovered_urls = queue.Queue(maxsize=1)
        MODULE.pump_cloudflared_logs(FakeProcess(), discovered_urls)

        self.assertEqual(discovered_urls.qsize(), 1)
        self.assertEqual(discovered_urls.get_nowait(), tunnel_url)


class EndpointHealthTests(unittest.TestCase):
    NOW_MS = 1_792_070_400_000

    def healthy_status_payload(self):
        return {
            "status": "ONLINE",
            "signals_available": True,
            "live_signal_engine": "AUTONOMOUS_ONLINE",
            "binance_ws_connected": True,
            "ticker_status": "LIVE",
            "ticker_last_event_ms": {
                "BTCUSDT": self.NOW_MS - 1_000,
                "ETHUSDT": self.NOW_MS - 1_500,
            },
            "kline_ws_connected": True,
            "kline_last_event_ms": {
                "BTCUSDT": {
                    "30m": self.NOW_MS - 900,
                    "1h": self.NOW_MS - 900,
                    "4h": self.NOW_MS - 900,
                    "1d": self.NOW_MS - 900,
                    "1w": self.NOW_MS - 900,
                },
                "ETHUSDT": {
                    "30m": self.NOW_MS - 1_200,
                    "1h": self.NOW_MS - 1_200,
                    "4h": self.NOW_MS - 1_200,
                    "1d": self.NOW_MS - 1_200,
                    "1w": self.NOW_MS - 1_200,
                },
            },
            "signal_engine_last_update_ms": {
                "BTCUSDT": self.NOW_MS - 1_000,
                "ETHUSDT": self.NOW_MS - 1_500,
            },
            "signal_engine_last_closed_update_ms": {
                "BTCUSDT": self.NOW_MS - 60_000,
                "ETHUSDT": self.NOW_MS - 60_000,
            },
            "signal_engine_last_closed_update_ms_by_timeframe": {
                "BTCUSDT": {
                    "30m": self.NOW_MS - 60_000,
                    "1h": self.NOW_MS - 60_000,
                    "4h": self.NOW_MS - 60_000,
                    "1d": self.NOW_MS - 60_000,
                    "1w": self.NOW_MS - 60_000,
                },
                "ETHUSDT": {
                    "30m": self.NOW_MS - 60_000,
                    "1h": self.NOW_MS - 60_000,
                    "4h": self.NOW_MS - 60_000,
                    "1d": self.NOW_MS - 60_000,
                    "1w": self.NOW_MS - 60_000,
                },
            },
            "tickers": {
                "BTCUSDT": {
                    "price": 80_500.0,
                    "timestamp": self.NOW_MS - 1_000,
                    "status": "LIVE",
                },
                "ETHUSDT": {
                    "price": 2_350.0,
                    "timestamp": self.NOW_MS - 1_500,
                    "status": "LIVE",
                },
            },
        }

    def test_status_payload_requires_live_event_heartbeats(self):
        self.assertTrue(MODULE.status_payload_is_healthy(
            self.healthy_status_payload(),
            now_ms=self.NOW_MS,
        ))

    def test_status_payload_rejects_offline_signals(self):
        payload = self.healthy_status_payload()
        payload["signals_available"] = False

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_disconnected_market_feed(self):
        payload = self.healthy_status_payload()
        payload["binance_ws_connected"] = False

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_cached_price_with_no_real_ticker_event(self):
        payload = self.healthy_status_payload()
        payload["ticker_last_event_ms"]["BTCUSDT"] = 0

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_stale_kline_stream(self):
        payload = self.healthy_status_payload()
        payload["kline_last_event_ms"]["BTCUSDT"]["30m"] = self.NOW_MS - 600_000

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_stale_higher_timeframe_stream(self):
        payload = self.healthy_status_payload()
        payload["kline_last_event_ms"]["BTCUSDT"]["4h"] = self.NOW_MS - 600_000

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_stale_higher_timeframe_engine(self):
        payload = self.healthy_status_payload()
        payload["signal_engine_last_closed_update_ms_by_timeframe"]["BTCUSDT"]["4h"] = self.NOW_MS - 20_000_000

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_stalled_signal_engine(self):
        payload = self.healthy_status_payload()
        payload["signal_engine_last_update_ms"]["BTCUSDT"] = self.NOW_MS - 600_000

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_status_payload_rejects_stalled_closed_candle_engine(self):
        payload = self.healthy_status_payload()
        payload["signal_engine_last_closed_update_ms"]["BTCUSDT"] = self.NOW_MS - 3_600_000

        self.assertFalse(MODULE.status_payload_is_healthy(payload, now_ms=self.NOW_MS))

    def test_live_signal_payload_requires_fresh_engine_heartbeat(self):
        self.assertTrue(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 80_500.0,
                "timestamp": self.NOW_MS - 500,
                "engine_last_update_ms": self.NOW_MS - 1_000,
                "engine_last_closed_update_ms": self.NOW_MS - 60_000,
                "strategies": [{
                    "strategy_id": "pippo-30m-new-gen",
                    "current_price": 80_500.0,
                }],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=self.NOW_MS - 1_000,
            expected_closed_engine_update_ms=self.NOW_MS - 60_000,
            now_ms=self.NOW_MS,
        ))

    def test_live_signal_payload_rejects_stale_higher_timeframe_engine(self):
        expected_by_timeframe = {
            timeframe: self.NOW_MS - 60_000
            for timeframe in MODULE.KLINE_TIMEFRAMES
        }
        actual_by_timeframe = dict(expected_by_timeframe)
        actual_by_timeframe["4h"] = self.NOW_MS - 20_000_000
        self.assertFalse(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 80_500.0,
                "timestamp": self.NOW_MS,
                "engine_last_update_ms": self.NOW_MS,
                "engine_last_closed_update_ms": self.NOW_MS - 60_000,
                "engine_last_closed_update_ms_by_timeframe": actual_by_timeframe,
                "strategies": [{
                    "strategy_id": "pippo-30m-new-gen",
                    "current_price": 80_500.0,
                }],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=self.NOW_MS,
            expected_closed_engine_update_ms=self.NOW_MS - 60_000,
            expected_closed_engine_updates_by_timeframe=expected_by_timeframe,
            now_ms=self.NOW_MS,
        ))

    def test_live_signal_payload_rejects_empty_strategy_catalog(self):
        self.assertFalse(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 80_500.0,
                "timestamp": self.NOW_MS,
                "engine_last_update_ms": self.NOW_MS,
                "engine_last_closed_update_ms": self.NOW_MS - 60_000,
                "strategies": [],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=self.NOW_MS,
            expected_closed_engine_update_ms=self.NOW_MS - 60_000,
            now_ms=self.NOW_MS,
        ))

    def test_live_signal_payload_rejects_engine_price_divergence(self):
        self.assertFalse(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 77_379.6,
                "timestamp": self.NOW_MS,
                "engine_last_update_ms": self.NOW_MS,
                "engine_last_closed_update_ms": self.NOW_MS - 60_000,
                "strategies": [{"strategy_id": "pippo-30m-new-gen"}],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=self.NOW_MS,
            expected_closed_engine_update_ms=self.NOW_MS - 60_000,
            now_ms=self.NOW_MS,
        ))

    def test_live_signal_payload_rejects_stale_engine_heartbeat(self):
        stale_update = self.NOW_MS - 600_000
        self.assertFalse(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 80_500.0,
                "timestamp": self.NOW_MS,
                "engine_last_update_ms": stale_update,
                "engine_last_closed_update_ms": self.NOW_MS - 60_000,
                "strategies": [{
                    "strategy_id": "pippo-30m-new-gen",
                    "current_price": 80_500.0,
                }],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=stale_update,
            expected_closed_engine_update_ms=self.NOW_MS - 60_000,
            now_ms=self.NOW_MS,
        ))

    def test_live_signal_payload_rejects_stale_closed_candle_engine(self):
        stale_update = self.NOW_MS - 3_600_000
        self.assertFalse(MODULE.live_signal_payload_is_healthy(
            {
                "status": "AUTONOMOUS_ENGINE_LIVE",
                "symbol": "BTCUSDT",
                "current_price": 80_500.0,
                "timestamp": self.NOW_MS,
                "engine_last_update_ms": self.NOW_MS,
                "engine_last_closed_update_ms": stale_update,
                "strategies": [{
                    "strategy_id": "pippo-30m-new-gen",
                    "current_price": 80_500.0,
                }],
            },
            expected_symbol="BTCUSDT",
            expected_price=80_500.0,
            expected_engine_update_ms=self.NOW_MS,
            expected_closed_engine_update_ms=stale_update,
            now_ms=self.NOW_MS,
        ))

    def test_kline_payload_requires_the_current_30m_bucket(self):
        now_seconds = self.NOW_MS // 1000
        current_bar = now_seconds - (now_seconds % 1800)
        payload = {
            "symbol": "BTCUSDT",
            "timeframe": "30m",
            "data_source": "local_parquet_live_cache",
            "count": 2,
            "last_candle_time": current_bar,
            "candles": [
                {"time": current_bar - 1800, "close": 80_450.0},
                {"time": current_bar, "close": 80_500.0},
            ],
        }

        self.assertTrue(MODULE.kline_payload_is_healthy(payload, now_seconds=now_seconds))

    def test_kline_payload_rejects_previous_bucket_after_rollover(self):
        current_bucket = (self.NOW_MS // 1000) - ((self.NOW_MS // 1000) % 1800)
        now_seconds = current_bucket + 60
        previous_bucket = current_bucket - 1800
        payload = {
            "symbol": "BTCUSDT",
            "timeframe": "30m",
            "data_source": "local_parquet_live_cache",
            "count": 2,
            "last_candle_time": previous_bucket,
            "candles": [
                {"time": previous_bucket - 1800, "close": 80_450.0},
                {"time": previous_bucket, "close": 80_500.0},
            ],
        }

        self.assertFalse(MODULE.kline_payload_is_healthy(payload, now_seconds=now_seconds))


class ManagedCommandTests(unittest.TestCase):
    def test_success_terminates_detached_descendant_process_group(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            child_pid_path = Path(temp_dir) / "child.pid"
            script = (
                "import pathlib,subprocess,sys;"
                f"p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL);"
                f"pathlib.Path({str(child_pid_path)!r}).write_text(str(p.pid))"
            )

            returncode, timed_out = MODULE.run_managed_command(
                [sys.executable, "-c", script],
                input_text="",
                timeout_seconds=5,
                cwd=Path(temp_dir),
                env=os.environ.copy(),
            )

            self.assertEqual(returncode, 0)
            self.assertFalse(timed_out)
            child_pid = int(child_pid_path.read_text())
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and Path(f"/proc/{child_pid}/stat").exists():
                state = Path(f"/proc/{child_pid}/stat").read_text().split()[2]
                if state == "Z":
                    break
                time.sleep(0.05)
            if Path(f"/proc/{child_pid}/stat").exists():
                self.assertEqual(Path(f"/proc/{child_pid}/stat").read_text().split()[2], "Z")

    def test_timeout_terminates_the_full_descendant_process_group(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            child_pid_path = Path(temp_dir) / "child.pid"
            script = (
                "import pathlib,subprocess,sys,time;"
                f"p=subprocess.Popen([sys.executable,'-c','import time; time.sleep(60)']);"
                f"pathlib.Path({str(child_pid_path)!r}).write_text(str(p.pid));"
                "time.sleep(60)"
            )

            returncode, timed_out = MODULE.run_managed_command(
                [sys.executable, "-c", script],
                input_text="",
                timeout_seconds=0.5,
                cwd=Path(temp_dir),
                env=os.environ.copy(),
            )

            self.assertTrue(timed_out)
            self.assertNotEqual(returncode, 0)
            self.assertTrue(child_pid_path.exists())
            child_pid = int(child_pid_path.read_text())
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline and Path(f"/proc/{child_pid}/stat").exists():
                state = Path(f"/proc/{child_pid}/stat").read_text().split()[2]
                if state == "Z":
                    break
                time.sleep(0.05)
            if Path(f"/proc/{child_pid}/stat").exists():
                self.assertEqual(Path(f"/proc/{child_pid}/stat").read_text().split()[2], "Z")


if __name__ == "__main__":
    unittest.main()

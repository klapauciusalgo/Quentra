#!/usr/bin/env python3
"""Keep the Quentra backend reachable through a self-healing Quick Tunnel.

The supervisor owns only the cloudflared child process it creates. Whenever a
new ephemeral hostname is issued it updates the Cloudflare Worker BACKEND_URL
secret, verifies the public API, and restarts the tunnel after repeated public
health failures.
"""

from __future__ import annotations

import json
import math
import os
import queue
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_DIR = Path(
    os.environ.get("QUENTRA_PROJECT_DIR", Path(__file__).resolve().parents[1])
).resolve()
LOCAL_ORIGIN = os.environ.get("QUENTRA_LOCAL_ORIGIN", "http://127.0.0.1:8080").rstrip("/")
PRODUCTION_ORIGIN = os.environ.get(
    "QUENTRA_PRODUCTION_ORIGIN", "https://quentra.klapauciusalgo.workers.dev"
).rstrip("/")
CHECK_INTERVAL_SECONDS = int(os.environ.get("QUENTRA_TUNNEL_CHECK_INTERVAL", "30"))
FAILURE_THRESHOLD = int(os.environ.get("QUENTRA_TUNNEL_FAILURE_THRESHOLD", "3"))
STARTUP_TIMEOUT_SECONDS = int(os.environ.get("QUENTRA_TUNNEL_STARTUP_TIMEOUT", "120"))
LOCAL_READY_TIMEOUT_SECONDS = int(os.environ.get("QUENTRA_LOCAL_READY_TIMEOUT", "300"))
HTTP_TIMEOUT_SECONDS = int(os.environ.get("QUENTRA_HTTP_TIMEOUT", "15"))
WRANGLER_PACKAGE = os.environ.get("QUENTRA_WRANGLER_PACKAGE", "wrangler@4.151.0")
TUNNEL_URL_PATTERN = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.IGNORECASE)
MAX_TICK_AGE_MS = int(os.environ.get("QUENTRA_MAX_TICK_AGE_MS", "180000"))
MAX_CLOSED_ENGINE_AGE_MS = int(os.environ.get("QUENTRA_MAX_CLOSED_ENGINE_AGE_MS", "2100000"))
KLINE_TIMEFRAMES = ("30m", "1h", "4h", "1d", "1w")
KLINE_INTERVAL_MS = {
    "30m": 30 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
}
MAX_CLOSED_ENGINE_AGE_MS_BY_TIMEFRAME = {
    timeframe: max(MAX_CLOSED_ENGINE_AGE_MS, interval_ms + 5 * 60 * 1000)
    for timeframe, interval_ms in KLINE_INTERVAL_MS.items()
}
MAX_FUTURE_SKEW_MS = 30_000
MAX_ENGINE_PRICE_DRIFT = 0.01

_STOP_REQUESTED = threading.Event()


def log(message: str) -> None:
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print(f"{timestamp} {message}", flush=True)


def extract_quick_tunnel_url(line: str) -> str | None:
    """Extract the generated Quick Tunnel URL from JSON or plain logs."""
    candidates = [line]
    try:
        payload = json.loads(line)
    except (json.JSONDecodeError, TypeError):
        payload = None
    if isinstance(payload, dict):
        candidates.extend(str(value) for value in payload.values() if isinstance(value, str))
    for candidate in candidates:
        match = TUNNEL_URL_PATTERN.search(candidate)
        if match:
            return match.group(0).lower()
    return None


def finite_positive(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def price_matches(value: Any, expected_price: Any) -> bool:
    if not finite_positive(value) or not finite_positive(expected_price):
        return False
    return abs(float(value) - float(expected_price)) / float(expected_price) <= MAX_ENGINE_PRICE_DRIFT


def timestamp_is_fresh(timestamp_ms: Any, now_ms: int, max_age_ms: int = MAX_TICK_AGE_MS) -> bool:
    if not isinstance(timestamp_ms, (int, float)) or isinstance(timestamp_ms, bool):
        return False
    age_ms = now_ms - int(timestamp_ms)
    return -MAX_FUTURE_SKEW_MS <= age_ms <= max_age_ms


def status_payload_is_healthy(payload: Any, *, now_ms: int | None = None) -> bool:
    if not isinstance(payload, dict):
        return False
    if not (
        payload.get("status") == "ONLINE"
        and payload.get("signals_available") is True
        and payload.get("live_signal_engine") == "AUTONOMOUS_ONLINE"
        and payload.get("binance_ws_connected") is True
        and payload.get("kline_ws_connected") is True
        and payload.get("ticker_status") == "LIVE"
    ):
        return False

    checked_at_ms = int(time.time() * 1000) if now_ms is None else now_ms
    tickers = payload.get("tickers")
    ticker_events = payload.get("ticker_last_event_ms")
    kline_events = payload.get("kline_last_event_ms")
    engine_events = payload.get("signal_engine_last_update_ms")
    closed_engine_events = payload.get("signal_engine_last_closed_update_ms")
    closed_engine_events_by_timeframe = payload.get("signal_engine_last_closed_update_ms_by_timeframe")
    if not isinstance(tickers, dict):
        return False
    if not isinstance(ticker_events, dict):
        return False
    if not isinstance(kline_events, dict):
        return False
    if not isinstance(engine_events, dict):
        return False
    if not isinstance(closed_engine_events, dict):
        return False
    if not isinstance(closed_engine_events_by_timeframe, dict):
        return False
    for symbol in ("BTCUSDT", "ETHUSDT"):
        ticker = tickers.get(symbol)
        if not isinstance(ticker, dict):
            return False
        if ticker.get("status") != "LIVE" or not finite_positive(ticker.get("price")):
            return False
        if not timestamp_is_fresh(ticker.get("timestamp"), checked_at_ms):
            return False
        if not timestamp_is_fresh(ticker_events.get(symbol), checked_at_ms):
            return False
        symbol_kline_events = kline_events.get(symbol)
        if not isinstance(symbol_kline_events, dict):
            return False
        symbol_closed_engine_events_by_timeframe = closed_engine_events_by_timeframe.get(symbol)
        if not isinstance(symbol_closed_engine_events_by_timeframe, dict):
            return False
        for timeframe in KLINE_TIMEFRAMES:
            if not timestamp_is_fresh(symbol_kline_events.get(timeframe), checked_at_ms):
                return False
            if not timestamp_is_fresh(
                symbol_closed_engine_events_by_timeframe.get(timeframe),
                checked_at_ms,
                max_age_ms=MAX_CLOSED_ENGINE_AGE_MS_BY_TIMEFRAME[timeframe],
            ):
                return False
        if not timestamp_is_fresh(engine_events.get(symbol), checked_at_ms):
            return False
        if not timestamp_is_fresh(
            closed_engine_events.get(symbol),
            checked_at_ms,
            max_age_ms=MAX_CLOSED_ENGINE_AGE_MS,
        ):
            return False
    return True


def live_signal_payload_is_healthy(
    payload: Any,
    *,
    expected_symbol: str,
    expected_price: float,
    expected_engine_update_ms: int,
    expected_closed_engine_update_ms: int,
    expected_closed_engine_updates_by_timeframe: dict[str, Any] | None = None,
    now_ms: int | None = None,
) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("status") != "AUTONOMOUS_ENGINE_LIVE" or payload.get("symbol") != expected_symbol:
        return False
    checked_at_ms = int(time.time() * 1000) if now_ms is None else now_ms
    current_price = payload.get("current_price")
    if not price_matches(current_price, expected_price):
        return False
    if not timestamp_is_fresh(payload.get("timestamp"), checked_at_ms):
        return False
    engine_update_ms = payload.get("engine_last_update_ms")
    if not timestamp_is_fresh(engine_update_ms, checked_at_ms):
        return False
    if not isinstance(engine_update_ms, (int, float)) or int(engine_update_ms) < int(expected_engine_update_ms):
        return False
    closed_engine_update_ms = payload.get("engine_last_closed_update_ms")
    if not timestamp_is_fresh(
        closed_engine_update_ms,
        checked_at_ms,
        max_age_ms=MAX_CLOSED_ENGINE_AGE_MS,
    ):
        return False
    if (
        not isinstance(closed_engine_update_ms, (int, float))
        or int(closed_engine_update_ms) < int(expected_closed_engine_update_ms)
    ):
        return False
    if expected_closed_engine_updates_by_timeframe is not None:
        actual_closed_engine_updates_by_timeframe = payload.get("engine_last_closed_update_ms_by_timeframe")
        if not isinstance(actual_closed_engine_updates_by_timeframe, dict):
            return False
        if set(expected_closed_engine_updates_by_timeframe) != set(KLINE_TIMEFRAMES):
            return False
        for timeframe in KLINE_TIMEFRAMES:
            actual_update_ms = actual_closed_engine_updates_by_timeframe.get(timeframe)
            expected_update_ms = expected_closed_engine_updates_by_timeframe.get(timeframe)
            if not timestamp_is_fresh(
                actual_update_ms,
                checked_at_ms,
                max_age_ms=MAX_CLOSED_ENGINE_AGE_MS_BY_TIMEFRAME[timeframe],
            ):
                return False
            if (
                not isinstance(actual_update_ms, (int, float))
                or not isinstance(expected_update_ms, (int, float))
                or int(actual_update_ms) < int(expected_update_ms)
            ):
                return False

    strategies = payload.get("strategies")
    if not isinstance(strategies, list) or not strategies:
        return False
    return any(
        isinstance(strategy, dict)
        and strategy.get("strategy_id")
        and price_matches(strategy.get("current_price"), expected_price)
        for strategy in strategies
    )


def kline_payload_is_healthy(payload: Any, *, now_seconds: int | None = None) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("symbol") != "BTCUSDT" or payload.get("timeframe") != "30m":
        return False
    if not str(payload.get("data_source", "")).startswith("local_parquet"):
        return False
    candles = payload.get("candles")
    if not isinstance(candles, list) or len(candles) < 2 or payload.get("count", 0) < 2:
        return False
    latest = candles[-1]
    if not isinstance(latest, dict) or not finite_positive(latest.get("close")):
        return False
    latest_time = latest.get("time")
    if not isinstance(latest_time, (int, float)) or isinstance(latest_time, bool):
        return False
    if int(payload.get("last_candle_time", -1)) != int(latest_time):
        return False
    checked_at_seconds = int(time.time()) if now_seconds is None else now_seconds
    current_bucket = checked_at_seconds - (checked_at_seconds % 1800)
    return int(latest_time) == current_bucket


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "QuentraTunnelSupervisor/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        content_type = response.headers.get("content-type", "")
        if "json" not in content_type.lower():
            raise RuntimeError(f"unexpected content type: {content_type}")
        return json.load(response)


def origin_is_healthy(base_url: str) -> bool:
    try:
        now_ms = int(time.time() * 1000)
        status_payload = fetch_json(f"{base_url}/api/status")
        if not status_payload_is_healthy(status_payload, now_ms=now_ms):
            return False
        expected_price = float(status_payload["tickers"]["BTCUSDT"]["price"])
        expected_engine_update_ms = int(status_payload["signal_engine_last_update_ms"]["BTCUSDT"])
        expected_closed_engine_update_ms = int(
            status_payload["signal_engine_last_closed_update_ms"]["BTCUSDT"]
        )
        expected_closed_engine_updates_by_timeframe = status_payload[
            "signal_engine_last_closed_update_ms_by_timeframe"
        ]["BTCUSDT"]
        live_payload = fetch_json(f"{base_url}/api/signals/live?symbol=BTCUSDT")
        if not live_signal_payload_is_healthy(
            live_payload,
            expected_symbol="BTCUSDT",
            expected_price=expected_price,
            expected_engine_update_ms=expected_engine_update_ms,
            expected_closed_engine_update_ms=expected_closed_engine_update_ms,
            expected_closed_engine_updates_by_timeframe=expected_closed_engine_updates_by_timeframe,
            now_ms=int(time.time() * 1000),
        ):
            return False
        kline_payload = fetch_json(f"{base_url}/api/klines?symbol=BTCUSDT&timeframe=30m&limit=2")
        return kline_payload_is_healthy(kline_payload, now_seconds=int(time.time()))
    except (KeyError, OSError, TypeError, ValueError, RuntimeError, urllib.error.URLError):
        return False


def wait_until_healthy(base_url: str, timeout_seconds: int) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while not _STOP_REQUESTED.is_set() and time.monotonic() < deadline:
        if origin_is_healthy(base_url):
            return True
        _STOP_REQUESTED.wait(2)
    return False


def resolve_executable(name: str, fallback: str) -> str:
    return shutil.which(name) or fallback


def start_cloudflared() -> subprocess.Popen[str]:
    executable = resolve_executable("cloudflared", "/home/ubuntu/.local/bin/cloudflared")
    command = [
        executable,
        "tunnel",
        "--no-autoupdate",
        "--url",
        LOCAL_ORIGIN,
        "--output",
        "json",
    ]
    return subprocess.Popen(
        command,
        cwd=PROJECT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )


def pump_cloudflared_logs(process: subprocess.Popen[str], discovered_urls: queue.Queue[str]) -> None:
    if process.stdout is None:
        return
    for raw_line in process.stdout:
        line = raw_line.rstrip("\n")
        tunnel_url = extract_quick_tunnel_url(line)
        if tunnel_url:
            try:
                discovered_urls.put_nowait(tunnel_url)
            except queue.Full:
                pass
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            payload = None
        if isinstance(payload, dict) and payload.get("level") in {"error", "warning"}:
            message = str(payload.get("message", "cloudflared warning"))[:500]
            log(f"cloudflared {payload.get('level')}: {message}")


def wait_for_tunnel_url(process: subprocess.Popen[str], discovered_urls: queue.Queue[str]) -> str | None:
    deadline = time.monotonic() + STARTUP_TIMEOUT_SECONDS
    while not _STOP_REQUESTED.is_set() and time.monotonic() < deadline:
        if process.poll() is not None:
            return None
        try:
            return discovered_urls.get(timeout=1)
        except queue.Empty:
            continue
    return None


def kill_process_group(process: subprocess.Popen[str], *, wait_timeout: float = 5) -> None:
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait(timeout=wait_timeout)


def terminate_process_group(
    process: subprocess.Popen[str],
    *,
    terminate_timeout: float = 15,
    kill_timeout: float = 5,
) -> None:
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        process.wait(timeout=kill_timeout)
        return
    try:
        process.wait(timeout=terminate_timeout)
    except subprocess.TimeoutExpired:
        pass
    kill_process_group(process, wait_timeout=kill_timeout)


def run_managed_command(
    command: list[str],
    *,
    input_text: str,
    timeout_seconds: float,
    cwd: Path,
    env: dict[str, str],
) -> tuple[int, bool]:
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
        start_new_session=True,
        env=env,
    )
    try:
        try:
            process.communicate(input=input_text, timeout=timeout_seconds)
            return int(process.returncode or 0), False
        except subprocess.TimeoutExpired:
            kill_process_group(process)
            try:
                process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                pass
            return int(process.returncode if process.returncode is not None else -signal.SIGKILL), True
    finally:
        try:
            terminate_process_group(process)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            pass


def update_worker_backend(tunnel_url: str) -> bool:
    npx = resolve_executable("npx", "/home/ubuntu/.local/bin/npx")
    command = [
        npx,
        "--yes",
        WRANGLER_PACKAGE,
        "secret",
        "put",
        "BACKEND_URL",
        "--config",
        str(PROJECT_DIR / "wrangler.toml"),
    ]
    try:
        returncode, timed_out = run_managed_command(
            command,
            input_text=f"{tunnel_url}\n",
            timeout_seconds=240,
            cwd=PROJECT_DIR,
            env={
                "HOME": "/home/ubuntu",
                "PATH": os.environ.get("PATH", "/home/ubuntu/.local/bin:/usr/local/bin:/usr/bin:/bin"),
                "LANG": "C.UTF-8",
                "LC_ALL": "C.UTF-8",
                "NO_UPDATE_NOTIFIER": "1",
                "NPM_CONFIG_CACHE": "/home/ubuntu/.npm",
            },
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        log(f"Worker secret update failed: {type(error).__name__}")
        return False
    if timed_out:
        log("Worker secret update timed out; terminated its process group")
        return False
    if returncode != 0:
        log(f"Worker secret update failed with exit {returncode}")
        return False
    log("Worker BACKEND_URL updated for the new tunnel")
    return True


def stop_child(process: subprocess.Popen[str] | None) -> None:
    if process is None:
        return
    try:
        terminate_process_group(process)
    except subprocess.TimeoutExpired:
        log("cloudflared could not be reaped after SIGKILL")


def handle_stop_signal(signum: int, _frame: Any) -> None:
    log(f"Received signal {signum}; shutting down")
    _STOP_REQUESTED.set()


def run() -> int:
    signal.signal(signal.SIGTERM, handle_stop_signal)
    signal.signal(signal.SIGINT, handle_stop_signal)

    log("Waiting for the local Quentra backend")
    if not wait_until_healthy(LOCAL_ORIGIN, LOCAL_READY_TIMEOUT_SECONDS):
        log("Local Quentra backend did not become healthy before timeout")
        return 1

    process: subprocess.Popen[str] | None = None
    log_thread: threading.Thread | None = None
    try:
        process = start_cloudflared()
        discovered_urls: queue.Queue[str] = queue.Queue(maxsize=1)
        log_thread = threading.Thread(
            target=pump_cloudflared_logs,
            args=(process, discovered_urls),
            name="cloudflared-log-pump",
            daemon=True,
        )
        log_thread.start()

        tunnel_url = wait_for_tunnel_url(process, discovered_urls)
        if not tunnel_url:
            log("cloudflared did not issue a Quick Tunnel URL")
            return 1
        log("Quick Tunnel hostname issued; waiting for origin readiness")

        if not wait_until_healthy(tunnel_url, STARTUP_TIMEOUT_SECONDS):
            log("Quick Tunnel did not become healthy before timeout")
            return 1
        if not update_worker_backend(tunnel_url):
            return 1
        if not wait_until_healthy(PRODUCTION_ORIGIN, STARTUP_TIMEOUT_SECONDS):
            log("Production Worker did not become healthy after backend update")
            return 1

        log("Production signal API is live; entering continuous supervision")
        consecutive_failures = 0
        while not _STOP_REQUESTED.wait(CHECK_INTERVAL_SECONDS):
            if process.poll() is not None:
                log(f"cloudflared exited with code {process.returncode}")
                return 1
            local_healthy = origin_is_healthy(LOCAL_ORIGIN)
            tunnel_healthy = origin_is_healthy(tunnel_url)
            production_healthy = origin_is_healthy(PRODUCTION_ORIGIN)

            if not local_healthy:
                consecutive_failures = 0
                log("Local backend is unhealthy; waiting for quentra.service recovery")
                continue
            if tunnel_healthy and production_healthy:
                if consecutive_failures:
                    log("Public signal path recovered")
                consecutive_failures = 0
                continue

            consecutive_failures += 1
            log(
                "Public signal health failure "
                f"{consecutive_failures}/{FAILURE_THRESHOLD} "
                f"(tunnel={tunnel_healthy}, production={production_healthy})"
            )
            if consecutive_failures >= FAILURE_THRESHOLD:
                log("Failure threshold reached; rotating the Quick Tunnel")
                return 1
        return 0
    finally:
        stop_child(process)
        if log_thread is not None:
            log_thread.join(timeout=5)


if __name__ == "__main__":
    sys.exit(run())

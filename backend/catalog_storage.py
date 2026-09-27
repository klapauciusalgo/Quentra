"""Resolve immutable strategy catalogs and mutable runtime overlays."""

from __future__ import annotations

import fcntl
import json
import os
import shutil
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


_CATALOG_FILES = {
    "BTCUSDT": "strategies.json",
    "ETHUSDT": "strategies_eth.json",
}


def _repo_root(repo_root: str | os.PathLike[str] | None = None) -> Path:
    if repo_root is not None:
        return Path(repo_root).resolve()
    return Path(__file__).resolve().parents[1]


def _catalog_filename(symbol: str) -> str:
    return _CATALOG_FILES.get(str(symbol).upper(), "strategies.json")


def source_catalog_path(symbol: str, repo_root: str | os.PathLike[str] | None = None) -> Path:
    return _repo_root(repo_root) / "backend" / "data" / _catalog_filename(symbol)


def runtime_catalog_path(symbol: str, repo_root: str | os.PathLike[str] | None = None) -> Path:
    return _repo_root(repo_root) / "backend" / "runtime" / "catalogs" / _catalog_filename(symbol)


def effective_catalog_path(symbol: str, repo_root: str | os.PathLike[str] | None = None) -> Path:
    """Return the runtime overlay when present, otherwise the static catalog."""
    runtime = runtime_catalog_path(symbol, repo_root)
    return runtime if runtime.exists() else source_catalog_path(symbol, repo_root)


def _is_open_trade(trade: dict) -> bool:
    status = str(trade.get("status", "")).upper()
    return status in {"OPEN", "RUNNING"} or trade.get("exit_time") == "RUNNING"


def _is_live_marker(marker: dict) -> bool:
    return (
        marker.get("isActive") is True
        or marker.get("isBreakeven") is True
        or str(marker.get("status", "")).upper() == "OPEN"
        or str(marker.get("text", "")).strip().upper().startswith("ACTIVE")
    )


def _runtime_lock_path(path: Path) -> Path:
    return path.with_name(f".{path.name}.lock")


def _write_json_unlocked(path: Path, payload: object) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w") as temp_file:
            json.dump(payload, temp_file, indent=2)
            temp_file.flush()
            os.fsync(temp_file.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


def atomic_json_write(path: Path, payload: object) -> None:
    lock_path = _runtime_lock_path(path)
    with lock_path.open("a+") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            _write_json_unlocked(path, payload)
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


@contextmanager
def locked_json_catalog(path: str | os.PathLike[str]) -> Iterator[list[dict[str, Any]]]:
    """Hold the runtime lock across a read-modify-write catalog transaction."""
    catalog_path = Path(path)
    lock_path = _runtime_lock_path(catalog_path)
    with lock_path.open("a+") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            with catalog_path.open("r") as handle:
                catalog = json.load(handle)
            yield catalog
            _write_json_unlocked(catalog_path, catalog)
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def bootstrap_runtime_catalog(symbol: str, repo_root: str | os.PathLike[str] | None = None) -> Path:
    """Create a clean runtime overlay without reviving static open positions."""
    runtime = runtime_catalog_path(symbol, repo_root)
    if runtime.exists():
        return runtime
    runtime = ensure_runtime_catalog(symbol, repo_root)
    with runtime.open("r") as handle:
        catalog = json.load(handle)

    changed = False
    for strategy in catalog:
        original_trades = strategy.get("trades", [])
        original_markers = strategy.get("markers", [])
        clean_trades = [trade for trade in original_trades if not _is_open_trade(trade)]
        clean_markers = [marker for marker in original_markers if not _is_live_marker(marker)]
        if (
            clean_trades != original_trades
            or clean_markers != original_markers
            or strategy.get("has_active_signal") is not False
            or strategy.get("active_ticket") is not None
        ):
            changed = True
            strategy["trades"] = clean_trades
            strategy["markers"] = clean_markers
            strategy["has_active_signal"] = False
            strategy["active_ticket"] = None

    if changed:
        atomic_json_write(runtime, catalog)
    return runtime


def ensure_runtime_catalog(symbol: str, repo_root: str | os.PathLike[str] | None = None) -> Path:
    """Create a runtime overlay from the static catalog exactly once."""
    source = source_catalog_path(symbol, repo_root)
    runtime = runtime_catalog_path(symbol, repo_root)
    if runtime.exists():
        return runtime
    if not source.exists():
        raise FileNotFoundError(f"Static catalog not found: {source}")

    runtime.parent.mkdir(parents=True, exist_ok=True)
    lock_path = runtime.with_name(f".{runtime.name}.lock")
    with lock_path.open("a+") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        if runtime.exists():
            return runtime
        fd, temp_name = tempfile.mkstemp(prefix=f".{runtime.name}.", suffix=".tmp", dir=runtime.parent)
        temp_path = Path(temp_name)
        try:
            with os.fdopen(fd, "wb") as temp_file, source.open("rb") as source_file:
                shutil.copyfileobj(source_file, temp_file)
                temp_file.flush()
                os.fsync(temp_file.fileno())
            os.replace(temp_path, runtime)
        finally:
            if temp_path.exists():
                temp_path.unlink()
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    return runtime

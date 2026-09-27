import json
from pathlib import Path

from catalog_storage import (
    bootstrap_runtime_catalog,
    effective_catalog_path,
    ensure_runtime_catalog,
    runtime_catalog_path,
)


def _make_repo(tmp_path: Path) -> Path:
    data_dir = tmp_path / "backend" / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "strategies_eth.json").write_text(json.dumps([{"id": "eth-demo", "has_active_signal": False}]))
    (data_dir / "strategies.json").write_text(json.dumps([{"id": "btc-demo", "has_active_signal": False}]))
    return tmp_path


def test_runtime_catalog_is_created_from_source_without_touching_source(tmp_path):
    repo_root = _make_repo(tmp_path)
    source = repo_root / "backend" / "data" / "strategies_eth.json"
    original_source = source.read_bytes()

    assert effective_catalog_path("ETHUSDT", repo_root) == source

    runtime = ensure_runtime_catalog("ETHUSDT", repo_root)

    assert runtime == runtime_catalog_path("ETHUSDT", repo_root)
    assert runtime.exists()
    assert runtime.read_bytes() == original_source
    assert source.read_bytes() == original_source
    assert effective_catalog_path("ETHUSDT", repo_root) == runtime


def test_existing_runtime_catalog_is_authoritative_over_later_source_changes(tmp_path):
    repo_root = _make_repo(tmp_path)
    source = repo_root / "backend" / "data" / "strategies_eth.json"
    runtime = ensure_runtime_catalog("ETHUSDT", repo_root)

    runtime.write_text(json.dumps([{"id": "eth-demo", "has_active_signal": True}]))
    source.write_text(json.dumps([{"id": "eth-demo", "has_active_signal": False}, {"id": "new-static"}]))

    assert json.loads(effective_catalog_path("ETHUSDT", repo_root).read_text()) == [
        {"id": "eth-demo", "has_active_signal": True}
    ]


def test_bootstrap_removes_static_live_state_from_new_runtime_overlay(tmp_path):
    repo_root = _make_repo(tmp_path)
    source = json.loads((repo_root / "backend" / "data" / "strategies_eth.json").read_text())
    source[0].update({
        "has_active_signal": True,
        "active_ticket": {"entry_price": 100},
        "trades": [{"trade_no": 1, "status": "OPEN", "exit_time": "RUNNING"}],
        "markers": [
            {"isActive": True, "eventType": "entry"},
            {"isBreakeven": True, "eventType": "breakeven"},
            {"eventType": "exit", "text": "EXIT"},
        ],
    })
    (repo_root / "backend" / "data" / "strategies_eth.json").write_text(json.dumps(source))

    runtime = bootstrap_runtime_catalog("ETHUSDT", repo_root)
    result = json.loads(runtime.read_text())[0]

    assert result["has_active_signal"] is False
    assert result["active_ticket"] is None
    assert result["trades"] == []
    assert result["markers"] == [{"eventType": "exit", "text": "EXIT"}]


def test_bootstrap_keeps_existing_runtime_state(tmp_path):
    repo_root = _make_repo(tmp_path)
    runtime = ensure_runtime_catalog("ETHUSDT", repo_root)
    persisted = [{"id": "eth-demo", "has_active_signal": True, "trades": [{"status": "OPEN"}]}]
    runtime.write_text(json.dumps(persisted))

    result = json.loads(bootstrap_runtime_catalog("ETHUSDT", repo_root).read_text())

    assert result == persisted


def test_runtime_catalogs_are_asset_specific(tmp_path):
    repo_root = _make_repo(tmp_path)

    eth_runtime = ensure_runtime_catalog("ETHUSDT", repo_root)
    btc_runtime = ensure_runtime_catalog("BTCUSDT", repo_root)

    assert eth_runtime != btc_runtime
    assert eth_runtime.name == "strategies_eth.json"
    assert btc_runtime.name == "strategies.json"

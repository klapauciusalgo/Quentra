import sys
import os
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import main
from live_signal_engine import LiveSignalEngine, StrategyModel, live_signal_engine

REPO_ROOT = Path(__file__).resolve().parents[1]

@pytest.fixture(scope="module")
def client(tmp_path_factory):
    import live_signal_engine as engine_module
    from catalog_storage import ensure_runtime_catalog, runtime_catalog_path

    fixture_root = tmp_path_factory.mktemp("live-runtime")
    fixture_data = fixture_root / "backend" / "data"
    fixture_data.mkdir(parents=True)
    for filename in ("strategies.json", "strategies_eth.json"):
        source = REPO_ROOT / "backend" / "data" / filename
        (fixture_data / filename).write_bytes(source.read_bytes())
    ensure_runtime_catalog("BTCUSDT", fixture_root)
    ensure_runtime_catalog("ETHUSDT", fixture_root)
    runtime_paths = {
        "BTCUSDT": runtime_catalog_path("BTCUSDT", fixture_root),
        "ETHUSDT": runtime_catalog_path("ETHUSDT", fixture_root),
    }

    patcher = pytest.MonkeyPatch()
    patcher.setattr(main, "effective_catalog_path", lambda symbol: runtime_paths[symbol.upper()])
    patcher.setattr(main, "reload_local_catalog", lambda *_args: None)
    patcher.setattr(engine_module, "__file__", str(fixture_root / "backend" / "live_signal_engine.py"))
    try:
        main.load_data_into_memory()
        with TestClient(main.app) as c:
            yield c
    finally:
        patcher.undo()

def test_reload_local_catalog_uses_effective_runtime_path(tmp_path, monkeypatch):
    runtime = tmp_path / "strategies.json"
    runtime_catalog = [{"id": "runtime-only", "name": "Runtime Strategy"}]
    runtime.write_text(json.dumps(runtime_catalog))
    previous_catalog = main.STRATEGIES_CATALOG
    previous_map = main.STRATEGIES_MAP
    monkeypatch.setattr(main, "effective_catalog_path", lambda symbol: runtime)

    try:
        main.reload_local_catalog("BTCUSDT")
        assert main.STRATEGIES_CATALOG == runtime_catalog
        assert main.STRATEGIES_MAP == {"runtime-only": runtime_catalog[0]}
    finally:
        main.STRATEGIES_CATALOG = previous_catalog
        main.STRATEGIES_MAP = previous_map


def test_system_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ONLINE"
    assert data["live_signal_engine"] == "AUTONOMOUS_ONLINE"
    assert data["macro_regime"] == "PROTECTED"
    assert "BULLISH EXPANSION" not in data["macro_regime"]
    assert data["strategies_count"] >= 8

def test_live_signals_telemetry(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/signals/live")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "AUTONOMOUS_ENGINE_LIVE"
    assert "strategies" in data
    
    # Check active strategies that have open positions
    open_strats = [s for s in data["strategies"] if s["position_status"] == "OPEN"]
    assert len(open_strats) >= 3 # pippo-1h-enhanced, pippo-30m-alpha, pippo-4h-original
    
    alpha = next(s for s in open_strats if s["strategy_id"] == "pippo-30m-alpha")
    assert alpha["entry_price"] > 75000.0
    assert alpha["be_active"] is True
    assert alpha["stop_loss"] > alpha["entry_price"] # Breakeven locked in profit!

def test_live_telemetry_prefers_newer_runtime_closed_trade(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    runtime_path = Path(main.effective_catalog_path("BTCUSDT"))
    catalog = json.loads(runtime_path.read_text())
    strategy = next(item for item in catalog if item["id"] == "pippo-30m-grd")
    model = live_signal_engine.get_model("pippo-30m-grd", symbol="BTCUSDT")
    previous_model_close = model.last_closed_trade
    previous_trades = list(strategy.get("trades", []))
    strategy["trades"].append({
        "trade_no": 727,
        "side": "LONG",
        "type": "LONG",
        "entry_time": "2026-09-26 09:30:00",
        "exit_time": "2026-09-28 00:30:00",
        "entry_price": 84100.77,
        "exit_price": 84140.0,
        "net_return_pct": -0.13,
        "exit_reason": "Force_Close_MA",
        "status": "CLOSED",
        "is_active": False,
    })
    model.last_closed_trade = {
        "trade_no": 726,
        "exit_time": "2026-09-25 13:30:00",
        "exit_price": 83923.71,
        "status": "CLOSED",
    }
    try:
        runtime_path.write_text(json.dumps(catalog))
        response = client.get("/api/signals/live?symbol=BTCUSDT")
        assert response.status_code == 200
        strategy_telemetry = next(
            item for item in response.json()["strategies"]
            if item["strategy_id"] == "pippo-30m-grd"
        )
        assert strategy_telemetry["last_closed_trade"]["trade_no"] == 727
        assert strategy_telemetry["last_closed_trade"]["exit_price"] == 84140.0
    finally:
        strategy["trades"] = previous_trades
        runtime_path.write_text(json.dumps(catalog))
        model.last_closed_trade = previous_model_close

    res = client.get("/api/strategies")
    assert res.status_code == 200
    strategies = res.json()
    assert len(strategies) >= 8

    # Find Pippo 1h Enhanced
    p1h = next(s for s in strategies if s["id"] == "pippo-1h-enhanced")
    trades = p1h["trades"]
    markers = p1h["markers"]
    
    assert len(trades) >= 65
    assert len(markers) >= 130
    
    # Check active trade at the end of trades list
    latest_trade = trades[-1]
    assert latest_trade["status"] == "OPEN"
    assert latest_trade["side"] == "LONG"
    assert latest_trade["entry_price"] > 79000.0
    assert latest_trade["be_activated"] is True
    assert latest_trade["stop_loss"] > latest_trade["entry_price"]

    # Check that active markers are present
    active_entry_markers = [m for m in markers if m.get("isActive") is True]
    assert len(active_entry_markers) == 1
    assert active_entry_markers[0]["shape"] == "arrowUp"
    assert active_entry_markers[0]["color"] == "#30D158"
    assert "ACTIVE LONG" in active_entry_markers[0]["text"]

    # Check Breakeven marker
    be_markers = [m for m in markers if m.get("isBreakeven") is True]
    assert len(be_markers) == 1
    assert be_markers[0]["shape"] == "circle"
    assert be_markers[0]["color"] == "#FF9F0A"
    assert "BE LOCKED" in be_markers[0]["text"]


def test_replayed_valid_close_is_persisted_idempotently(tmp_path, monkeypatch):
    import shutil
    import live_signal_engine as engine_module
    from catalog_storage import ensure_runtime_catalog, runtime_catalog_path

    backend_data = tmp_path / "backend" / "data"
    backend_data.mkdir(parents=True)
    for filename in ("strategies.json", "strategies_eth.json"):
        shutil.copy(REPO_ROOT / "backend" / "data" / filename, backend_data / filename)
    ensure_runtime_catalog("BTCUSDT", tmp_path)
    monkeypatch.setattr(
        engine_module,
        "__file__",
        str(tmp_path / "backend" / "live_signal_engine.py"),
    )

    engine = LiveSignalEngine()
    model = engine.get_model("pippo-30m-grd", symbol="BTCUSDT")
    replayed = {
        "symbol": "BTC/USDT",
        "asset": "BTCUSDT",
        "side": "LONG",
        "type": "LONG",
        "entry_time": "2026-09-26 08:00:00",
        "exit_time": "2026-09-28 00:30:00",
        "entry_price": 84100.77,
        "exit_price": 84140.0,
        "gross_return_pct": 0.05,
        "net_return_pct": -0.13,
        "exit_reason": "Force Close MA (-0.5%)",
        "be_activated": False,
        "status": "CLOSED",
    }

    first = engine._persist_replayed_closed_trades(model, [replayed], "BTCUSDT")
    second = engine._persist_replayed_closed_trades(model, [replayed], "BTCUSDT")

    runtime_path = runtime_catalog_path("BTCUSDT", tmp_path)
    catalog = json.loads(runtime_path.read_text())
    strategy = next(item for item in catalog if item["id"] == "pippo-30m-grd")
    matches = [
        trade for trade in strategy["trades"]
        if trade.get("entry_time") == replayed["entry_time"]
        and trade.get("exit_time") == replayed["exit_time"]
    ]
    trade_no = matches[0]["trade_no"] if matches else None
    trade_markers = [
        marker for marker in strategy["markers"]
        if marker.get("tradeNo") == trade_no
    ]

    assert len(matches) == 1
    assert trade_no == 727
    assert len(trade_markers) == 2
    assert {marker.get("eventType") for marker in trade_markers} == {"entry", "exit"}
    assert first[-1]["trade_no"] == 727
    assert second[-1]["trade_no"] == 727


def test_replayed_close_collapses_duplicate_trade_ledger_entries(tmp_path, monkeypatch):
    import shutil
    import live_signal_engine as engine_module
    from catalog_storage import ensure_runtime_catalog, runtime_catalog_path

    backend_data = tmp_path / "backend" / "data"
    backend_data.mkdir(parents=True)
    for filename in ("strategies.json", "strategies_eth.json"):
        shutil.copy(REPO_ROOT / "backend" / "data" / filename, backend_data / filename)
    runtime_path = ensure_runtime_catalog("BTCUSDT", tmp_path)
    monkeypatch.setattr(engine_module, "__file__", str(tmp_path / "backend" / "live_signal_engine.py"))

    catalog = json.loads(runtime_path.read_text())
    strategy = next(item for item in catalog if item["id"] == "pippo-30m-new-gen")
    duplicate = {
        "trade_no": 448,
        "side": "LONG",
        "type": "LONG",
        "entry_time": "2026-09-29 23:00:00",
        "exit_time": "2026-10-02 17:00:00",
        "entry_price": 83759.03,
        "exit_price": 84584.74,
        "gross_return_pct": 0.99,
        "net_return_pct": 0.81,
        "exit_reason": "Force_Close_MA",
        "status": "CLOSED",
        "is_active": False,
    }
    strategy["trades"] = [
        {
            **duplicate,
            "trade_no": 447,
            "exit_reason": "Force_Close_MA",
        },
        duplicate,
        {**duplicate, "trade_no": 449},
        {**duplicate, "trade_no": 450},
    ]
    strategy["markers"] = [
        {
            "time": "2026-10-02 17:00:00",
            "text": f"EXIT Force_Close_MA #{number}",
            "exitPrice": 84584.74,
            "pnlPct": 0.81,
            "eventType": "exit",
            "tradeNo": number,
        }
        for number in (447, 448, 449, 450)
    ]
    runtime_path.write_text(json.dumps(catalog))

    engine = LiveSignalEngine()
    model = engine.get_model("pippo-30m-new-gen", symbol="BTCUSDT")
    replayed = {
        **duplicate,
        "trade_no": None,
        "reason": "Force_Close_MA",
    }
    persisted = engine._persist_replayed_closed_trades(model, [replayed], "BTCUSDT")

    result = json.loads(runtime_path.read_text())
    strategy = next(item for item in result if item["id"] == "pippo-30m-new-gen")
    matches = [
        trade for trade in strategy["trades"]
        if trade.get("entry_time") == duplicate["entry_time"]
        and trade.get("exit_time") == duplicate["exit_time"]
        and trade.get("entry_price") == duplicate["entry_price"]
        and trade.get("exit_price") == duplicate["exit_price"]
    ]
    assert [trade["trade_no"] for trade in matches] == [447]
    assert len(strategy["markers"]) == 2
    assert {marker.get("tradeNo") for marker in strategy["markers"]} == {447}
    assert {marker.get("eventType") for marker in strategy["markers"]} == {"entry", "exit"}
    assert persisted[-1]["trade_no"] == 447


def test_runtime_catalogs_have_unique_trade_identities_for_all_assets():
    from catalog_storage import runtime_catalog_path
    from live_signal_engine import _trade_ledger_identity

    for symbol in ("BTCUSDT", "ETHUSDT"):
        catalog = json.loads(runtime_catalog_path(symbol, REPO_ROOT).read_text())
        for strategy in catalog:
            identities = [_trade_ledger_identity(trade) for trade in strategy.get("trades", [])]
            assert len(identities) == len(set(identities)), strategy["id"]


def test_catalog_markers_match_trade_lifecycle_for_all_assets_and_strategies(client, monkeypatch):
    """Historical exits must not be rendered as sells for an open trade."""
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    for symbol in ["BTCUSDT", "ETHUSDT"]:
        res = client.get(f"/api/strategies?symbol={symbol}")
        assert res.status_code == 200
        for strategy in res.json():
            trades_by_no = {
                trade.get("trade_no"): trade
                for trade in strategy.get("trades", [])
                if trade.get("trade_no") is not None
            }
            for marker in strategy.get("markers", []):
                trade_no = marker.get("tradeNo")
                if trade_no not in trades_by_no:
                    assert not (
                        marker.get("isBreakeven") is not True
                        and (
                            marker.get("exitPrice") is not None
                            or marker.get("pnlPct") is not None
                            or str(marker.get("text", "")).upper().startswith(("EXIT", "CLOSE"))
                        )
                    ), f"orphan exit marker in {symbol}/{strategy['id']}: {marker}"
                    continue

                trade = trades_by_no[trade_no]
                is_open = str(trade.get("status", "")).upper() in {"OPEN", "RUNNING"}
                is_exit = marker.get("isBreakeven") is not True and (
                    marker.get("exitPrice") is not None
                    or marker.get("pnlPct") is not None
                    or str(marker.get("text", "")).upper().startswith(("EXIT", "CLOSE"))
                )
                assert not (is_open and is_exit), (
                    f"exit marker attached to open trade in "
                    f"{symbol}/{strategy['id']}: {marker}"
                )

            open_trades = [
                trade for trade in strategy.get("trades", [])
                if str(trade.get("status", "")).upper() in {"OPEN", "RUNNING"}
            ]
            if open_trades:
                open_trade_no = open_trades[-1].get("trade_no")
                active_entries = [
                    marker for marker in strategy.get("markers", [])
                    if marker.get("isActive") is True and marker.get("isBreakeven") is not True
                ]
                active_breakevens = [
                    marker for marker in strategy.get("markers", [])
                    if marker.get("isBreakeven") is True and marker.get("tradeNo") == open_trade_no
                ]
                assert len(active_entries) == 1, (
                    f"expected one active entry marker in {symbol}/{strategy['id']}, "
                    f"got {active_entries}"
                )
                assert active_entries[0].get("tradeNo") == open_trade_no
                assert active_entries[0].get("eventType") == "entry"
                assert abs(
                    float(active_entries[0].get("entryPrice"))
                    - float(open_trades[-1].get("entry_price"))
                ) < 0.01
                assert len(active_breakevens) <= 1, (
                    f"duplicate breakeven markers in {symbol}/{strategy['id']}: "
                    f"{active_breakevens}"
                )
                if open_trades[-1].get("be_activated") is True:
                    assert len(active_breakevens) == 1
                    assert active_breakevens[0].get("eventType") == "breakeven"
            else:
                assert not [
                    marker for marker in strategy.get("markers", [])
                    if marker.get("isActive") is True
                    or marker.get("isBreakeven") is True
                    or str(marker.get("status", "")).upper() == "OPEN"
                ], f"live marker leaked into flat {symbol}/{strategy['id']}"

            assert not [
                marker for marker in strategy.get("markers", [])
                if marker.get("isBreakeven") is True and marker.get("tradeNo") is None
            ], f"orphan breakeven marker in {symbol}/{strategy['id']}"


@pytest.mark.parametrize(
    "catalog_path",
    [
        REPO_ROOT / "backend/data/strategies.json",
        REPO_ROOT / "backend/data/strategies_eth.json",
        REPO_ROOT / "frontend/src/data/strategiesData.json",
        REPO_ROOT / "frontend/src/data/strategiesData_eth.json",
    ],
)
def test_persisted_catalog_marker_lifecycle_clean(catalog_path):
    """Bundled catalogs must not carry duplicate or orphan live markers."""
    with open(catalog_path) as handle:
        strategies = json.load(handle)
    is_public_catalog = "frontend" in catalog_path.parts and "src" in catalog_path.parts

    for strategy in strategies:
        trades = strategy.get("trades", [])
        by_no = {
            str(trade.get("trade_no")): trade
            for trade in trades
            if trade.get("trade_no") is not None
        }
        open_trades = [
            trade for trade in trades
            if str(trade.get("status", "")).upper() in {"OPEN", "RUNNING"}
        ]
        active_entries = [
            marker for marker in strategy.get("markers", [])
            if marker.get("isActive") is True and marker.get("isBreakeven") is not True
        ]
        breakevens = [
            marker for marker in strategy.get("markers", [])
            if marker.get("isBreakeven") is True
        ]
        if open_trades:
            current = open_trades[-1]
            assert len(active_entries) == 1, strategy["id"]
            assert str(active_entries[0].get("tradeNo")) == str(current.get("trade_no"))
            assert active_entries[0].get("eventType") == "entry"
            assert abs(float(active_entries[0]["entryPrice"]) - float(current["entry_price"])) < 0.01
            expected_be = current.get("be_activated") is True
            if is_public_catalog:
                assert not breakevens, strategy["id"]
            else:
                assert len(breakevens) == (1 if expected_be else 0), strategy["id"]
            if expected_be and not is_public_catalog:
                assert str(breakevens[0].get("tradeNo")) == str(current.get("trade_no"))
                assert breakevens[0].get("eventType") == "breakeven"
        else:
            assert not active_entries, strategy["id"]
            assert not breakevens, strategy["id"]

        assert all(marker.get("tradeNo") is not None for marker in breakevens)
        for marker in strategy.get("markers", []):
            if marker.get("isBreakeven") is True:
                assert str(marker.get("tradeNo")) in by_no

def test_runtime_breakeven_markers_are_canonical():
    engine = LiveSignalEngine()

    direct = StrategyModel(
        "test-be-direct", "Test BE Direct", "30m", "LONG",
        {"sl_pct": 0.05, "be_pct": 0.03, "tp_pct": 0.75}, "BTCUSDT"
    )
    direct.position_status = "OPEN"
    direct.entry_price = 100.0
    direct.entry_time = "2026-09-26 00:00:00"
    direct.current_sl = 95.0
    direct.target_tp = 175.0
    direct.active_markers = [{
        "time": 178,
        "entryPrice": 100.0,
        "side": "LONG",
        "status": "OPEN",
        "isActive": True,
        "eventType": "entry",
        "tradeNo": 41,
    }]
    engine._evaluate_closed_position(direct, 104.0, "2026-09-26 01:00:00")
    direct_be = [m for m in direct.active_markers if m.get("isBreakeven") is True]
    assert len(direct_be) == 1
    assert direct_be[0]["eventType"] == "breakeven"
    assert direct_be[0]["tradeNo"] == 41
    assert direct_be[0]["exitPrice"] == 100.2

    partial = StrategyModel(
        "test-be-partial", "Test BE Partial", "30m", "LONG",
        {"sl_pct": 0.05, "be_pct": 0.04, "tp_pct": 0.75, "partial_tp": 0.04, "partial_weight": 0.30}, "BTCUSDT"
    )
    partial.position_status = "OPEN"
    partial.entry_price = 100.0
    partial.entry_time = "2026-09-26 00:00:00"
    partial.current_sl = 95.0
    partial.target_tp = 175.0
    partial.active_markers = [{
        "time": 178,
        "entryPrice": 100.0,
        "side": "LONG",
        "status": "OPEN",
        "isActive": True,
        "eventType": "entry",
        "tradeNo": 42,
    }]
    engine._evaluate_closed_position(partial, 104.0, "2026-09-26 01:00:00")
    partial_be = [m for m in partial.active_markers if m.get("isBreakeven") is True]
    assert len(partial_be) == 1
    assert partial_be[0]["eventType"] == "breakeven"
    assert partial_be[0]["tradeNo"] == 42
    assert partial_be[0]["exitPrice"] == 100.2


def test_static_catalog_open_trade_is_not_restored_without_runtime_overlay(tmp_path, monkeypatch):
    import live_signal_engine as engine_module

    backend_data = tmp_path / "backend" / "data"
    backend_data.mkdir(parents=True)
    source = json.loads((REPO_ROOT / "backend/data/strategies.json").read_text())
    strategy = next(item for item in source if item["id"] == "pippo-1h-enhanced")
    strategy["trades"] = [next(item for item in strategy["trades"] if item.get("status") == "OPEN")]
    (backend_data / "strategies.json").write_text(json.dumps(source, indent=2))

    fake_module_file = tmp_path / "backend" / "live_signal_engine.py"
    fake_module_file.write_text("")
    monkeypatch.setattr(engine_module, "__file__", str(fake_module_file))
    model = StrategyModel(
        "pippo-1h-enhanced", "Pippo 1h Enhanced", "1h", "LONG",
        {"sl_pct": 0.08, "be_pct": 0.05, "tp_pct": 0.75}, "BTCUSDT"
    )
    engine = LiveSignalEngine()
    engine.strategies = {model.strat_id: model}

    engine.sync_active_positions("BTCUSDT")

    assert model.position_status == "FLAT"
    assert model.active_ticket is None


def test_persist_open_trade_uses_runtime_overlay_and_leaves_static_catalogs_unchanged(tmp_path, monkeypatch):
    import live_signal_engine as engine_module
    from catalog_storage import runtime_catalog_path
    backend_data = tmp_path / "backend" / "data"
    frontend_data = tmp_path / "frontend" / "src" / "data"
    backend_data.mkdir(parents=True)
    frontend_data.mkdir(parents=True)
    source = json.loads((REPO_ROOT / "backend/data/strategies.json").read_text())
    strategy = next(item for item in source if item["id"] == "pippo-1h-enhanced")
    open_trade = next(item for item in strategy["trades"] if item.get("status") == "OPEN")
    duplicate = dict(open_trade)
    duplicate["trade_no"] = 999
    duplicate["entry_time"] = "2026-09-18 13:01:00"
    for path in [backend_data / "strategies.json", frontend_data / "strategiesData.json"]:
        path.write_text(json.dumps(source, indent=2))
    backend_before = (backend_data / "strategies.json").read_bytes()
    frontend_before = (frontend_data / "strategiesData.json").read_bytes()

    runtime_source = json.loads((backend_data / "strategies.json").read_text())
    runtime_strategy = next(item for item in runtime_source if item["id"] == "pippo-1h-enhanced")
    runtime_strategy["trades"].append(duplicate)
    (backend_data / "strategies.json").write_text(json.dumps(runtime_source, indent=2))
    backend_before = (backend_data / "strategies.json").read_bytes()

    fake_module_file = tmp_path / "backend" / "live_signal_engine.py"
    fake_module_file.write_text("")
    monkeypatch.setattr(engine_module, "__file__", str(fake_module_file))
    monkeypatch.setattr(main, "reload_local_catalog", lambda *_args: None)
    model = StrategyModel(
        "pippo-1h-enhanced", "Pippo 1h Enhanced", "1h", "LONG",
        {"sl_pct": 0.08, "be_pct": 0.05, "tp_pct": 0.75}, "BTCUSDT"
    )
    model.entry_price = open_trade["entry_price"]
    model.entry_time = open_trade["entry_time"]
    model.current_sl = open_trade["stop_loss"]
    model.target_tp = open_trade["take_profit"]
    model.be_active = True
    LiveSignalEngine()._persist_opened_trade(model, {})

    result = json.loads(runtime_catalog_path("BTCUSDT", tmp_path).read_text())
    result_strategy = next(item for item in result if item["id"] == model.strat_id)
    open_records = [item for item in result_strategy["trades"] if item.get("status") == "OPEN"]
    assert len(open_records) == 1
    assert open_records[0]["trade_no"] == open_trade["trade_no"]
    assert (backend_data / "strategies.json").read_bytes() == backend_before
    assert (frontend_data / "strategiesData.json").read_bytes() == frontend_before


def test_exit_price_only_marker_is_classified_as_close():
    assert main._is_close_marker({"exitPrice": 99.0}) is True


def test_individual_strategy_detail_endpoint(client):
    all_strategies = [
        "pippo-30m-alpha", "pippo-1h-enhanced", "pippo-4h-original",
        "pippo-30m-scalp", "pippo-30m-new-gen", "pippo-30m-grd"
    ]
    for sid in all_strategies:
        res = client.get(f"/api/strategies/{sid}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == sid
        assert data["has_active_signal"] is False
        assert all(
            str(trade.get("status", "")).upper() not in {"OPEN", "RUNNING"}
            for trade in data.get("trades", [])
        )
        assert all(marker.get("isActive") is not True for marker in data.get("markers", []))

def test_pippo_30m_new_gen_details(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/strategies/pippo-30m-new-gen")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Novera"
    assert data["timeframe"] == "30m"
    assert data["type"] == "LONG"
    closed_trades = [trade for trade in data["trades"] if trade.get("status") == "CLOSED"]
    assert data["metrics"]["total_trades"] == len(closed_trades)
    assert data["metrics"]["total_trades"] >= 445
    assert data["metrics"]["win_rate_pct"] > 0
    assert data["metrics"]["profit_factor"] > 0
    assert len(data["yearly_stats"]) == 7
    # Verify all 7 years are positive
    assert all(y["total_return_pct"] > 0 for y in data["yearly_stats"])

    # Verify replay-recovered closed trade #445 (autonomous confirmation of exit)
    recovered_trade = next(trade for trade in data["trades"] if trade.get("trade_no") == 445)
    assert recovered_trade["status"] == "CLOSED"
    assert recovered_trade["exit_price"] == 84140.0
    assert recovered_trade["exit_reason"] == "Force Close MA (-0.5%)"
    assert recovered_trade["net_return_pct"] == -0.13
    active_trades = [trade for trade in data["trades"] if trade.get("status") in {"OPEN", "RUNNING"}]
    assert data["has_active_signal"] is (len(active_trades) > 0)

def test_closed_trade_and_marker_contract_is_canonical(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/strategies/pippo-30m-new-gen")
    assert res.status_code == 200
    data = res.json()

    # A terminal trade can never remain active because of a legacy flag.
    assert all(
        trade.get("is_active") is not True
        for trade in data["trades"]
        if str(trade.get("status", "")).upper() == "CLOSED"
    )

    # The API boundary must emit chart-compatible seconds even when disk data
    # contains legacy datetime strings.
    assert all(isinstance(marker.get("time"), int) for marker in data["markers"])

    # Every persisted exit event must carry enough metadata for the frontend
    # to classify it as a close, including legacy arrow-shaped exits.
    exit_markers = [
        marker for marker in data["markers"]
        if str(marker.get("text", "")).upper().startswith("EXIT")
    ]
    assert exit_markers
    assert all(
        marker.get("exitPrice") is not None
        or marker.get("pnlPct") is not None
        or marker.get("eventType") == "exit"
        for marker in exit_markers
    )

def test_live_telemetry_public_redacts_latest_closed_trade(client):
    res = client.get("/api/signals/live")
    assert res.status_code == 200
    strategy = next(item for item in res.json()["strategies"] if item["strategy_id"] == "pippo-30m-new-gen")
    assert "last_closed_trade" not in strategy


def test_live_telemetry_restores_latest_closed_trade_for_pro(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/signals/live")
    assert res.status_code == 200
    strategy = next(item for item in res.json()["strategies"] if item["strategy_id"] == "pippo-30m-new-gen")
    assert strategy["last_closed_trade"] is not None
    assert strategy["last_closed_trade"]["status"] == "CLOSED"

def test_pippo_30m_grd_details(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/strategies/pippo-30m-grd")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Kairon"
    assert data["timeframe"] == "30m"
    assert data["type"] == "LONG"
    closed_trades = [trade for trade in data["trades"] if trade.get("status") == "CLOSED"]
    assert data["metrics"]["total_trades"] == len(closed_trades)
    assert data["metrics"]["total_trades"] >= 727
    assert data["metrics"]["win_rate_pct"] > 0
    assert data["metrics"]["profit_factor"] > 0
    assert len(data["yearly_stats"]) == 7

    # Verify replay-recovered closed trade #727 (autonomous confirmation of exit)
    recovered_trade = next(trade for trade in data["trades"] if trade.get("trade_no") == 727)
    assert recovered_trade["status"] == "CLOSED"
    assert recovered_trade["exit_price"] == 84140.0
    assert recovered_trade["exit_reason"] == "Force Close MA (-0.5%)"
    assert recovered_trade["net_return_pct"] == -0.13
    active_trades = [trade for trade in data["trades"] if trade.get("status") in {"OPEN", "RUNNING"}]
    assert data["has_active_signal"] is (len(active_trades) > 0)


def test_strategy_detail_endpoint_defaults_to_free_redaction(client):
    response = client.get("/api/strategies/pippo-30m-grd")
    assert response.status_code == 200
    payload = response.json()
    assert payload["entitlements"] == {
        "strategy_logic": False,
        "execution_parameters": False,
    }
    for restricted_key in ("logic_summary", "recommended_for", "parameters", "active_ticket", "markers"):
        assert restricted_key not in payload
    assert payload["trades"]
    assert all(
        "entry_price" not in trade
        and "exit_price" not in trade
        and trade.get("status") not in {"OPEN", "RUNNING"}
        for trade in payload["trades"]
    )
    assert payload["has_active_signal"] is False
    assert payload["restricted_content"]["label"] == "ONLY FOR PRO USERS"


def test_strategy_detail_endpoint_returns_restricted_fields_for_verified_pro(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    response = client.get("/api/strategies/pippo-30m-grd")
    assert response.status_code == 200
    payload = response.json()
    assert payload["entitlements"] == {
        "strategy_logic": True,
        "execution_parameters": True,
    }
    assert payload["logic_summary"]
    assert payload["recommended_for"]
    assert payload["parameters"]["entry_swing"]
    assert payload["active_ticket"] is not None
    assert any("stop_loss" in trade and "take_profit" in trade for trade in payload["trades"])
    assert isinstance(payload["markers"], list)
    assert "restricted_content" not in payload


def test_signal_endpoints_apply_entitlement_redaction(client, monkeypatch):
    free_live = client.get("/api/signals/live?symbol=BTCUSDT")
    assert free_live.status_code == 200
    free_payload = free_live.json()
    assert free_payload["entitlements"]["execution_parameters"] is False
    assert all(
        "stop_loss" not in strategy
        and "take_profit" not in strategy
        and "next_entry_trigger" not in strategy
        for strategy in free_payload["strategies"]
    )

    free_ticket = client.get("/api/signals/ticket?strategy_id=pippo-30m-grd&symbol=BTCUSDT")
    assert free_ticket.status_code == 200
    assert free_ticket.json()["status"] == "PROTECTED"
    assert "entry_price" not in free_ticket.json()
    assert "stop_loss" not in free_ticket.json()
    assert "take_profit" not in free_ticket.json()

    free_floor = client.get("/api/floor").json()
    assert free_floor["signal_ticket"]["status"] == "PROTECTED"
    assert "stop_loss" not in free_floor["signal_ticket"]
    assert "take_profit" not in free_floor["signal_ticket"]
    assert free_floor["market_regime"] == {"status": "PROTECTED"}
    assert free_floor["eth_market_regime"] == {"status": "PROTECTED"}
    assert all(
        agent.get("reasoning_log") == ["Exact entry, protection, and target levels are reserved for Pro users."]
        for agent in free_floor["agents"]
    )

    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    pro_ticket = client.get("/api/signals/ticket?strategy_id=pippo-30m-grd&symbol=BTCUSDT").json()
    assert pro_ticket["entry_price"] > 0
    assert pro_ticket["stop_loss"] is not None
    assert pro_ticket["take_profit"] is not None

    pro_floor = client.get("/api/floor").json()
    assert pro_floor["signal_ticket"]["stop_loss"] is not None

    for tf in ["30m", "1h", "4h", "1d"]:
        res = client.get(f"/api/klines?timeframe={tf}&limit=100")
        assert res.status_code == 200
        data = res.json()
        assert data["data_source"].startswith("local_parquet")
        assert len(data["candles"]) == 100
        assert data["candles"][-1]["close"] > 50000.0

def test_close_signal_endpoint_requires_auth_and_redacts_free_trade(client, monkeypatch):
    unauthenticated = client.post("/api/signals/close?strategy_id=pippo-30m-grd&symbol=BTCUSDT")
    assert unauthenticated.status_code == 401

    model = SimpleNamespace(position_status="OPEN", strat_id="pippo-30m-grd", name="Pippo 30m Grd")
    trade = {
        "trade_no": 900,
        "status": "CLOSED",
        "entry_price": 100,
        "exit_price": 101,
        "stop_loss": 95,
        "take_profit": 120,
        "exit_reason": "Force Close MA (-0.5%)",
    }
    monkeypatch.setattr(live_signal_engine, "get_model", lambda *_args, **_kwargs: model)
    monkeypatch.setattr(live_signal_engine, "get_last_price", lambda *_args, **_kwargs: 101)
    monkeypatch.setattr(live_signal_engine, "_close_position", lambda *_args, **_kwargs: trade)

    async def authenticated(_request):
        return True

    async def free(_request):
        return False

    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_authenticated_user", authenticated)
    monkeypatch.setattr(main, "request_has_pro_access", free)

    free_response = client.post(
        "/api/signals/close?strategy_id=pippo-30m-grd&symbol=BTCUSDT",
        headers={"Authorization": "Bearer test-token"},
    )
    assert free_response.status_code == 403

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    response = client.post(
        "/api/signals/close?strategy_id=pippo-30m-grd&symbol=BTCUSDT",
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "CLOSED"
    assert payload["trade"]["entry_price"] == 100
    assert payload["trade"]["stop_loss"] == 95
    assert payload["trade"]["take_profit"] == 120
    assert payload["trade"]["exit_reason"] == "Force Close MA (-0.5%)"


def test_mutating_floor_endpoints_require_authenticated_pro_user(client, monkeypatch):
    async def unauthenticated(_request):
        return False

    async def authenticated(_request):
        return True

    async def free(_request):
        return False

    monkeypatch.setattr(main, "request_has_authenticated_user", unauthenticated)
    monkeypatch.setattr(main, "request_has_pro_access", free)

    simulate = client.post("/api/floor/simulate-signal?strategy_id=pippo-30m-grd&symbol=BTCUSDT")
    select = client.post("/api/floor/select-agent?agent_id=quant")

    assert simulate.status_code == 401
    assert select.status_code == 401

    monkeypatch.setattr(main, "request_has_authenticated_user", authenticated)
    simulate = client.post("/api/floor/simulate-signal?strategy_id=pippo-30m-grd&symbol=BTCUSDT")
    select = client.post("/api/floor/select-agent?agent_id=quant")

    assert simulate.status_code == 403
    assert select.status_code == 403


def test_public_websocket_cannot_mutate_floor_agent(client):
    previous_agent = main.floor_engine.active_agent_id
    with client.websocket_connect("/ws") as websocket:
        snapshot = websocket.receive_json()
        assert snapshot["type"] == "SNAPSHOT"
        websocket.send_json({"action": "SELECT_AGENT", "agent_id": "quant"})
        response = websocket.receive_json()

    assert response["type"] == "ERROR"
    assert response["code"] == "PROTECTED_ACTION"
    assert main.floor_engine.active_agent_id == previous_agent


@pytest.mark.parametrize("path", ["/billing", "/landing", "/random-path", "/app/random-path"])
def test_unknown_frontend_routes_return_branded_spa_404(client, path):
    response = client.get(path)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("text/html")
    assert 'id="root"' in response.text


def test_known_frontend_routes_remain_available(client):
    assert client.get("/").status_code == 200
    assert client.get("/app").status_code == 200
    assert client.get("/app/").status_code == 200


def test_free_api_does_not_expose_rule_bearing_reason_strings(client):
    endpoints = (
        "/api/strategies?symbol=BTCUSDT",
        "/api/strategies/pippo-30m-grd?symbol=BTCUSDT",
        "/api/strategies?symbol=ETHUSDT",
        "/api/strategies/pippo-30m-alpha?symbol=ETHUSDT",
        "/api/signals/live?symbol=BTCUSDT",
        "/api/floor",
    )
    restricted_fragments = (
        "force close ma",
        "force_close_ma",
        "fast_breakeven",
        "be locked @",
        "structure_exit",
        "bearish choch",
        "weekly close < ma55",
        "active long @",
        "active short @",
    )
    restricted_keys = {
        "partial_exit_price",
        "partial_position_pct",
        "stop_loss",
        "take_profit",
        "breakeven_trigger",
        "entry_confluence_ok",
        "exit_confluence_ok",
        "structural_floor",
        "major_swing_level",
        "next_entry_trigger",
    }

    def find_leaks(value, path="$", leaks=None):
        if leaks is None:
            leaks = []
        if isinstance(value, dict):
            for key, nested in value.items():
                if key in restricted_keys and nested not in (None, False):
                    leaks.append(f"{path}.{key}: restricted value")
                if isinstance(nested, str):
                    lower = nested.lower()
                    for fragment in restricted_fragments:
                        if fragment in lower:
                            leaks.append(f"{path}.{key}: {fragment}")
                if key in {"isActive", "is_active"} and nested is True:
                    leaks.append(f"{path}.{key}: active state")
                if key in {"status", "position_status"} and str(nested).upper() in {"OPEN", "RUNNING", "IN_POSITION"}:
                    leaks.append(f"{path}.{key}: live state")
                if key == "exit_time" and str(nested).upper() == "RUNNING":
                    leaks.append(f"{path}.{key}: running state")
                find_leaks(nested, f"{path}.{key}", leaks)
        elif isinstance(value, list):
            for index, nested in enumerate(value):
                find_leaks(nested, f"{path}[{index}]", leaks)
        return leaks

    for endpoint in endpoints:
        response = client.get(endpoint)
        assert response.status_code == 200
        assert find_leaks(response.json(), endpoint) == []



def test_klines_endpoint_uses_canonical_cache_not_ticker_override(client):
    previous_connected = main.binance_manager.is_connected
    previous_ticker = dict(main.binance_manager.ticker_data_map["BTCUSDT"])
    try:
        main.binance_manager.is_connected = True
        main.binance_manager.ticker_data_map["BTCUSDT"]["price"] = 12345.67
        expected = main.KLINES_CACHE["1h"][-1]
        res = client.get("/api/klines?symbol=BTCUSDT&timeframe=1h&limit=1")
        assert res.status_code == 200
        actual = res.json()["candles"][-1]
        matching_cache_candle = next(
            candle for candle in main.KLINES_CACHE["1h"]
            if candle["time"] == actual["time"]
        )
        assert actual["close"] == matching_cache_candle["close"]
        assert actual["close"] != 12345.67
        assert res.json()["data_source"] == "local_parquet_live_cache"
    finally:
        main.binance_manager.is_connected = previous_connected
        main.binance_manager.ticker_data_map["BTCUSDT"] = previous_ticker


def test_eth_system_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert "ETHUSDT" in data["supported_assets"]
    assert "BTCUSDT" in data["supported_assets"]
    assert data["strategies_count_eth"] == 10
    assert data["latest_eth_price"] > 1000.0

def test_eth_ticker(client):
    res = client.get("/api/ticker?symbol=ETHUSDT")
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "ETHUSDT"
    assert data["price"] > 1000.0

def test_eth_klines_endpoint(client):
    for tf in ["30m", "1h", "4h", "1d", "1w"]:
        res = client.get(f"/api/klines?symbol=ETHUSDT&timeframe={tf}&limit=50")
        assert res.status_code == 200
        data = res.json()
        assert data["symbol"] == "ETHUSDT"
        assert len(data["candles"]) == 50
        assert 500.0 < data["candles"][-1]["close"] < 10000.0
        # Check MA indicators are present
        assert "ma25" in data["candles"][-1]
        assert "ma50" in data["candles"][-1]

def test_eth_strategies_catalog(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/strategies?symbol=ETHUSDT")
    assert res.status_code == 200
    strats = res.json()
    assert len(strats) == 10
    
    # Check Pippo 30M Alpha on ETH
    alpha = next((s for s in strats if s["id"] == "pippo-30m-alpha"), None)
    assert alpha is not None
    assert 120 <= alpha["metrics"]["total_trades"] <= 160
    assert alpha["metrics"]["win_rate_pct"] > 60.0
    assert alpha["metrics"]["total_return_pct"] > 400.0
    assert 120 <= len(alpha["trades"]) <= 160
    assert len(alpha["markers"]) > 200

    # Check Pippo 30m Grd on ETH
    grd = next((s for s in strats if s["id"] == "pippo-30m-grd"), None)
    assert grd is not None
    assert 500 <= grd["metrics"]["total_trades"] <= 550
    assert 500 <= len(grd["trades"]) <= 550

    # Check Pippo 1h Enhanced on ETH
    p1h = next((s for s in strats if s["id"] == "pippo-1h-enhanced"), None)
    assert p1h is not None
    assert 80 <= p1h["metrics"]["total_trades"] <= 120
    assert 80 <= len(p1h["trades"]) <= 120
    assert p1h["metrics"]["total_return_pct"] > 500.0

def test_eth_strategy_detail_endpoint(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/strategies/pippo-30m-alpha?symbol=ETHUSDT")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "pippo-30m-alpha"
    assert 120 <= data["metrics"]["total_trades"] <= 160
    assert 120 <= len(data["trades"]) <= 160

    # Non-existent strategy
    res404 = client.get("/api/strategies/non-existent-strat?symbol=ETHUSDT")
    assert res404.status_code == 404

def test_floor_with_eth_regime(client, monkeypatch):
    async def verified_pro(_request):
        return True

    monkeypatch.setattr(main, "request_has_pro_access", verified_pro)
    res = client.get("/api/floor")
    assert res.status_code == 200
    data = res.json()
    assert "market_regime" in data
    assert "eth_market_regime" in data
    assert data["market_regime"]["weekly_ma55"] > 50000.0 # BTC
    assert 2000.0 < data["eth_market_regime"]["weekly_ma55"] < 4000.0 # ETH MA55 (~2648.68)

def test_autonomous_buy_execution_and_breakeven_lock(client):
    """Verify that protection rules execute from completed candle closes only."""
    import asyncio
    from live_signal_engine import LiveSignalEngine, StrategyModel

    class BroadcastCollector:
        def __init__(self):
            self.events = []

        async def broadcast(self, event):
            self.events.append(event)
    
    # Create isolated test engine so production models are never touched
    test_engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-long-algo",
        name="Test Long Runner",
        tf="30m",
        direction="LONG",
        config={"sl_pct": 0.05, "be_pct": 0.03, "tp_pct": 0.20},
        symbol="BTCUSDT"
    )
    test_engine.strategies["test-long-algo"] = model
    
    # 1. Open Position (Simulate BUY signal)
    entry_price = 80000.0
    ticket = test_engine._open_position(model, entry_price)
    assert ticket["action"] == "BUY"
    assert ticket["direction"] == "LONG"
    assert model.position_status == "OPEN"
    assert model.current_sl == 76000.0 # -5%
    assert model.be_active is False

    collector = BroadcastCollector()

    # A ticker update only changes mark-to-market telemetry.
    now_ts = 1774300000
    be_price = 80000.0 * 1.035 # 82,800
    events = test_engine.on_ticker_tick(be_price, now_ts, symbol="BTCUSDT")
    assert events == []
    assert model.be_active is False

    # 2. The completed candle close locks Breakeven.
    asyncio.run(test_engine.on_kline_closed("30m", {
        "time": now_ts,
        "timestamp": now_ts * 1000,
        "open": 80000.0,
        "high": be_price,
        "low": 80000.0,
        "close": be_price,
        "volume": 1.0,
    }, collector, symbol="BTCUSDT"))
    events = collector.events

    be_events = [e for e in events if e.get("type") == "BREAKEVEN_LOCKED" and e.get("strategy_id") == "test-long-algo"]
    assert len(be_events) == 1
    assert model.be_active is True
    assert model.current_sl == 80160.0 # +0.2% locked above entry 80,000!

    # 3. A ticker crossing the stop does not close the position.
    exit_events = test_engine.on_ticker_tick(80150.0, now_ts + 10, symbol="BTCUSDT")
    assert exit_events == []
    assert model.position_status == "OPEN"

    # 4. The completed candle close executes the Breakeven stop.
    asyncio.run(test_engine.on_kline_closed("30m", {
        "time": now_ts + 1800,
        "timestamp": (now_ts + 1800) * 1000,
        "open": 80150.0,
        "high": 80150.0,
        "low": 80100.0,
        "close": 80150.0,
        "volume": 1.0,
    }, collector, symbol="BTCUSDT"))
    exit_events = collector.events
    closed = [e for e in exit_events if e.get("type") == "POSITION_CLOSED" and e.get("strategy_id") == "test-long-algo"]
    assert len(closed) == 1
    assert model.position_status == "FLAT"
    assert closed[0]["trade"]["reason"] == "Fast_Breakeven"
    assert closed[0]["trade"]["net_return_pct"] >= 0.0 # Profit preserved!

def test_autonomous_short_execution_and_take_profit(client):
    """Verify that Short protection rules execute from completed candle closes on ETH."""
    import asyncio
    from live_signal_engine import LiveSignalEngine, StrategyModel

    class BroadcastCollector:
        def __init__(self):
            self.events = []

        async def broadcast(self, event):
            self.events.append(event)
    
    test_engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-short-eth",
        name="Test Short ETH",
        tf="30m",
        direction="SHORT",
        config={"sl_pct": 0.05, "be_pct": 0.02, "tp_pct": 0.10},
        symbol="ETHUSDT"
    )
    test_engine.strategies_eth["test-short-eth"] = model

    # 1. Open Position (Simulate SELL signal)
    entry_price = 2800.0
    ticket = test_engine._open_position(model, entry_price)
    assert ticket["action"] == "SELL"
    assert ticket["direction"] == "SHORT"
    assert ticket["symbol"] == "ETH/USDT"
    assert model.current_sl == 2940.0 # +5% for short

    collector = BroadcastCollector()
    # 2. A ticker update does not lock Breakeven.
    now_ts = 1774300000
    events = test_engine.on_ticker_tick(2730.0, now_ts, symbol="ETHUSDT")
    assert events == []
    assert model.be_active is False

    # The completed candle close locks Breakeven.
    asyncio.run(test_engine.on_kline_closed("30m", {
        "time": now_ts,
        "timestamp": now_ts * 1000,
        "open": 2800.0,
        "high": 2800.0,
        "low": 2730.0,
        "close": 2730.0,
        "volume": 1.0,
    }, collector, symbol="ETHUSDT"))
    events = collector.events
    be_events = [e for e in events if e.get("type") == "BREAKEVEN_LOCKED" and e.get("strategy_id") == "test-short-eth"]
    assert len(be_events) == 1
    assert model.be_active is True
    assert model.current_sl == 2794.4 # -0.2% locked below entry 2,800!

    # 3. The ticker crossing TP does not close the position.
    tp_events = test_engine.on_ticker_tick(2510.0, now_ts + 20, symbol="ETHUSDT")
    assert tp_events == []
    assert model.position_status == "OPEN"

    # 4. The completed candle close executes Take Profit (10% down -> 2,520).
    asyncio.run(test_engine.on_kline_closed("30m", {
        "time": now_ts + 1800,
        "timestamp": (now_ts + 1800) * 1000,
        "open": 2510.0,
        "high": 2510.0,
        "low": 2510.0,
        "close": 2510.0,
        "volume": 1.0,
    }, collector, symbol="ETHUSDT"))
    tp_events = collector.events
    closed = [e for e in tp_events if e.get("type") == "POSITION_CLOSED" and e.get("strategy_id") == "test-short-eth"]
    assert len(closed) == 1
    assert model.position_status == "FLAT"
    assert closed[0]["trade"]["reason"] == "Take_Profit"
    assert closed[0]["trade"]["net_return_pct"] > 9.0 # ~10% gain - fees!

def test_reopened_position_recalculates_stop_loss():
    """A previous position's stop must never leak into the next entry."""
    from live_signal_engine import LiveSignalEngine, StrategyModel

    engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-stop-reset",
        name="Stop Reset",
        tf="30m",
        direction="LONG",
        config={"sl_pct": 0.05, "be_pct": 0.0, "tp_pct": 0.20},
    )
    engine._open_position(model, 100.0)
    engine._close_position(model, 95.0, "test")
    reopened = engine._open_position(model, 200.0)

    assert reopened["stop_loss"] == 190.0
    assert model.current_sl == 190.0


def test_scalp_partial_take_profit_locks_breakeven_and_blends_exit():
    """Scalp-Runner realizes 30% at +4% before the runner closes."""
    import asyncio
    from live_signal_engine import LiveSignalEngine, StrategyModel

    class BroadcastCollector:
        def __init__(self):
            self.events = []

        async def broadcast(self, event):
            self.events.append(event)

    engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-scalp-partial",
        name="Test Scalp Runner",
        tf="30m",
        direction="LONG",
        config={"sl_pct": 0.05, "be_pct": 0.04, "tp_pct": 0.75, "partial_tp": 0.04, "partial_weight": 0.30},
    )
    engine.strategies[model.strat_id] = model
    engine._open_position(model, 100.0)
    collector = BroadcastCollector()

    asyncio.run(engine.on_kline_closed("30m", {
        "time": 1774300000,
        "timestamp": 1774300000000,
        "open": 100.0,
        "high": 104.0,
        "low": 100.0,
        "close": 104.0,
        "volume": 1.0,
    }, collector, symbol="BTCUSDT"))

    partial = [e for e in collector.events if e.get("type") == "PARTIAL_TAKE_PROFIT"]
    assert len(partial) == 1
    assert model.partial_taken is True
    assert model.be_active is True
    assert model.current_sl == 100.2

    asyncio.run(engine.on_kline_closed("30m", {
        "time": 1774301800,
        "timestamp": 1774301800000,
        "open": 104.0,
        "high": 104.0,
        "low": 102.0,
        "close": 100.1,
        "volume": 1.0,
    }, collector, symbol="BTCUSDT"))

    closed = [e for e in collector.events if e.get("type") == "POSITION_CLOSED" and e.get("strategy_id") == model.strat_id]
    assert len(closed) == 1
    assert closed[0]["trade"]["reason"] == "Fast_Breakeven"
    assert closed[0]["trade"]["partial_taken"] is True
    assert 1.1 < closed[0]["trade"]["gross_return_pct"] < 1.4


def test_four_hour_original_does_not_use_generic_breakeven():
    """4H Original keeps its 15% hard stop and CHoCH exit model."""
    from live_signal_engine import LiveSignalEngine, StrategyModel

    engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-4h-original",
        name="Test 4H Original",
        tf="4h",
        direction="LONG",
        config={"sl_pct": 0.15, "be_pct": 0.0, "tp_pct": 0.75},
    )
    engine.strategies[model.strat_id] = model
    engine._open_position(model, 100.0)
    events = engine.on_ticker_tick(110.0, 1774300000, symbol="BTCUSDT")
    assert events == []
    assert model.be_active is False
    assert model.current_sl == 85.0

def test_zero_stop_macro_short_does_not_immediately_stop_out():
    """Macro short positions use weekly regime flips rather than a zero-price stop."""
    from live_signal_engine import LiveSignalEngine, StrategyModel

    engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-macro-short",
        name="Macro Short",
        tf="1w",
        direction="SHORT",
        config={"sl_pct": 0.0, "be_pct": 0.0, "tp_pct": 0.0},
    )
    engine.strategies[model.strat_id] = model
    engine._open_position(model, 100.0)

    events = engine.on_ticker_tick(90.0, 1, symbol="BTCUSDT")

    assert model.position_status == "OPEN"
    assert model.current_sl == 0.0
    assert not any(event["type"] == "POSITION_CLOSED" for event in events)

def test_weekly_macro_emits_signal_on_regime_flip():
    """A completed weekly close opens or flips the MA55 regime position."""
    import asyncio
    import pandas as pd
    from live_signal_engine import LiveSignalEngine, StrategyModel

    class BroadcastCollector:
        def __init__(self):
            self.events = []

        async def broadcast(self, event):
            self.events.append(event)

    engine = LiveSignalEngine()
    model = StrategyModel(
        strat_id="test-weekly-macro",
        name="Weekly Macro",
        tf="1w",
        direction="LONG",
        config={
            "execution": "weekly_ma55_regime",
            "sl_pct": 0.0,
            "be_pct": 0.0,
            "tp_pct": 0.0,
        },
    )
    engine.strategies = {model.strat_id: model}
    engine.candle_buffers = {
        "1w": pd.DataFrame([
            {
                "time": i * 604800,
                "timestamp": i * 604800000,
                "datetime": f"2020-01-{(i % 28) + 1:02d} 00:00:00",
                "open": 100.0,
                "high": 101.0,
                "low": 99.0,
                "close": 100.0,
                "volume": 1.0,
            }
            for i in range(60)
        ])
    }
    collector = BroadcastCollector()

    asyncio.run(engine.on_kline_closed("1w", {
        "time": 60 * 604800,
        "timestamp": 60 * 604800000,
        "open": 100.0,
        "high": 106.0,
        "low": 99.0,
        "close": 105.0,
        "volume": 1.0,
    }, collector))
    assert model.position_status == "OPEN"
    assert model.direction == "LONG"
    assert [event["type"] for event in collector.events] == ["NEW_SIGNAL"]

    asyncio.run(engine.on_kline_closed("1w", {
        "time": 61 * 604800,
        "timestamp": 61 * 604800000,
        "open": 105.0,
        "high": 106.0,
        "low": 94.0,
        "close": 95.0,
        "volume": 1.0,
    }, collector))
    assert model.position_status == "OPEN"
    assert model.direction == "SHORT"
    assert [event["type"] for event in collector.events[-2:]] == ["SIGNAL_EXIT", "NEW_SIGNAL"]

def test_multi_asset_signals_endpoints(client, monkeypatch):
    """Verify live telemetry and ticket endpoints respond with correct symbol metadata."""
    # 1. Telemetry for BTC
    res_btc = client.get("/api/signals/live?symbol=BTCUSDT")
    assert res_btc.status_code == 200
    data_btc = res_btc.json()
    assert data_btc["symbol"] == "BTCUSDT"
    assert data_btc["current_price"] > 50000.0
    assert len(data_btc["strategies"]) == 10

    # 2. Telemetry for ETH
    res_eth = client.get("/api/signals/live?symbol=ETHUSDT")
    assert res_eth.status_code == 200
    data_eth = res_eth.json()
    assert data_eth["symbol"] == "ETHUSDT"
    assert 1000.0 < data_eth["current_price"] < 10000.0
    assert len(data_eth["strategies"]) == 10

    # 3. Ticket for ETH strategy
    res_ticket = client.get("/api/signals/ticket?strategy_id=pippo-30m-alpha&symbol=ETHUSDT")
    assert res_ticket.status_code == 200
    ticket = res_ticket.json()
    assert ticket["symbol"] == "ETH/USDT"
    assert ticket["asset"] == "ETHUSDT"
    assert ticket["strategy_id"] == "pippo-30m-alpha"
    assert "entry_price" not in ticket
    assert "stop_loss" not in ticket
    assert "take_profit" not in ticket

    # 4. Simulate signal on ETH without touching the live engine. The
    # production endpoint delegates to the floor engine, whose real trigger
    # intentionally opens/persists a position; this test only needs to cover
    # the HTTP contract and must remain hermetic.
    def fake_trigger_signal(strategy_id, strategy_name, direction, current_price, symbol):
        return {
            "symbol": "ETH/USDT",
            "asset": symbol,
            "strategy_id": strategy_id,
            "strategy_name": strategy_name,
            "direction": direction,
            "entry_price": current_price,
            "status": "LIVE_SIGNAL",
        }

    import supabase_client
    monkeypatch.setattr(supabase_client, "record_live_signal", lambda *_args, **_kwargs: None)

    async def fake_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(main.binance_manager, "broadcast", fake_broadcast)
    catalog_files = [
        REPO_ROOT / "backend/data/strategies.json",
        REPO_ROOT / "backend/data/strategies_eth.json",
        REPO_ROOT / "frontend/src/data/strategiesData.json",
        REPO_ROOT / "frontend/src/data/strategiesData_eth.json",
    ]
    disk_before = {str(path): path.read_bytes() for path in catalog_files}
    models_before = {
        symbol: {
            sid: (model.position_status, model.entry_price, model.entry_time, model.be_active, model.current_sl)
            for sid, model in live_signal_engine.get_models(symbol).items()
        }
        for symbol in ["BTCUSDT", "ETHUSDT"]
    }
    catalogs_before = (
        json.dumps(main.STRATEGIES_CATALOG, sort_keys=True),
        json.dumps(main.STRATEGIES_CATALOG_ETH, sort_keys=True),
    )
    monkeypatch.setattr(main.floor_engine, "trigger_signal", fake_trigger_signal)
    async def verified_user(_request):
        return True

    monkeypatch.setattr(main, "request_has_authenticated_user", verified_user)
    monkeypatch.setattr(main, "request_has_pro_access", verified_user)
    res_sim = client.post("/api/floor/simulate-signal?strategy_id=pippo-30m-alpha&symbol=ETHUSDT")
    assert res_sim.status_code == 200
    sim_data = res_sim.json()
    assert sim_data["ticket"]["symbol"] == "ETH/USDT"
    assert sim_data["ticket"]["asset"] == "ETHUSDT"
    assert disk_before == {str(path): path.read_bytes() for path in catalog_files}
    assert models_before == {
        symbol: {
            sid: (model.position_status, model.entry_price, model.entry_time, model.be_active, model.current_sl)
            for sid, model in live_signal_engine.get_models(symbol).items()
        }
        for symbol in ["BTCUSDT", "ETHUSDT"]
    }
    assert catalogs_before == (
        json.dumps(main.STRATEGIES_CATALOG, sort_keys=True),
        json.dumps(main.STRATEGIES_CATALOG_ETH, sort_keys=True),
    )

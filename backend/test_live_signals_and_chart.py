import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import main
from live_signal_engine import live_signal_engine

@pytest.fixture(scope="module")
def client():
    main.load_data_into_memory()
    with TestClient(main.app) as c:
        yield c

def test_system_status(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ONLINE"
    assert data["live_signal_engine"] == "AUTONOMOUS_ONLINE"
    assert "BULLISH EXPANSION" in data["macro_regime"] or "MACRO" in data["macro_regime"]
    assert data["strategies_count"] >= 8

def test_live_signals_telemetry(client):
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

def test_strategy_catalog_enrichment(client):
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
    assert len(active_entry_markers) >= 1
    assert active_entry_markers[0]["shape"] == "arrowUp"
    assert active_entry_markers[0]["color"] == "#30D158"
    assert "ACTIVE LONG" in active_entry_markers[0]["text"]

    # Check Breakeven marker
    be_markers = [m for m in markers if m.get("isBreakeven") is True]
    assert len(be_markers) >= 1
    assert be_markers[0]["shape"] == "circle"
    assert be_markers[0]["color"] == "#FF9F0A"
    assert "BE LOCKED" in be_markers[0]["text"]

def test_individual_strategy_detail_endpoint(client):
    for sid in ["pippo-30m-alpha", "pippo-1h-enhanced", "pippo-4h-original"]:
        res = client.get(f"/api/strategies/{sid}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == sid
        assert data["has_active_signal"] is True
        assert data["trades"][-1]["status"] == "OPEN"
        assert any(m.get("isActive") is True for m in data["markers"])

def test_klines_endpoint(client):
    for tf in ["30m", "1h", "4h", "1d"]:
        res = client.get(f"/api/klines?timeframe={tf}&limit=100")
        assert res.status_code == 200
        data = res.json()
        assert len(data["candles"]) == 100
        assert data["candles"][-1]["close"] > 50000.0

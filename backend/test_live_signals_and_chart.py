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
    from live_signal_engine import live_signal_engine
    all_strategies = [
        "pippo-30m-alpha", "pippo-1h-enhanced", "pippo-4h-original",
        "pippo-30m-scalp", "pippo-30m-new-gen", "pippo-30m-grd"
    ]
    for sid in all_strategies:
        res = client.get(f"/api/strategies/{sid}")
        assert res.status_code == 200
        data = res.json()
        assert data["id"] == sid

        # State-Aware Dynamic Contract Test (Countermeasure 2)
        model = live_signal_engine.get_model(sid)
        if model and model.position_status == "OPEN":
            assert data["has_active_signal"] is True
            assert data["trades"][-1]["status"] in ["OPEN", "RUNNING"]
            assert any(m.get("isActive") is True for m in data.get("markers", []))
        elif model and model.position_status == "FLAT":
            assert data["has_active_signal"] is False
            assert data["trades"][-1]["status"] == "CLOSED"

def test_pippo_30m_new_gen_details(client):
    res = client.get("/api/strategies/pippo-30m-new-gen")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Pippo 30m New Gen"
    assert data["timeframe"] == "30m"
    assert data["type"] == "LONG"
    assert data["metrics"]["total_trades"] == 443
    assert data["metrics"]["win_rate_pct"] == 34.99
    assert data["metrics"]["profit_factor"] in [1.80, 1.96, 1.98, 2.0]
    assert len(data["yearly_stats"]) == 7
    # Verify all 7 years are positive
    assert all(y["total_return_pct"] > 0 for y in data["yearly_stats"])
    
    # Verify closed trade #443 (autonomous confirmation of exit via Force Close MA)
    last_trade = data["trades"][-1]
    assert last_trade["trade_no"] == 443
    assert last_trade["status"] == "CLOSED"
    assert last_trade["exit_price"] == 85854.33
    assert last_trade["exit_reason"] == "Force Close MA (-0.5%)"
    assert last_trade["net_return_pct"] == 5.58
    assert data["has_active_signal"] is False

def test_pippo_30m_grd_details(client):
    res = client.get("/api/strategies/pippo-30m-grd")
    assert res.status_code == 200
    data = res.json()
    assert data["name"] == "Pippo 30m Grd"
    assert data["timeframe"] == "30m"
    assert data["type"] == "LONG"
    assert data["metrics"]["total_trades"] == 725
    assert data["metrics"]["win_rate_pct"] in [32.83, 32.87, 32.73]
    assert len(data["yearly_stats"]) == 7
    
    # Verify closed trade #725 (autonomous confirmation of exit via Force Close MA)
    last_trade = data["trades"][-1]
    assert last_trade["trade_no"] == 725
    assert last_trade["status"] == "CLOSED"
    assert last_trade["exit_price"] == 85854.33
    assert last_trade["exit_reason"] == "Force Close MA (-0.5%)"
    assert last_trade["net_return_pct"] == 5.58
    assert data["has_active_signal"] is False

def test_klines_endpoint(client):
    for tf in ["30m", "1h", "4h", "1d"]:
        res = client.get(f"/api/klines?timeframe={tf}&limit=100")
        assert res.status_code == 200
        data = res.json()
        assert len(data["candles"]) == 100
        assert data["candles"][-1]["close"] > 50000.0

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

def test_eth_strategies_catalog(client):
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

def test_eth_strategy_detail_endpoint(client):
    res = client.get("/api/strategies/pippo-30m-alpha?symbol=ETHUSDT")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == "pippo-30m-alpha"
    assert 120 <= data["metrics"]["total_trades"] <= 160
    assert 120 <= len(data["trades"]) <= 160

    # Non-existent strategy
    res404 = client.get("/api/strategies/non-existent-strat?symbol=ETHUSDT")
    assert res404.status_code == 404

def test_floor_with_eth_regime(client):
    res = client.get("/api/floor")
    assert res.status_code == 200
    data = res.json()
    assert "market_regime" in data
    assert "eth_market_regime" in data
    assert data["market_regime"]["weekly_ma55"] > 50000.0 # BTC
    assert 2000.0 < data["eth_market_regime"]["weekly_ma55"] < 4000.0 # ETH MA55 (~2648.68)

def test_autonomous_buy_execution_and_breakeven_lock(client):
    """Verify that Long engines track PnL, lock Breakeven (+0.2%), and execute Take Profit / Stop Loss autonomously."""
    from live_signal_engine import live_signal_engine, StrategyModel
    
    # Create test model
    model = StrategyModel(
        strat_id="test-long-algo",
        name="Test Long Runner",
        tf="30m",
        direction="LONG",
        config={"sl_pct": 0.05, "be_pct": 0.03, "tp_pct": 0.20},
        symbol="BTCUSDT"
    )
    live_signal_engine.strategies["test-long-algo"] = model
    
    # 1. Open Position (Simulate BUY signal)
    try:
        # 1. Open Position (Simulate BUY signal)
        entry_price = 80000.0
        ticket = live_signal_engine._open_position(model, entry_price)
        assert ticket["action"] == "BUY"
        assert ticket["direction"] == "LONG"
        assert model.position_status == "OPEN"
        assert model.current_sl == 76000.0 # -5%
        assert model.be_active is False

        # 2. Simulate price advance by +3.5% (triggers Breakeven lock)
        now_ts = 1774300000
        be_price = 80000.0 * 1.035 # 82,800
        events = live_signal_engine.on_ticker_tick(be_price, now_ts, symbol="BTCUSDT")
        
        be_events = [e for e in events if e.get("type") == "BREAKEVEN_LOCKED" and e.get("strategy_id") == "test-long-algo"]
        assert len(be_events) == 1
        assert model.be_active is True
        assert model.current_sl == 80160.0 # +0.2% locked above entry 80,000!

        # 3. Simulate price drop to hit Breakeven stop loss
        exit_events = live_signal_engine.on_ticker_tick(80150.0, now_ts + 10, symbol="BTCUSDT")
        closed = [e for e in exit_events if e.get("type") == "POSITION_CLOSED" and e.get("strategy_id") == "test-long-algo"]
        assert len(closed) == 1
        assert model.position_status == "FLAT"
        assert closed[0]["trade"]["reason"] == "Fast_Breakeven"
        assert closed[0]["trade"]["net_return_pct"] >= 0.0 # Profit preserved!
    finally:
        # Cleanup
        live_signal_engine.strategies.pop("test-long-algo", None)

def test_autonomous_short_execution_and_take_profit(client):
    """Verify that Short engines track PnL, lock Breakeven, and execute Take Profit autonomously on ETH."""
    from live_signal_engine import live_signal_engine, StrategyModel
    
    model = StrategyModel(
        strat_id="test-short-eth",
        name="Test Short ETH",
        tf="30m",
        direction="SHORT",
        config={"sl_pct": 0.05, "be_pct": 0.02, "tp_pct": 0.10},
        symbol="ETHUSDT"
    )
    live_signal_engine.strategies_eth["test-short-eth"] = model

    try:
        # 1. Open Position (Simulate SELL signal)
        entry_price = 2800.0
        ticket = live_signal_engine._open_position(model, entry_price)
        assert ticket["action"] == "SELL"
        assert ticket["direction"] == "SHORT"
        assert ticket["symbol"] == "ETH/USDT"
        assert model.current_sl == 2940.0 # +5% for short

        # 2. Simulate price drop by 2.5% (triggers short Breakeven lock)
        now_ts = 1774300000
        events = live_signal_engine.on_ticker_tick(2730.0, now_ts, symbol="ETHUSDT")
        be_events = [e for e in events if e.get("type") == "BREAKEVEN_LOCKED" and e.get("strategy_id") == "test-short-eth"]
        assert len(be_events) == 1
        assert model.be_active is True
        assert model.current_sl == 2794.4 # -0.2% locked below entry 2,800!

        # 3. Simulate price drop to hit Take Profit (10% down -> 2,520)
        tp_events = live_signal_engine.on_ticker_tick(2510.0, now_ts + 20, symbol="ETHUSDT")
        closed = [e for e in tp_events if e.get("type") == "POSITION_CLOSED" and e.get("strategy_id") == "test-short-eth"]
        assert len(closed) == 1
        assert model.position_status == "FLAT"
        assert closed[0]["trade"]["reason"] == "Take_Profit"
        assert closed[0]["trade"]["net_return_pct"] > 9.0 # ~10% gain - fees!
    finally:
        # Cleanup
        live_signal_engine.strategies_eth.pop("test-short-eth", None)

def test_multi_asset_signals_endpoints(client):
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
    assert ticket["entry_price"] > 0
    assert "stop_loss" in ticket
    assert "take_profit" in ticket

    # 4. Simulate signal on ETH
    res_sim = client.post("/api/floor/simulate-signal?strategy_id=pippo-30m-alpha&symbol=ETHUSDT")
    assert res_sim.status_code == 200
    sim_data = res_sim.json()
    assert sim_data["ticket"]["symbol"] == "ETH/USDT"
    assert sim_data["ticket"]["asset"] == "ETHUSDT"





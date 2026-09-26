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

def test_closed_trade_and_marker_contract_is_canonical(client):
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

def test_live_telemetry_restores_latest_closed_trade_after_initialization(client):
    res = client.get("/api/signals/live")
    assert res.status_code == 200
    strategy = next(item for item in res.json()["strategies"] if item["strategy_id"] == "pippo-30m-new-gen")
    assert strategy["last_closed_trade"] is not None
    assert strategy["last_closed_trade"]["status"] == "CLOSED"

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
        assert data["data_source"].startswith("local_parquet")
        assert len(data["candles"]) == 100
        assert data["candles"][-1]["close"] > 50000.0

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
        assert actual["time"] == expected["time"]
        assert actual["close"] == expected["close"]
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

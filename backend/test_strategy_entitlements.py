from entitlements import (
    has_pro_access,
    redact_live_telemetry,
    redact_live_ticket,
    redact_floor_state,
    redact_broadcast_message,
    redact_strategy_payload,
)


def test_free_payload_removes_restricted_fields_and_declares_entitlements():
    source = {
        "id": "pippo-30m-grd",
        "logic_summary": "secret thesis",
        "recommended_for": "secret profile",
        "parameters": {"entry_swing": "36 bars"},
        "active_ticket": {
            "entry_price": 100,
            "stop_loss": 95,
            "take_profit": 120,
            "breakeven_trigger": 102,
        },
        "trades": [{
            "trade_no": 1,
            "stop_loss": 95,
            "take_profit": 120,
            "entry_price": 100,
            "exit_reason": "Force Close MA (-0.5%)",
            "reason": "Force Close MA (-0.5%)",
        }],
        "markers": [{
            "eventType": "exit",
            "tradeNo": 1,
            "exitPrice": 100,
            "reason": "Force Close MA (-0.5%)",
            "text": "EXIT Force Close MA (-0.5%) #1",
        }, {
            "eventType": "breakeven",
            "isBreakeven": True,
            "exitPrice": 102,
            "text": "BE LOCKED @ $102",
        }],
        "metrics": {"total_trades": 727},
    }

    result = redact_strategy_payload(source, is_pro=False)

    assert result["logic_summary"] is None
    assert result["recommended_for"] is None
    assert result["parameters"] is None
    assert result["entitlements"] == {
        "strategy_logic": False,
        "execution_parameters": False,
    }
    assert result["restricted_content"] == {
        "reason": "pro_only",
        "label": "ONLY FOR PRO USERS",
    }
    assert result["active_ticket"] is None
    assert "stop_loss" not in result["trades"][0]
    assert "take_profit" not in result["trades"][0]
    assert result["trades"][0]["exit_reason"] == "Regime Exit"
    assert result["trades"][0]["reason"] == "Regime Exit"
    assert result["markers"][0]["text"] == "EXIT #1"
    assert result["markers"][0]["reason"] == "Regime Exit"
    assert "Force Close MA" not in result["markers"][0]["text"]
    assert result["markers"][1:] == []
    assert source["parameters"] == {"entry_swing": "36 bars"}


def test_pro_payload_keeps_restricted_fields_and_declares_entitlements():
    source = {
        "logic_summary": "secret thesis",
        "recommended_for": "secret profile",
        "parameters": {"entry_swing": "36 bars"},
        "active_ticket": {"stop_loss": 95, "take_profit": 120},
        "trades": [{"stop_loss": 95, "take_profit": 120}],
        "markers": [{"eventType": "breakeven", "exitPrice": 102}],
    }

    result = redact_strategy_payload(source, is_pro=True)

    assert result["logic_summary"] == source["logic_summary"]
    assert result["recommended_for"] == source["recommended_for"]
    assert result["parameters"] == source["parameters"]
    assert result["active_ticket"] == source["active_ticket"]
    assert result["trades"] == source["trades"]
    assert result["markers"] == source["markers"]
    assert result["entitlements"] == {
        "strategy_logic": True,
        "execution_parameters": True,
    }
    assert "restricted_content" not in result


def test_pro_access_requires_explicit_active_plan_and_respects_expiry():
    assert has_pro_access({"app_metadata": {"plan": "pro"}}) is False
    assert has_pro_access({"app_metadata": {"role": "PRO"}, "subscription_status": "active"}) is True
    assert has_pro_access({"user_metadata": {"plan": "pro"}}) is False
    assert has_pro_access({"app_metadata": {"plan": "free"}}) is False
    assert has_pro_access({"app_metadata": {"plan": "pro"}, "subscription_status": "cancelled"}) is False
    assert has_pro_access({"app_metadata": {"plan": "pro"}, "subscription_status": "pending"}) is False
    assert has_pro_access({"app_metadata": {"plan": "pro", "pro_expires_at": "not-a-date"}}) is False
    assert has_pro_access(
        {"app_metadata": {"plan": "pro", "pro_expires_at": "2020-01-01T00:00:00Z"}},
        now=1_700_000_000_000,
    ) is False


def test_free_live_payload_hides_execution_targets_but_keeps_public_context():
    telemetry = {
        "symbol": "BTCUSDT",
        "current_price": 100,
        "macro_state": {
            "weekly_ma55": 83309.0,
            "sma111_4h": 78753.0,
            "ema50_1h": 77759.0,
            "regime_description": "MACRO DISCOUNT (Bearish Bias below Weekly MA55)",
        },
        "strategies": [{
            "strategy_id": "pippo-30m-grd",
            "direction": "LONG",
            "position_status": "OPEN",
            "current_price": 100,
            "entry_price": 99,
            "stop_loss": 95,
            "take_profit": 120,
            "next_entry_trigger": 101,
            "structural_floor": 97,
            "major_swing_level": 102,
            "entry_confluence_ok": True,
            "exit_confluence_ok": True,
            "distance_to_trigger_pct": 1.0,
            "regime_aligned": True,
            "last_closed_trade": {
                "status": "CLOSED",
                "entry_price": 90,
                "exit_price": 91,
                "exit_time": "2026-01-01 01:00:00",
                "stop_loss": 85,
                "take_profit": 110,
            },
        }],
    }

    result = redact_live_telemetry(telemetry, is_pro=False)
    strategy = result["strategies"][0]
    assert strategy["position_status"] == "HIDDEN"
    assert strategy["current_price"] == 100
    for key in (
        "entry_price", "stop_loss", "take_profit", "next_entry_trigger",
        "structural_floor", "major_swing_level", "entry_confluence_ok",
        "exit_confluence_ok", "distance_to_trigger_pct", "regime_aligned",
    ):
        assert key not in strategy
    assert "last_closed_trade" not in strategy
    assert result["macro_state"] == {"status": "PROTECTED"}
    assert result["entitlements"]["execution_parameters"] is False


def test_free_live_ticket_hides_execution_targets():
    ticket = {
        "direction": "LONG",
        "current_price": 100,
        "entry_price": 99,
        "stop_loss": 95,
        "stop_loss_pct": -5,
        "breakeven_trigger": 102,
        "breakeven_trigger_pct": 3,
        "take_profit": 120,
        "take_profit_pct": 20,
        "risk_reward_ratio": "4x",
        "trigger_distance_pct": 1,
        "regime_aligned": True,
    }

    result = redact_live_ticket(ticket, is_pro=False)
    assert result["current_price"] == 100
    assert result["status"] == "PROTECTED"
    for key in (
        "entry_price", "stop_loss", "stop_loss_pct", "breakeven_trigger",
        "breakeven_trigger_pct", "take_profit", "take_profit_pct",
        "risk_reward_ratio", "trigger_distance_pct", "regime_aligned",
    ):
        assert key not in result
    assert result["restricted_content"]["reason"] == "pro_only"


def test_free_floor_state_keeps_context_but_redacts_agent_execution_levels():
    state = {
        "market_regime": {
            "status": "MACRO_DISCOUNT",
            "weekly_ma55": 83309.0,
            "distance_pct": -6.66,
        },
        "eth_market_regime": {
            "status": "MACRO_DISCOUNT",
            "weekly_ma55": 2648.68,
            "distance_pct": -0.13,
        },
        "signal_ticket": {"direction": "LONG", "entry_price": 100, "stop_loss": 95, "take_profit": 120},
        "agents": [
            {"id": "quant", "speech_bubble": "Entry 100 / floor 95", "reasoning_log": ["Take profit 120"]},
            {"id": "trader", "speech_bubble": "Stop 95", "reasoning_log": ["BE 102"]},
            {"id": "researcher", "speech_bubble": "Macro context", "reasoning_log": ["Liquidity stable"]},
            {"id": "informan", "speech_bubble": "Weekly MA55: $83,309", "reasoning_log": ["MA55 83309"]},
        ],
        "telemetry": {
            "strategies": [{"stop_loss": 95, "take_profit": 120, "next_entry_trigger": 101}],
        },
    }

    result = redact_floor_state(state, is_pro=False)
    assert result["signal_ticket"]["status"] == "PROTECTED"
    assert "entry_price" not in result["signal_ticket"]
    assert "stop_loss" not in result["signal_ticket"]
    assert "take_profit" not in result["signal_ticket"]
    assert result["market_regime"] == {"status": "PROTECTED"}
    assert result["eth_market_regime"] == {"status": "PROTECTED"}
    assert result["agents"][0]["reasoning_log"] == ["Exact entry, protection, and target levels are reserved for Pro users."]
    assert result["agents"][1]["speech_bubble"] == "Pro-only live execution telemetry."
    assert result["agents"][2]["speech_bubble"] == "Pro-only live execution telemetry."
    assert result["agents"][3]["reasoning_log"] == ["Exact entry, protection, and target levels are reserved for Pro users."]
    assert "stop_loss" not in result["telemetry"]["strategies"][0]


def test_public_broadcast_redacts_signal_ticket_and_partial_execution_levels():
    event = {
        "type": "PARTIAL_TAKE_PROFIT",
        "ticket": {"entry_price": 100, "stop_loss": 95, "take_profit": 120},
        "price": 110,
        "new_stop_loss": 101,
        "partial_pct": 50,
        "remaining_pct": 50,
        "trade": {"entry_price": 100, "stop_loss": 95, "take_profit": 120},
    }

    result = redact_broadcast_message(event)
    assert result is None


def test_free_strategy_payload_drops_open_trades_and_live_markers():
    source = {
        "id": "eth-live-test",
        "trades": [
            {
                "trade_no": 1,
                "status": "CLOSED",
                "entry_time": "2026-01-01 00:00:00",
                "exit_time": "2026-01-01 01:00:00",
                "entry_price": 100,
                "exit_price": 101,
                "exit_reason": "Structure_Exit",
            },
            {
                "trade_no": 2,
                "status": "OPEN",
                "exit_time": "RUNNING",
                "entry_price": 200,
                "is_active": True,
            },
        ],
        "markers": [
            {"eventType": "entry", "tradeNo": 1, "entryPrice": 100, "text": "ENTRY #1"},
            {"eventType": "entry", "tradeNo": 2, "isActive": True, "status": "OPEN", "entryPrice": 200, "text": "ACTIVE LONG @ $200"},
            {"eventType": "exit", "tradeNo": 1, "exitPrice": 101, "text": "EXIT Structure_Exit #1", "reason": "Structure_Exit"},
        ],
    }

    result = redact_strategy_payload(source, is_pro=False)

    assert [trade["trade_no"] for trade in result["trades"]] == [1]
    assert all(str(trade.get("status", "")).upper() not in {"OPEN", "RUNNING"} for trade in result["trades"])
    assert [marker.get("tradeNo") for marker in result["markers"]] == [1, 1]
    assert all(marker.get("isActive") is not True for marker in result["markers"])
    assert all(str(marker.get("status", "")).upper() != "OPEN" for marker in result["markers"])
    assert all("ACTIVE LONG" not in str(marker.get("text", "")) for marker in result["markers"])
    assert all("Structure_Exit" not in str(marker.get("text", "")) for marker in result["markers"])

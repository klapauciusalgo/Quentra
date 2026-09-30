"""Entitlement resolution and strategy response redaction."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Mapping

DENIED_STATUSES = {
    "inactive",
    "cancelled",
    "canceled",
    "expired",
    "suspended",
    "past_due",
}
ACTIVE_STATUSES = {"active", "trialing"}
TERMINAL_TRADE_STATUSES = {"closed", "exited", "flat"}
LIVE_TRADE_STATUSES = {"open", "running", "active", "in_position"}

RESTRICTED_TRADE_KEYS = {
    "stop_loss",
    "take_profit",
    "breakeven_trigger",
    "breakeven_trigger_pct",
}
PUBLIC_TRADE_KEYS = {
    "trade_no",
    "side",
    "type",
    "entry_time",
    "exit_time",
    "entry_price",
    "exit_price",
    "gross_return_pct",
    "net_return_pct",
    "exit_reason",
    "reason",
    "status",
}
RESTRICTED_MARKER_EVENTS = {"breakeven", "stop_loss", "take_profit"}
PUBLIC_MARKER_KEYS = {
    "time",
    "position",
    "color",
    "shape",
    "text",
    "size",
    "entryPrice",
    "exitPrice",
    "pnlPct",
    "tradeNo",
    "side",
    "eventType",
    "reason",
}
RESTRICTED_LIVE_KEYS = {
    "entry_price",
    "entry_time",
    "floating_pnl_pct",
    "stop_loss",
    "take_profit",
    "partial_exit_price",
    "next_entry_trigger",
    "structural_floor",
    "major_swing_level",
    "entry_confluence_ok",
    "exit_confluence_ok",
    "distance_to_trigger_pct",
    "regime_aligned",
    "be_active",
    "partial_taken",
}
PUBLIC_LIVE_STRATEGY_KEYS = {
    "strategy_id",
    "name",
    "timeframe",
    "position_status",
    "current_price",
    "recent_trades_count",
}
RESTRICTED_TICKET_KEYS = {
    "entry_price",
    "stop_loss",
    "stop_loss_pct",
    "breakeven_trigger",
    "breakeven_trigger_pct",
    "take_profit",
    "take_profit_pct",
    "risk_reward_ratio",
    "trigger_distance_pct",
    "regime_aligned",
}


def _read(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, Mapping):
        return value.get(key, default)
    return getattr(value, key, default)


def _first_defined(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower()


def _timestamp_ms(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number > 10_000_000_000 else number * 1000
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp() * 1000


def has_pro_access(user: Any, now: int | float | None = None) -> bool:
    """Return true only for an explicit, non-expired Pro entitlement."""
    if user is None:
        return False

    app_metadata = _read(user, "app_metadata", {}) or {}
    subscription = _read(user, "subscription", {}) or {}

    plan = _normalized(_first_defined(
        _read(subscription, "plan"),
        _read(app_metadata, "plan"),
        _read(app_metadata, "role"),
    ))
    if plan != "pro":
        return False

    status = _normalized(_first_defined(
        _read(user, "subscription_status"),
        _read(user, "status"),
        _read(subscription, "status"),
        _read(app_metadata, "subscription_status"),
    ))
    if status not in ACTIVE_STATUSES:
        return False

    expires_at = _first_defined(
        _read(subscription, "pro_expires_at"),
        _read(subscription, "expires_at"),
        _read(app_metadata, "pro_expires_at"),
        _read(app_metadata, "expires_at"),
    )
    expiry_ms = _timestamp_ms(expires_at)
    if expires_at is not None and expiry_ms is None:
        return False
    current_ms = float(now if now is not None else datetime.now(tz=timezone.utc).timestamp() * 1000)
    if expiry_ms is not None and expiry_ms <= current_ms:
        return False

    return True


def _public_exit_reason(value: Any) -> Any:
    if value is None:
        return value
    text = str(value)
    normalized = text.strip().lower().replace("_", " ")
    if "breakeven" in normalized or "be locked" in normalized or normalized.startswith("be "):
        return "Protected Exit"
    if (
        "force close" in normalized
        or "regime" in normalized
        or "structure" in normalized
        or "choc" in normalized
        or "ma55" in normalized
        or normalized.endswith(" ma")
    ):
        return "Regime Exit"
    if "stop loss" in normalized or normalized.startswith("stop"):
        return "Risk Exit"
    if "take profit" in normalized or normalized.startswith("tp"):
        return "Target Exit"
    return "Market Exit"


def _is_live_trade(trade: Mapping[str, Any]) -> bool:
    status = _normalized(trade.get("status"))
    return (
        status in LIVE_TRADE_STATUSES
        or _normalized(trade.get("position_status")) in LIVE_TRADE_STATUSES
        or _normalized(trade.get("exit_time")) == "running"
        or trade.get("is_active") is True
        or trade.get("isActive") is True
    )


def _is_terminal_trade(trade: Mapping[str, Any]) -> bool:
    if _is_live_trade(trade):
        return False
    status = _normalized(trade.get("status"))
    if status in TERMINAL_TRADE_STATUSES:
        return True
    return bool(
        trade.get("exit_time")
        or trade.get("exit_price") is not None
        or trade.get("exit_reason")
        or trade.get("reason")
    )


def _redact_trade(trade: Any) -> dict[str, Any] | None:
    if not isinstance(trade, Mapping) or not _is_terminal_trade(trade):
        return None
    result = {
        key: deepcopy(trade[key])
        for key in PUBLIC_TRADE_KEYS
        if key in trade
    }
    result.setdefault("status", "CLOSED")
    if "exit_reason" in result:
        result["exit_reason"] = _public_exit_reason(result["exit_reason"])
    if "reason" in result:
        result["reason"] = _public_exit_reason(result["reason"])
    return result


def redact_trade_payload(trade: Mapping[str, Any], is_pro: bool) -> dict[str, Any] | None:
    """Return a closed-trade payload appropriate for the caller's entitlement."""
    result = deepcopy(dict(trade))
    return result if is_pro else _redact_trade(result)


def _redact_marker(marker: Any, allowed_trade_numbers: set[str] | None = None) -> dict[str, Any] | None:
    if not isinstance(marker, Mapping):
        return None
    event_type = _normalized(marker.get("eventType", marker.get("event_type")))
    text = _normalized(marker.get("text"))
    if (
        marker.get("isBreakeven")
        or event_type in RESTRICTED_MARKER_EVENTS
        or "breakeven" in text
        or "be locked" in text
        or text.startswith("active ")
        or _normalized(marker.get("status")) in LIVE_TRADE_STATUSES
        or _normalized(marker.get("position_status")) in LIVE_TRADE_STATUSES
        or marker.get("is_active") is True
        or marker.get("isActive") is True
    ):
        return None
    trade_no = marker.get("tradeNo", marker.get("trade_no"))
    if allowed_trade_numbers is not None and trade_no is not None:
        if str(trade_no) not in allowed_trade_numbers:
            return None
    result = {
        key: deepcopy(marker[key])
        for key in PUBLIC_MARKER_KEYS
        if key in marker
    }
    if "reason" in result:
        result["reason"] = _public_exit_reason(result["reason"])
    if event_type in {"exit", "close"} or text.startswith("exit ") or text.startswith("close "):
        result["text"] = f"EXIT #{trade_no}" if trade_no is not None else "EXIT"
        result["eventType"] = "exit"
    elif event_type == "entry":
        result["text"] = f"ENTRY #{trade_no}" if trade_no is not None else "ENTRY"
        result["eventType"] = "entry"
    return result


def _redact_trades(trades: Any) -> list[dict[str, Any]]:
    if not isinstance(trades, list):
        return []
    return [redacted for trade in trades if (redacted := _redact_trade(trade)) is not None]


def _redact_markers(markers: Any, allowed_trade_numbers: set[str] | None = None) -> list[dict[str, Any]]:
    if not isinstance(markers, list):
        return []
    return [
        redacted
        for marker in markers
        if (redacted := _redact_marker(marker, allowed_trade_numbers)) is not None
    ]


def _restricted_content() -> dict[str, str]:
    return {
        "reason": "pro_only",
        "label": "ONLY FOR PRO USERS",
    }


def redact_live_telemetry(payload: Mapping[str, Any], is_pro: bool) -> dict[str, Any]:
    """Redact exact live execution targets from non-Pro telemetry."""
    result = deepcopy(dict(payload))
    result["entitlements"] = {"execution_parameters": bool(is_pro)}
    if is_pro:
        result.pop("restricted_content", None)
        return result

    public_top_level_keys = {
        "symbol",
        "asset",
        "current_price",
        "current_btc_price",
        "current_eth_price",
        "strategies",
        "signals_available",
        "status",
        "timestamp",
        "updated_at",
        "entitlements",
    }
    result = {
        key: value
        for key, value in result.items()
        if key in public_top_level_keys
    }
    result["macro_state"] = {"status": "PROTECTED"}
    public_strategies = []
    for source_strategy in result.get("strategies", []):
        if not isinstance(source_strategy, dict):
            continue
        strategy = {
            key: deepcopy(source_strategy.get(key))
            for key in PUBLIC_LIVE_STRATEGY_KEYS
            if key in source_strategy
        }
        is_live = _is_live_trade(source_strategy)
        strategy["position_status"] = "HIDDEN" if is_live else "FLAT"
        public_strategies.append(strategy)
    result["strategies"] = public_strategies

    result["restricted_content"] = _restricted_content()
    return result


def redact_live_ticket(ticket: Mapping[str, Any] | None, is_pro: bool) -> dict[str, Any] | None:
    """Redact exact live ticket levels from non-Pro callers."""
    if ticket is None:
        return None
    result = deepcopy(dict(ticket))
    if is_pro:
        result.pop("restricted_content", None)
        return result

    result = {
        key: result.get(key)
        for key in ("symbol", "asset", "strategy_name", "strategy_id", "timeframe", "current_price")
        if key in result
    }
    result["status"] = "PROTECTED"
    result["restricted_content"] = _restricted_content()
    return result


def redact_floor_state(payload: Mapping[str, Any], is_pro: bool) -> dict[str, Any]:
    """Keep the public trading floor contextual without exposing live levels."""
    result = deepcopy(dict(payload))
    result["entitlements"] = {"execution_parameters": bool(is_pro)}
    if is_pro:
        result.pop("restricted_content", None)
        return result

    if "signal_ticket" in result:
        result["signal_ticket"] = redact_live_ticket(result["signal_ticket"], is_pro=False)
    if isinstance(result.get("telemetry"), Mapping):
        result["telemetry"] = redact_live_telemetry(result["telemetry"], is_pro=False)

    for regime_key in ("market_regime", "eth_market_regime"):
        if regime_key in result:
            result[regime_key] = {"status": "PROTECTED"}

    public_agents = []
    for source_agent in result.get("agents", []):
        if not isinstance(source_agent, dict):
            continue
        agent = {
            key: deepcopy(source_agent[key])
            for key in ("id", "name", "role", "color", "position")
            if key in source_agent
        }
        agent["speech_bubble"] = "Pro-only live execution telemetry."
        agent["reasoning_log"] = ["Exact entry, protection, and target levels are reserved for Pro users."]
        public_agents.append(agent)
    result["agents"] = public_agents

    result["active_agent_id"] = None
    result["restricted_content"] = _restricted_content()
    return result


def redact_broadcast_message(message: Mapping[str, Any]) -> dict[str, Any] | None:
    """Publish only public-safe market/floor events over the unauthenticated WS."""
    result = deepcopy(dict(message))
    event_type = _normalized(result.get("type"))
    if event_type in {
        "new_signal",
        "partial_take_profit",
        "breakeven_locked",
        "signal_exit",
        "position_closed",
    }:
        return None
    if "ticket" in result:
        result["ticket"] = redact_live_ticket(result["ticket"], is_pro=False)
    if "floor" in result and isinstance(result["floor"], Mapping):
        result["floor"] = redact_floor_state(result["floor"], is_pro=False)
    result.pop("trade", None)
    return result


def redact_strategy_payload(strategy: Mapping[str, Any], is_pro: bool) -> dict[str, Any]:
    """Return a response-safe strategy copy for the caller's entitlement."""
    result = deepcopy(dict(strategy))
    result["entitlements"] = {
        "strategy_logic": bool(is_pro),
        "execution_parameters": bool(is_pro),
    }

    if is_pro:
        result.pop("restricted_content", None)
        return result

    result["logic_summary"] = None
    result["recommended_for"] = None
    result["parameters"] = None
    result["active_ticket"] = None
    result["has_active_signal"] = False
    result["trades"] = _redact_trades(result.get("trades"))
    allowed_trade_numbers = {
        str(trade.get("trade_no"))
        for trade in result["trades"]
        if trade.get("trade_no") is not None
    }
    result["markers"] = _redact_markers(result.get("markers"), allowed_trade_numbers)
    result["restricted_content"] = _restricted_content()
    return result

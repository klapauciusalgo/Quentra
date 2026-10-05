from __future__ import annotations

from copy import deepcopy
from typing import Any


STRATEGY_BRANDING: dict[str, dict[str, str]] = {
    "pippo-30m-new-gen": {
        "name": "Novera",
        "short_name": "Novera",
        "subtitle": "30M New Cycle Momentum",
        "philosophy": "A new cycle for fresh momentum.",
    },
    "pippo-30m-grd": {
        "name": "Kairon",
        "short_name": "Kairon",
        "subtitle": "30M Precision Timing",
        "philosophy": "Enter the trend at the right moment.",
    },
    "pippo-30m-short-v2-a": {
        "name": "Noxara",
        "short_name": "Noxara",
        "subtitle": "30M Downside Signal",
        "philosophy": "Find weakness before it becomes visible.",
    },
    "pippo-30m-short-v2-b": {
        "name": "Velora",
        "short_name": "Velora",
        "subtitle": "30M Fast Downside",
        "philosophy": "Turn movement speed into downside edge.",
    },
    "pippo-30m-short-v2-c": {
        "name": "Sorevia",
        "short_name": "Sorevia",
        "subtitle": "30M Defensive Short",
        "philosophy": "Protect capital while conditions shift.",
    },
    "pippo-30m-alpha": {
        "name": "Aurelis",
        "short_name": "Aurelis",
        "subtitle": "30M Adaptive Alpha",
        "philosophy": "Find clarity inside market noise.",
    },
    "pippo-30m-scalp": {
        "name": "Tessara",
        "short_name": "Tessara",
        "subtitle": "30M Precision Scalp",
        "philosophy": "Small edges become meaningful when repeated.",
    },
    "pippo-1h-enhanced": {
        "name": "Elaris",
        "short_name": "Elaris",
        "subtitle": "1H Adaptive Structure",
        "philosophy": "Read market structure from a higher frame.",
    },
    "pippo-4h-original": {
        "name": "Orvane",
        "short_name": "Orvane",
        "subtitle": "4H Structural Trend",
        "philosophy": "Let the larger orbit shape the trade.",
    },
    "pure-macro-weekly-ma55": {
        "name": "Mavora",
        "short_name": "Mavora",
        "subtitle": "Weekly Macro Flow",
        "philosophy": "Follow the market's long current.",
    },
}


def get_strategy_branding(strategy_id: str) -> dict[str, str] | None:
    branding = STRATEGY_BRANDING.get(strategy_id)
    return dict(branding) if branding else None


def apply_strategy_branding(strategy: dict[str, Any]) -> dict[str, Any]:
    """Override stale human-facing names without changing strategy identity."""
    result = deepcopy(strategy)
    branding = get_strategy_branding(str(result.get("id", "")))
    if not branding:
        return result

    result.update(branding)

    def update_nested_names(value: Any) -> None:
        if isinstance(value, dict):
            if "strategy_name" in value:
                value["strategy_name"] = branding["name"]
            for child in value.values():
                update_nested_names(child)
        elif isinstance(value, list):
            for child in value:
                update_nested_names(child)

    update_nested_names(result)
    return result


def apply_catalog_branding(catalog: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [apply_strategy_branding(strategy) for strategy in catalog]

import json
from pathlib import Path

from strategy_branding import STRATEGY_BRANDING, apply_strategy_branding


EXPECTED_NAMES = {
    "pippo-30m-new-gen": "Novera",
    "pippo-30m-grd": "Kairon",
    "pippo-30m-short-v2-a": "Noxara",
    "pippo-30m-short-v2-b": "Velora",
    "pippo-30m-short-v2-c": "Sorevia",
    "pippo-30m-alpha": "Aurelis",
    "pippo-30m-scalp": "Tessara",
    "pippo-1h-enhanced": "Elaris",
    "pippo-4h-original": "Orvane",
    "pure-macro-weekly-ma55": "Mavora",
}


def test_branding_catalog_is_complete_and_stable():
    assert set(STRATEGY_BRANDING) == set(EXPECTED_NAMES)
    assert {strategy_id: value["name"] for strategy_id, value in STRATEGY_BRANDING.items()} == EXPECTED_NAMES
    assert all(value["short_name"] == value["name"] for value in STRATEGY_BRANDING.values())
    assert all(value["philosophy"] for value in STRATEGY_BRANDING.values())


def test_apply_strategy_branding_overrides_stale_remote_names_and_nested_ticket():
    source = {
        "id": "pippo-30m-alpha",
        "name": "Pippo 30M Alpha (Pure Runner)",
        "short_name": "30M Alpha Runner",
        "active_ticket": {
            "strategy_name": "Pippo 30M Alpha (Pure Runner)",
        },
        "last_signal": {
            "strategy_name": "Pippo 30M Alpha (Pure Runner)",
        },
    }

    result = apply_strategy_branding(source)

    assert result["name"] == "Aurelis"
    assert result["short_name"] == "Aurelis"
    assert result["philosophy"] == STRATEGY_BRANDING["pippo-30m-alpha"]["philosophy"]
    assert result["active_ticket"]["strategy_name"] == "Aurelis"
    assert result["last_signal"]["strategy_name"] == "Aurelis"
    assert source["name"] == "Pippo 30M Alpha (Pure Runner)"


def test_btc_and_eth_static_catalogs_use_the_brand_names():
    repo_root = Path(__file__).resolve().parents[1]
    for relative_path in (
        "backend/data/strategies.json",
        "backend/data/strategies_eth.json",
        "frontend/src/data/strategiesData.json",
        "frontend/src/data/strategiesData_eth.json",
    ):
        catalog = json.loads((repo_root / relative_path).read_text())
        names = {strategy["id"]: strategy["name"] for strategy in catalog}
        assert {strategy_id: names[strategy_id] for strategy_id in EXPECTED_NAMES} == EXPECTED_NAMES, relative_path

"""Market-wide scanning: fetch coins, filter junk, score, and rank."""

from __future__ import annotations

from dataclasses import dataclass

from .api import CoinGeckoClient
from .scoring import ScoreResult, compute_opportunity_score, is_stablecoin


@dataclass
class ScanResult:
    coin: dict
    score: ScoreResult


def scan_market(
    client: CoinGeckoClient,
    vs_currency: str = "usd",
    pages: int = 1,
    per_page: int = 250,
    min_volume: float = 100_000.0,
    min_market_cap: float = 1_000_000.0,
    exclude_stablecoins: bool = True,
) -> list[ScanResult]:
    """Fetch market data and return coins ranked by opportunity score, best first."""
    results: list[ScanResult] = []

    for coin in client.get_markets_pages(pages=pages, vs_currency=vs_currency, per_page=per_page):
        volume = coin.get("total_volume") or 0.0
        market_cap = coin.get("market_cap") or 0.0

        if volume < min_volume or market_cap < min_market_cap:
            continue
        if exclude_stablecoins and is_stablecoin(coin):
            continue

        score = compute_opportunity_score(coin)
        results.append(ScanResult(coin=coin, score=score))

    results.sort(key=lambda r: r.score.total, reverse=True)
    return results

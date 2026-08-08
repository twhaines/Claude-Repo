"""Deeper, per-coin research for shortlisted candidates.

Pulls the full coin profile (description, links, developer activity,
community engagement) and derives a small set of qualitative risk flags
to sit alongside the quantitative score from `scoring.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .api import CoinGeckoClient


@dataclass
class CoinResearch:
    coin_id: str
    name: str
    symbol: str
    summary: str
    homepage: str | None
    market_cap_rank: int | None
    current_price: float | None
    ath: float | None
    ath_change_percentage: float | None
    atl: float | None
    github_stars: int | None
    github_commits_4_weeks: int | None
    twitter_followers: int | None
    reddit_subscribers: int | None
    sentiment_up_pct: float | None
    risk_flags: list[str] = field(default_factory=list)


def _clean_description(raw_html: str, max_len: int = 400) -> str:
    text = raw_html.split("\n")[0] if raw_html else ""
    text = text.strip()
    if len(text) > max_len:
        text = text[: max_len - 1].rsplit(" ", 1)[0] + "…"
    return text or "No description available."


def _derive_risk_flags(detail: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    dev_data = detail.get("developer_data") or {}
    community = detail.get("community_data") or {}
    market_data = detail.get("market_data") or {}

    commits = dev_data.get("commit_count_4_weeks")
    if commits is not None and commits == 0:
        flags.append("No GitHub commits in the last 4 weeks -- development may be stalled")

    stars = dev_data.get("stars")
    if stars is not None and stars < 20:
        flags.append("Very small GitHub following -- limited external scrutiny")

    sentiment = detail.get("sentiment_votes_up_percentage")
    if sentiment is not None and sentiment < 40:
        flags.append(f"Negative community sentiment ({sentiment:.0f}% up-votes)")

    circulating = market_data.get("circulating_supply")
    total_supply = market_data.get("total_supply")
    if circulating and total_supply and total_supply > 0:
        unlocked_pct = circulating / total_supply * 100
        if unlocked_pct < 40:
            flags.append(
                f"Only {unlocked_pct:.0f}% of total supply is circulating -- future unlocks may pressure price"
            )

    if not dev_data and not community:
        flags.append("Limited on-chain/social metadata available -- verify independently")

    return flags


def research_coin(client: CoinGeckoClient, coin_id: str) -> CoinResearch:
    """Fetch and summarize deep-dive data for a single coin."""
    detail = client.get_coin(coin_id)

    description = (detail.get("description") or {}).get("en", "")
    links = detail.get("links") or {}
    homepage_list = links.get("homepage") or []
    homepage = next((h for h in homepage_list if h), None)

    market_data = detail.get("market_data") or {}
    dev_data = detail.get("developer_data") or {}
    community = detail.get("community_data") or {}

    def _first(mapping: dict, key: str) -> float | None:
        value = (mapping.get(key) or {}).get("usd") if isinstance(mapping.get(key), dict) else None
        return value

    research = CoinResearch(
        coin_id=coin_id,
        name=detail.get("name", coin_id),
        symbol=(detail.get("symbol") or "").upper(),
        summary=_clean_description(description),
        homepage=homepage,
        market_cap_rank=detail.get("market_cap_rank"),
        current_price=_first(market_data, "current_price"),
        ath=_first(market_data, "ath"),
        ath_change_percentage=_first(market_data, "ath_change_percentage"),
        atl=_first(market_data, "atl"),
        github_stars=dev_data.get("stars"),
        github_commits_4_weeks=dev_data.get("commit_count_4_weeks"),
        twitter_followers=community.get("twitter_followers"),
        reddit_subscribers=community.get("reddit_subscribers"),
        sentiment_up_pct=detail.get("sentiment_votes_up_percentage"),
    )
    research.risk_flags = _derive_risk_flags(detail)
    return research

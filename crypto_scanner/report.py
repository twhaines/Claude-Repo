"""Console and Markdown report generation."""

from __future__ import annotations

from datetime import datetime, timezone

from . import DISCLAIMER
from .research import CoinResearch
from .scanner import ScanResult


def _fmt_money(value: float | None) -> str:
    if value is None:
        return "n/a"
    if value >= 1:
        return f"${value:,.2f}"
    return f"${value:,.6f}"


def _fmt_pct(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:+.1f}%"


def print_console_report(ranked: list[ScanResult], researched: list[CoinResearch]) -> None:
    print("=" * 78)
    print("CRYPTO OPPORTUNITY SCAN")
    print("=" * 78)
    print(f"Scanned and scored {len(ranked)} coins. Top candidates:\n")

    header = f"{'#':>3} {'Symbol':<8} {'Score':>6} {'24h':>8} {'7d':>8} {'Price':>14}"
    print(header)
    print("-" * len(header))
    for i, result in enumerate(ranked[: max(len(researched), 10)], start=1):
        coin = result.coin
        print(
            f"{i:>3} {result.score.symbol:<8} {result.score.total:>6.1f} "
            f"{_fmt_pct(coin.get('price_change_percentage_24h_in_currency')):>8} "
            f"{_fmt_pct(coin.get('price_change_percentage_7d_in_currency')):>8} "
            f"{_fmt_money(coin.get('current_price')):>14}"
        )

    if researched:
        print("\n" + "=" * 78)
        print("DEEP-DIVE RESEARCH")
        print("=" * 78)
        for r in researched:
            print(f"\n### {r.name} ({r.symbol}) -- rank #{r.market_cap_rank}")
            print(f"Price: {_fmt_money(r.current_price)}  |  ATH: {_fmt_money(r.ath)} ({_fmt_pct(r.ath_change_percentage)})")
            print(f"Summary: {r.summary}")
            if r.homepage:
                print(f"Homepage: {r.homepage}")
            print(
                f"GitHub stars: {r.github_stars if r.github_stars is not None else 'n/a'}  |  "
                f"Commits (4w): {r.github_commits_4_weeks if r.github_commits_4_weeks is not None else 'n/a'}  |  "
                f"Sentiment up: {r.sentiment_up_pct if r.sentiment_up_pct is not None else 'n/a'}%"
            )
            if r.risk_flags:
                print("Risk flags:")
                for flag in r.risk_flags:
                    print(f"  - {flag}")

    print("\n" + "-" * 78)
    print(DISCLAIMER)
    print("-" * 78)


def write_markdown_report(
    path: str,
    ranked: list[ScanResult],
    researched: list[CoinResearch],
) -> None:
    lines: list[str] = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines.append(f"# Crypto Opportunity Scan -- {now}\n")
    lines.append(f"> {DISCLAIMER}\n")

    lines.append("## Top Ranked Coins\n")
    lines.append("| # | Symbol | Name | Score | 24h | 7d | Price | Market Cap |")
    lines.append("|---|--------|------|-------|-----|----|-------|------------|")
    for i, result in enumerate(ranked[: max(len(researched), 10)], start=1):
        coin = result.coin
        lines.append(
            f"| {i} | {result.score.symbol} | {coin.get('name')} | {result.score.total:.1f} | "
            f"{_fmt_pct(coin.get('price_change_percentage_24h_in_currency'))} | "
            f"{_fmt_pct(coin.get('price_change_percentage_7d_in_currency'))} | "
            f"{_fmt_money(coin.get('current_price'))} | {_fmt_money(coin.get('market_cap'))} |"
        )

    if researched:
        lines.append("\n## Deep-Dive Research\n")
        for r in researched:
            lines.append(f"### {r.name} ({r.symbol}) -- rank #{r.market_cap_rank}\n")
            lines.append(f"- **Price:** {_fmt_money(r.current_price)}")
            lines.append(f"- **ATH:** {_fmt_money(r.ath)} ({_fmt_pct(r.ath_change_percentage)})")
            lines.append(f"- **Summary:** {r.summary}")
            if r.homepage:
                lines.append(f"- **Homepage:** {r.homepage}")
            lines.append(
                f"- **GitHub:** {r.github_stars if r.github_stars is not None else 'n/a'} stars, "
                f"{r.github_commits_4_weeks if r.github_commits_4_weeks is not None else 'n/a'} commits (4w)"
            )
            lines.append(
                f"- **Community:** {r.twitter_followers if r.twitter_followers is not None else 'n/a'} Twitter "
                f"followers, {r.reddit_subscribers if r.reddit_subscribers is not None else 'n/a'} Reddit subscribers"
            )
            if r.sentiment_up_pct is not None:
                lines.append(f"- **Sentiment:** {r.sentiment_up_pct:.0f}% up-votes")
            if r.risk_flags:
                lines.append("- **Risk flags:**")
                for flag in r.risk_flags:
                    lines.append(f"  - {flag}")
            lines.append("")

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

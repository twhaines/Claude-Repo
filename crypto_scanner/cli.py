"""Command-line entry point.

Example:
    python -m crypto_scanner.cli --pages 2 --shortlist 8 --output reports/scan.md
"""

from __future__ import annotations

import argparse
import sys

from . import DISCLAIMER
from .api import CoinGeckoClient, CoinGeckoError
from .report import print_console_report, write_markdown_report
from .research import research_coin
from .scanner import scan_market


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crypto-scanner",
        description="Scan crypto markets and research coins with high potential upside.",
    )
    parser.add_argument("--vs-currency", default="usd", help="Quote currency (default: usd)")
    parser.add_argument("--pages", type=int, default=1, help="Market pages to scan, 250 coins/page (default: 1)")
    parser.add_argument("--per-page", type=int, default=250, help="Coins per page (default: 250, max 250)")
    parser.add_argument("--min-volume", type=float, default=100_000.0, help="Minimum 24h volume in quote currency")
    parser.add_argument("--min-market-cap", type=float, default=1_000_000.0, help="Minimum market cap in quote currency")
    parser.add_argument("--include-stablecoins", action="store_true", help="Don't filter out stablecoins")
    parser.add_argument("--shortlist", type=int, default=10, help="Number of top coins to deep-dive research (default: 10)")
    parser.add_argument("--output", default=None, help="Path to write a Markdown report (optional)")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    print(DISCLAIMER)
    print()

    client = CoinGeckoClient()

    try:
        print(f"Scanning market ({args.pages} page(s), {args.per_page}/page)...")
        ranked = scan_market(
            client,
            vs_currency=args.vs_currency,
            pages=args.pages,
            per_page=args.per_page,
            min_volume=args.min_volume,
            min_market_cap=args.min_market_cap,
            exclude_stablecoins=not args.include_stablecoins,
        )

        if not ranked:
            print("No coins matched the scan criteria. Try lowering --min-volume/--min-market-cap.")
            return 0

        shortlist = ranked[: args.shortlist]
        researched = []
        for i, result in enumerate(shortlist, start=1):
            print(f"Researching {result.score.symbol} ({i}/{len(shortlist)})...")
            try:
                researched.append(research_coin(client, result.score.coin_id))
            except CoinGeckoError as exc:
                print(f"  warning: could not fetch detail for {result.score.coin_id}: {exc}")

        print()
        print_console_report(ranked, researched)

        if args.output:
            write_markdown_report(args.output, ranked, researched)
            print(f"\nMarkdown report written to {args.output}")

    except CoinGeckoError as exc:
        print(f"Error talking to CoinGecko: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

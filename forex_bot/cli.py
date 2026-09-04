"""Command-line entry point for the forex trend-following practice bot.

Example:
    export OANDA_API_KEY=...
    export OANDA_ACCOUNT_ID=...
    python -m forex_bot.cli --instrument EUR_USD --once
"""

from __future__ import annotations

import argparse
import os
import sys

from . import DISCLAIMER
from .bot import BotConfig, run_loop
from .oanda_client import OandaClient, OandaError
from .strategy import StrategyConfig


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="forex-trend-bot",
        description="EMA-crossover trend-following bot for OANDA's practice (paper trading) environment.",
    )
    parser.add_argument("--instrument", default="EUR_USD", help="OANDA instrument (default: EUR_USD)")
    parser.add_argument("--granularity", default="H1", help="Candle granularity, e.g. M15/H1/H4/D (default: H1)")
    parser.add_argument("--fast-ema", type=int, default=12, help="Fast EMA period (default: 12)")
    parser.add_argument("--slow-ema", type=int, default=26, help="Slow EMA period (default: 26)")
    parser.add_argument("--atr-period", type=int, default=14, help="ATR period for stops (default: 14)")
    parser.add_argument("--atr-multiplier", type=float, default=2.0, help="Stop-loss distance in ATRs (default: 2.0)")
    parser.add_argument(
        "--reward-risk",
        type=float,
        default=2.0,
        help="Take-profit distance as a multiple of the stop distance (default: 2.0)",
    )
    parser.add_argument("--risk-pct", type=float, default=1.0, help="Percent of account balance risked per trade (default: 1.0)")
    parser.add_argument("--max-units", type=int, default=None, help="Cap on position size in units")
    parser.add_argument("--poll-interval", type=float, default=300.0, help="Seconds between decision cycles (default: 300)")
    parser.add_argument("--once", action="store_true", help="Run a single decision cycle and exit")
    parser.add_argument(
        "--place-orders",
        action="store_true",
        help="Actually submit orders to the OANDA practice account (default: preview only, no orders placed)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    print(DISCLAIMER)
    print()

    api_key = os.environ.get("OANDA_API_KEY")
    account_id = os.environ.get("OANDA_ACCOUNT_ID")
    if not api_key or not account_id:
        print(
            "Set OANDA_API_KEY and OANDA_ACCOUNT_ID (from a free OANDA fxPractice "
            "account) as environment variables before running.",
            file=sys.stderr,
        )
        return 1

    client = OandaClient(api_key, account_id)
    config = BotConfig(
        instrument=args.instrument,
        granularity=args.granularity,
        strategy=StrategyConfig(fast_period=args.fast_ema, slow_period=args.slow_ema, atr_period=args.atr_period),
        atr_multiplier=args.atr_multiplier,
        reward_risk_ratio=args.reward_risk,
        risk_pct=args.risk_pct,
        max_units=args.max_units,
        place_orders=args.place_orders,
    )

    if not args.place_orders:
        print("Running in PREVIEW mode -- no orders will be placed. Pass --place-orders to trade on the practice account.\n")

    try:
        run_loop(client, config, poll_interval_seconds=args.poll_interval, iterations=1 if args.once else None)
    except OandaError as exc:
        print(f"Error talking to OANDA: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nStopped.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

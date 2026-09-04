"""Live (practice-account) trading loop tying together data, signal, and orders.

Runs only against OANDA's fxPractice environment via `OandaClient`. By
default it operates in preview mode -- it prints what it would do but
does not place orders -- until `place_orders=True` is set explicitly.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from .indicators import atr as compute_atr
from .oanda_client import OandaClient, OandaError
from .risk import position_size, stop_loss_take_profit
from .strategy import Signal, StrategyConfig, generate_signal


@dataclass
class BotConfig:
    instrument: str = "EUR_USD"
    granularity: str = "H1"
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    atr_multiplier: float = 2.0
    reward_risk_ratio: float = 2.0
    risk_pct: float = 1.0
    max_units: int | None = None
    place_orders: bool = False


def _current_direction(trades: list[dict]) -> Signal:
    net_units = sum(int(t["currentUnits"]) for t in trades)
    if net_units > 0:
        return Signal.LONG
    if net_units < 0:
        return Signal.SHORT
    return Signal.FLAT


def run_once(client: OandaClient, config: BotConfig) -> list[str]:
    """Run a single decision cycle. Returns human-readable log lines."""
    log: list[str] = []
    candles = client.get_candles(config.instrument, config.granularity, count=200)
    if len(candles) < config.strategy.slow_period:
        log.append(f"Not enough candle history yet ({len(candles)} bars); skipping.")
        return log

    signal = generate_signal(candles, config.strategy)
    atr_series = compute_atr(candles, config.strategy.atr_period)
    current_atr = atr_series[-1]
    entry_price = candles[-1]["close"]

    open_trades = client.get_open_trades(config.instrument)
    current_direction = _current_direction(open_trades)

    log.append(
        f"{config.instrument} signal={signal.value} current_position={current_direction.value} "
        f"price={entry_price:.5f}"
    )

    if signal == current_direction:
        log.append("No change in trend -- holding.")
        return log

    if current_direction is not Signal.FLAT:
        log.append(f"Trend flipped: closing {len(open_trades)} existing trade(s).")
        if config.place_orders:
            for trade in open_trades:
                client.close_trade(trade["id"])
        else:
            log.append("  (preview only -- no orders placed)")

    if signal is Signal.FLAT or current_atr is None:
        return log

    stop, take_profit = stop_loss_take_profit(
        entry_price, current_atr, signal, config.atr_multiplier, config.reward_risk_ratio
    )

    account = client.get_account_summary()
    balance = float(account["balance"])
    units = position_size(balance, config.risk_pct, entry_price, stop, config.max_units)
    if units <= 0:
        log.append("Computed position size is 0 -- skipping entry (balance/risk too small).")
        return log
    if signal is Signal.SHORT:
        units = -units

    log.append(f"Opening {signal.value} {abs(units)} units, stop={stop:.5f}, take_profit={take_profit:.5f}")
    if config.place_orders:
        client.create_market_order(config.instrument, units, stop, take_profit)
    else:
        log.append("  (preview only -- no orders placed; pass --place-orders to submit to the practice account)")

    return log


def run_loop(
    client: OandaClient,
    config: BotConfig,
    poll_interval_seconds: float = 300.0,
    iterations: int | None = None,
) -> None:
    count = 0
    while iterations is None or count < iterations:
        try:
            for line in run_once(client, config):
                print(line)
        except OandaError as exc:
            print(f"OANDA error: {exc}")
        count += 1
        if iterations is None or count < iterations:
            time.sleep(poll_interval_seconds)

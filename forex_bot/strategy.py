"""Trend-following signal generation using an EMA crossover.

This is a standard, publicly documented technical strategy (fast/slow EMA
crossover) with an optional ATR-based volatility filter to sit out dead
markets. It is not a reproduction of any specific person's private
trading system -- no such system was publicly disclosed to examine.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .indicators import atr as compute_atr
from .indicators import ema as compute_ema


class Signal(str, Enum):
    LONG = "long"
    SHORT = "short"
    FLAT = "flat"


@dataclass
class StrategyConfig:
    fast_period: int = 12
    slow_period: int = 26
    atr_period: int = 14
    min_atr_pct: float = 0.0  # optional volatility floor (% of price); 0 disables it


def generate_signal(candles: list[dict], config: StrategyConfig | None = None) -> Signal:
    """Return the trend the fast/slow EMA crossover currently favors.

    LONG when the fast EMA is above the slow EMA, SHORT when below, FLAT
    when there isn't enough data yet or volatility is below the optional
    `min_atr_pct` floor.
    """
    config = config or StrategyConfig()
    closes = [c["close"] for c in candles]
    if len(closes) < config.slow_period:
        return Signal.FLAT

    fast = compute_ema(closes, config.fast_period)
    slow = compute_ema(closes, config.slow_period)
    if fast[-1] is None or slow[-1] is None:
        return Signal.FLAT

    if config.min_atr_pct > 0:
        atr_series = compute_atr(candles, config.atr_period)
        current_atr = atr_series[-1]
        if current_atr is None or current_atr / closes[-1] * 100 < config.min_atr_pct:
            return Signal.FLAT

    if fast[-1] > slow[-1]:
        return Signal.LONG
    if fast[-1] < slow[-1]:
        return Signal.SHORT
    return Signal.FLAT

"""Pure, network-free technical indicator calculations."""

from __future__ import annotations


def ema(values: list[float], period: int) -> list[float | None]:
    """Exponential moving average, seeded with an SMA of the first `period` values.

    Returns a list the same length as `values`; entries before the seed
    point are None since no EMA can be computed yet.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    if len(values) < period:
        return [None] * len(values)

    result: list[float | None] = [None] * (period - 1)
    seed = sum(values[:period]) / period
    result.append(seed)

    multiplier = 2 / (period + 1)
    prev = seed
    for value in values[period:]:
        current = (value - prev) * multiplier + prev
        result.append(current)
        prev = current
    return result


def true_range(prev_close: float, high: float, low: float) -> float:
    return max(high - low, abs(high - prev_close), abs(low - prev_close))


def atr(candles: list[dict], period: int = 14) -> list[float | None]:
    """Average True Range using Wilder's smoothing.

    Returns a list the same length as `candles`; entries before the seed
    point (the first candle, plus `period` true-range samples) are None.
    """
    if period <= 0:
        raise ValueError("period must be positive")
    if len(candles) < period + 1:
        return [None] * len(candles)

    trs = [
        true_range(candles[i - 1]["close"], candles[i]["high"], candles[i]["low"])
        for i in range(1, len(candles))
    ]

    result: list[float | None] = [None] * period
    seed = sum(trs[:period]) / period
    result.append(seed)

    prev = seed
    for tr in trs[period:]:
        current = (prev * (period - 1) + tr) / period
        result.append(current)
        prev = current
    return result

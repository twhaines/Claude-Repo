"""Position sizing and stop-loss/take-profit calculation.

Sizing risks a fixed percentage of account balance per trade, scaled by
the distance to the stop-loss -- a standard fixed-fractional approach.
"""

from __future__ import annotations

from .strategy import Signal


def stop_loss_take_profit(
    entry_price: float,
    atr: float,
    direction: Signal,
    atr_multiplier: float = 2.0,
    reward_risk_ratio: float = 2.0,
) -> tuple[float, float]:
    if direction not in (Signal.LONG, Signal.SHORT):
        raise ValueError("direction must be LONG or SHORT")
    if atr <= 0:
        raise ValueError("atr must be positive")

    stop_distance = atr * atr_multiplier
    reward_distance = stop_distance * reward_risk_ratio

    if direction is Signal.LONG:
        return entry_price - stop_distance, entry_price + reward_distance
    return entry_price + stop_distance, entry_price - reward_distance


def position_size(
    balance: float,
    risk_pct: float,
    entry_price: float,
    stop_loss_price: float,
    max_units: int | None = None,
) -> int:
    """Units to trade so a stop-out loses roughly `risk_pct`% of `balance`."""
    if balance <= 0:
        raise ValueError("balance must be positive")
    if not 0 < risk_pct <= 100:
        raise ValueError("risk_pct must be between 0 and 100")

    per_unit_risk = abs(entry_price - stop_loss_price)
    if per_unit_risk <= 0:
        raise ValueError("stop_loss_price must differ from entry_price")

    risk_amount = balance * (risk_pct / 100)
    units = int(round(risk_amount / per_unit_risk))
    if max_units is not None:
        units = min(units, max_units)
    return max(units, 0)

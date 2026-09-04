"""Forex Trend-Following Bot (paper trading only).

An EMA-crossover trend-following strategy with ATR-based stops, executed
only against OANDA's free fxPractice (paper trading) environment -- never
against a live-money account. There is no public, disclosed trading
algorithm from any specific individual or account that this reproduces;
it implements a standard, transparent technical strategy instead.
"""

DISCLAIMER = (
    "This bot is for educational/paper-trading purposes only. It trades "
    "exclusively against OANDA's practice (simulated money) environment. "
    "It implements a standard EMA-crossover trend-following strategy with "
    "ATR-based risk management -- it is not a guarantee of profit, and "
    "past or simulated performance does not predict future results. "
    "Never point this at a live-money account without independently "
    "validating and understanding the strategy and code yourself."
)

__all__ = ["DISCLAIMER"]

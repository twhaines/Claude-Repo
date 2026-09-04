import unittest

from forex_bot.backtest import run_backtest
from forex_bot.strategy import StrategyConfig


def make_candles(closes, pad=0.3):
    candles = []
    prev = closes[0]
    for c in closes:
        candles.append({"open": prev, "high": max(prev, c) + pad, "low": min(prev, c) - pad, "close": c})
        prev = c
    return candles


class TestRunBacktest(unittest.TestCase):
    def test_sustained_uptrend_produces_a_winning_long_trade(self):
        closes = [100 + i * 0.3 for i in range(80)]
        candles = make_candles(closes)
        result = run_backtest(candles, StrategyConfig(fast_period=5, slow_period=15, atr_period=10))
        self.assertGreaterEqual(result.num_trades, 1)
        self.assertGreater(result.total_return_pct, 0)

    def test_no_data_produces_no_trades(self):
        result = run_backtest([], StrategyConfig())
        self.assertEqual(result.num_trades, 0)
        self.assertEqual(result.win_rate, 0.0)


if __name__ == "__main__":
    unittest.main()

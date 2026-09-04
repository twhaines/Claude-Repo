import unittest

from forex_bot.strategy import Signal, StrategyConfig, generate_signal


def make_candles(closes, pad=0.5):
    candles = []
    prev = closes[0]
    for c in closes:
        candles.append({"open": prev, "high": max(prev, c) + pad, "low": min(prev, c) - pad, "close": c})
        prev = c
    return candles


class TestGenerateSignal(unittest.TestCase):
    def test_not_enough_data_is_flat(self):
        candles = make_candles([1, 2, 3])
        signal = generate_signal(candles, StrategyConfig(fast_period=5, slow_period=10))
        self.assertEqual(signal, Signal.FLAT)

    def test_uptrend_gives_long_signal(self):
        closes = [100 + i for i in range(60)]
        candles = make_candles(closes)
        signal = generate_signal(candles, StrategyConfig(fast_period=5, slow_period=15))
        self.assertEqual(signal, Signal.LONG)

    def test_downtrend_gives_short_signal(self):
        closes = [200 - i for i in range(60)]
        candles = make_candles(closes)
        signal = generate_signal(candles, StrategyConfig(fast_period=5, slow_period=15))
        self.assertEqual(signal, Signal.SHORT)

    def test_min_atr_filter_forces_flat_in_dead_market(self):
        closes = [100.0] * 60
        candles = make_candles(closes)
        for c in candles:
            c["high"] = c["close"]
            c["low"] = c["close"]
        config = StrategyConfig(fast_period=5, slow_period=15, min_atr_pct=1.0)
        signal = generate_signal(candles, config)
        self.assertEqual(signal, Signal.FLAT)


if __name__ == "__main__":
    unittest.main()

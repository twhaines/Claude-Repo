import unittest

from forex_bot.indicators import atr, ema


class TestEMA(unittest.TestCase):
    def test_short_series_returns_all_none(self):
        self.assertEqual(ema([1, 2, 3], 5), [None, None, None])

    def test_seed_is_sma_of_first_period(self):
        result = ema([1, 2, 3, 4, 5], 3)
        self.assertIsNone(result[0])
        self.assertIsNone(result[1])
        self.assertAlmostEqual(result[2], 2.0)  # SMA of 1, 2, 3

    def test_trending_series_ema_is_monotonic(self):
        values = list(range(1, 30))
        result = [v for v in ema(values, 5) if v is not None]
        self.assertTrue(all(b >= a for a, b in zip(result, result[1:])))


def make_candles(closes, pad=0.5):
    candles = []
    prev_close = closes[0]
    for c in closes:
        candles.append(
            {
                "open": prev_close,
                "high": max(prev_close, c) + pad,
                "low": min(prev_close, c) - pad,
                "close": c,
            }
        )
        prev_close = c
    return candles


class TestATR(unittest.TestCase):
    def test_short_series_returns_all_none(self):
        candles = make_candles([1, 2, 3])
        self.assertEqual(atr(candles, 14), [None, None, None])

    def test_atr_is_positive_once_seeded(self):
        candles = make_candles([100 + i * 0.5 for i in range(20)])
        result = atr(candles, 5)
        seeded = [v for v in result if v is not None]
        self.assertTrue(seeded)
        self.assertTrue(all(v > 0 for v in seeded))


if __name__ == "__main__":
    unittest.main()

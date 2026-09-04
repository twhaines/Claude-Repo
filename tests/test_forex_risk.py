import unittest

from forex_bot.risk import position_size, stop_loss_take_profit
from forex_bot.strategy import Signal


class TestStopLossTakeProfit(unittest.TestCase):
    def test_long_stop_below_entry_tp_above(self):
        stop, tp = stop_loss_take_profit(100.0, atr=1.0, direction=Signal.LONG, atr_multiplier=2.0, reward_risk_ratio=2.0)
        self.assertEqual(stop, 98.0)
        self.assertEqual(tp, 104.0)

    def test_short_stop_above_entry_tp_below(self):
        stop, tp = stop_loss_take_profit(100.0, atr=1.0, direction=Signal.SHORT, atr_multiplier=2.0, reward_risk_ratio=2.0)
        self.assertEqual(stop, 102.0)
        self.assertEqual(tp, 96.0)

    def test_rejects_flat_direction(self):
        with self.assertRaises(ValueError):
            stop_loss_take_profit(100.0, atr=1.0, direction=Signal.FLAT)

    def test_rejects_non_positive_atr(self):
        with self.assertRaises(ValueError):
            stop_loss_take_profit(100.0, atr=0.0, direction=Signal.LONG)


class TestPositionSize(unittest.TestCase):
    def test_basic_sizing(self):
        # risk 1% of 10,000 = 100; stop distance 0.0050 -> units = 100 / 0.005
        units = position_size(balance=10_000, risk_pct=1.0, entry_price=1.1000, stop_loss_price=1.0950)
        self.assertEqual(units, 20_000)

    def test_max_units_cap_applied(self):
        units = position_size(balance=10_000, risk_pct=1.0, entry_price=1.1000, stop_loss_price=1.0950, max_units=5000)
        self.assertEqual(units, 5000)

    def test_rejects_zero_stop_distance(self):
        with self.assertRaises(ValueError):
            position_size(balance=10_000, risk_pct=1.0, entry_price=1.10, stop_loss_price=1.10)

    def test_rejects_invalid_risk_pct(self):
        with self.assertRaises(ValueError):
            position_size(balance=10_000, risk_pct=0.0, entry_price=1.10, stop_loss_price=1.05)


if __name__ == "__main__":
    unittest.main()

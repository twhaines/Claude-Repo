import unittest

from crypto_scanner.scoring import compute_opportunity_score, is_stablecoin


def make_coin(**overrides):
    coin = {
        "id": "example-coin",
        "symbol": "ex",
        "name": "Example Coin",
        "current_price": 10.0,
        "market_cap": 500_000_000,
        "total_volume": 50_000_000,
        "price_change_percentage_24h_in_currency": 5.0,
        "price_change_percentage_7d_in_currency": 8.0,
        "price_change_percentage_30d_in_currency": 12.0,
        "ath_change_percentage": -50.0,
    }
    coin.update(overrides)
    return coin


class TestStablecoinDetection(unittest.TestCase):
    def test_known_symbol_flagged(self):
        self.assertTrue(is_stablecoin(make_coin(symbol="usdt", current_price=1.0, price_change_percentage_24h=0.01)))

    def test_price_pegged_flagged(self):
        self.assertTrue(
            is_stablecoin(make_coin(symbol="xyz", current_price=1.001, price_change_percentage_24h=0.05))
        )

    def test_volatile_coin_not_flagged(self):
        self.assertFalse(is_stablecoin(make_coin()))


class TestOpportunityScore(unittest.TestCase):
    def test_healthy_momentum_scores_above_baseline(self):
        result = compute_opportunity_score(make_coin())
        self.assertGreater(result.total, 50.0)
        self.assertEqual(result.symbol, "EX")

    def test_flat_coin_scores_near_midpoint(self):
        result = compute_opportunity_score(
            make_coin(
                price_change_percentage_24h_in_currency=0.0,
                price_change_percentage_7d_in_currency=0.0,
                price_change_percentage_30d_in_currency=0.0,
                ath_change_percentage=-50.0,
            )
        )
        self.assertTrue(30 <= result.total <= 60)

    def test_low_liquidity_flagged_and_penalized(self):
        illiquid = make_coin(market_cap=500_000_000, total_volume=1_000)
        liquid = make_coin(market_cap=500_000_000, total_volume=50_000_000)
        illiquid_score = compute_opportunity_score(illiquid)
        liquid_score = compute_opportunity_score(liquid)
        self.assertLess(illiquid_score.components["liquidity"], liquid_score.components["liquidity"])
        self.assertIn("Very low volume/market-cap ratio -- may be hard to exit", illiquid_score.flags)

    def test_large_pump_flagged(self):
        pumped = make_coin(price_change_percentage_24h_in_currency=75.0, price_change_percentage_7d_in_currency=5.0)
        result = compute_opportunity_score(pumped)
        self.assertTrue(any("pump" in flag for flag in result.flags))

    def test_micro_cap_flagged(self):
        micro = make_coin(market_cap=2_000_000, total_volume=500_000)
        result = compute_opportunity_score(micro)
        self.assertTrue(any("Micro-cap" in flag for flag in result.flags))

    def test_score_bounded(self):
        extreme = make_coin(
            price_change_percentage_24h_in_currency=500.0,
            price_change_percentage_7d_in_currency=500.0,
            price_change_percentage_30d_in_currency=500.0,
            total_volume=10_000_000_000,
            market_cap=1_000_000,
        )
        result = compute_opportunity_score(extreme)
        self.assertLessEqual(result.total, 100.0)
        self.assertGreaterEqual(result.total, 0.0)


if __name__ == "__main__":
    unittest.main()

"""Pure, network-free scoring logic.

The "opportunity score" is a transparent heuristic, not a prediction. It
rewards coins showing positive momentum backed by real trading volume,
while penalizing thin liquidity and parabolic pumps that are more likely
to be followed by a sharp reversal.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Symbols/ids treated as stablecoins and excluded from opportunity scans,
# since their design goal is price stability, not appreciation.
STABLECOIN_SYMBOLS = {
    "usdt", "usdc", "dai", "busd", "tusd", "usdp", "gusd", "usdd",
    "frax", "lusd", "susd", "usde", "fdusd", "pyusd", "usdj", "eurt",
    "eurs", "usdk",
}

DEFAULT_WEIGHTS: dict[str, float] = {
    "momentum": 0.40,
    "liquidity": 0.25,
    "recovery": 0.20,
    "consistency": 0.15,
}


@dataclass
class ScoreResult:
    coin_id: str
    symbol: str
    name: str
    total: float
    components: dict[str, float] = field(default_factory=dict)
    flags: list[str] = field(default_factory=list)


def is_stablecoin(coin: dict) -> bool:
    symbol = (coin.get("symbol") or "").lower()
    if symbol in STABLECOIN_SYMBOLS:
        return True
    price = coin.get("current_price")
    change_24h = coin.get("price_change_percentage_24h")
    if price is not None and change_24h is not None:
        if 0.97 <= price <= 1.03 and abs(change_24h) < 0.5:
            return True
    return False


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _momentum_score(coin: dict) -> float:
    """Rewards positive price action, weighted toward the more recent window."""
    h24 = coin.get("price_change_percentage_24h_in_currency") or coin.get("price_change_percentage_24h") or 0.0
    d7 = coin.get("price_change_percentage_7d_in_currency") or 0.0
    d30 = coin.get("price_change_percentage_30d_in_currency") or 0.0

    raw = 0.5 * h24 + 0.3 * d7 + 0.2 * d30
    # Map roughly [-20%, +40%] onto [0, 100].
    return _clamp((raw + 20) / 60 * 100)


def _liquidity_score(coin: dict) -> float:
    """Rewards coins with meaningful trading volume relative to market cap."""
    volume = coin.get("total_volume") or 0.0
    market_cap = coin.get("market_cap") or 0.0
    if market_cap <= 0:
        return 0.0
    ratio = volume / market_cap
    # A ratio around 0.05-0.20 is healthy; extremely high ratios can signal
    # wash trading or a low float, so the curve is capped rather than linear.
    return _clamp(ratio / 0.20 * 100)


def _recovery_score(coin: dict) -> float:
    """Rewards coins trading well below their all-time high (upside room)."""
    ath_change = coin.get("ath_change_percentage")
    if ath_change is None:
        return 50.0
    # ath_change is typically negative (e.g. -60 means 60% below ATH).
    drawdown = abs(min(ath_change, 0.0))
    # Sweet spot: 40-85% below ATH. Too close to ATH = less room to run;
    # near-zero market cap coins down 99%+ are likely dead, not "recovering".
    if drawdown < 20:
        return _clamp(50 - (20 - drawdown))
    if drawdown > 90:
        return _clamp(50 - (drawdown - 90) * 2)
    return _clamp(40 + (drawdown - 20) / 65 * 60)


def _consistency_score(coin: dict) -> float:
    """Penalizes single-window spikes that aren't confirmed across windows."""
    h24 = coin.get("price_change_percentage_24h_in_currency") or coin.get("price_change_percentage_24h") or 0.0
    d7 = coin.get("price_change_percentage_7d_in_currency") or 0.0
    d30 = coin.get("price_change_percentage_30d_in_currency") or 0.0

    signs = [1 if v > 0 else (-1 if v < 0 else 0) for v in (h24, d7, d30)]
    agreement = sum(1 for s in signs if s == 1)
    base = agreement / 3 * 100

    if h24 > 50 and d7 < 10:
        base *= 0.5  # likely a spike, not sustained momentum
    return _clamp(base)


def compute_opportunity_score(
    coin: dict,
    weights: dict[str, float] | None = None,
) -> ScoreResult:
    weights = weights or DEFAULT_WEIGHTS
    components = {
        "momentum": _momentum_score(coin),
        "liquidity": _liquidity_score(coin),
        "recovery": _recovery_score(coin),
        "consistency": _consistency_score(coin),
    }
    total = sum(components[name] * weight for name, weight in weights.items())

    flags: list[str] = []
    h24 = coin.get("price_change_percentage_24h_in_currency") or coin.get("price_change_percentage_24h") or 0.0
    if h24 is not None and h24 > 30:
        flags.append("Large 24h pump (>30%) -- elevated reversal risk")
    market_cap = coin.get("market_cap") or 0.0
    if 0 < market_cap < 10_000_000:
        flags.append("Micro-cap (<$10M) -- thin liquidity, high volatility")
    if components["liquidity"] < 5:
        flags.append("Very low volume/market-cap ratio -- may be hard to exit")

    return ScoreResult(
        coin_id=coin.get("id", ""),
        symbol=(coin.get("symbol") or "").upper(),
        name=coin.get("name", ""),
        total=round(total, 2),
        components={k: round(v, 2) for k, v in components.items()},
        flags=flags,
    )

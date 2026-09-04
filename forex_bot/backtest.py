"""Offline backtest of the EMA-crossover strategy against historical candles.

Pure and network-free: pass in candles fetched however you like (e.g.
`OandaClient.get_candles`) and get back simulated trade results. Meant to
validate the strategy before ever pointing it at even a practice account.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .indicators import atr as compute_atr
from .risk import stop_loss_take_profit
from .strategy import Signal, StrategyConfig, generate_signal


@dataclass
class TradeRecord:
    direction: Signal
    entry_index: int
    entry_price: float
    exit_index: int
    exit_price: float
    exit_reason: str  # "signal_flip", "stop_loss", "take_profit", "end_of_data"

    @property
    def return_pct(self) -> float:
        if self.direction is Signal.LONG:
            return (self.exit_price - self.entry_price) / self.entry_price * 100
        return (self.entry_price - self.exit_price) / self.entry_price * 100


@dataclass
class BacktestResult:
    trades: list[TradeRecord] = field(default_factory=list)

    @property
    def num_trades(self) -> int:
        return len(self.trades)

    @property
    def win_rate(self) -> float:
        if not self.trades:
            return 0.0
        wins = sum(1 for t in self.trades if t.return_pct > 0)
        return wins / len(self.trades) * 100

    @property
    def total_return_pct(self) -> float:
        """Sum of per-trade returns. Does not model compounding/position sizing."""
        return sum(t.return_pct for t in self.trades)

    @property
    def max_drawdown_pct(self) -> float:
        """Largest peak-to-trough drop in cumulative per-trade return."""
        cumulative = 0.0
        peak = 0.0
        max_dd = 0.0
        for t in self.trades:
            cumulative += t.return_pct
            peak = max(peak, cumulative)
            max_dd = min(max_dd, cumulative - peak)
        return max_dd


def run_backtest(
    candles: list[dict],
    strategy_config: StrategyConfig | None = None,
    atr_multiplier: float = 2.0,
    reward_risk_ratio: float = 2.0,
) -> BacktestResult:
    strategy_config = strategy_config or StrategyConfig()
    atr_series = compute_atr(candles, strategy_config.atr_period)

    result = BacktestResult()
    position: Signal = Signal.FLAT
    entry_index = entry_price = stop = take_profit = None

    warmup = max(strategy_config.slow_period, strategy_config.atr_period + 1)
    for i in range(warmup, len(candles)):
        window = candles[: i + 1]
        signal = generate_signal(window, strategy_config)
        candle = candles[i]
        current_atr = atr_series[i]

        # Check stop-loss / take-profit against this bar's range first.
        if position is not Signal.FLAT and stop is not None:
            hit_stop = (position is Signal.LONG and candle["low"] <= stop) or (
                position is Signal.SHORT and candle["high"] >= stop
            )
            hit_tp = (position is Signal.LONG and candle["high"] >= take_profit) or (
                position is Signal.SHORT and candle["low"] <= take_profit
            )
            if hit_stop or hit_tp:
                exit_price = stop if hit_stop else take_profit
                result.trades.append(
                    TradeRecord(
                        position,
                        entry_index,
                        entry_price,
                        i,
                        exit_price,
                        "stop_loss" if hit_stop else "take_profit",
                    )
                )
                position = Signal.FLAT

        # Enter, or flip on a new opposing signal.
        if signal is not position and signal is not Signal.FLAT and current_atr:
            if position is not Signal.FLAT:
                result.trades.append(
                    TradeRecord(position, entry_index, entry_price, i, candle["close"], "signal_flip")
                )
            position = signal
            entry_index = i
            entry_price = candle["close"]
            stop, take_profit = stop_loss_take_profit(
                entry_price, current_atr, position, atr_multiplier, reward_risk_ratio
            )

    if position is not Signal.FLAT:
        last = candles[-1]
        result.trades.append(
            TradeRecord(position, entry_index, entry_price, len(candles) - 1, last["close"], "end_of_data")
        )

    return result

"""Minimal client for OANDA's v20 REST API -- practice (paper trading) only.

Deliberately hardcoded to OANDA's fxPractice environment. There is no
constant or code path for the live-money api-fxtrade.oanda.com host
anywhere in this module by design, so this bot cannot place a real-money
order even by misconfiguration.
"""

from __future__ import annotations

from typing import Any

import requests

PRACTICE_BASE_URL = "https://api-fxpractice.oanda.com"
USER_AGENT = "forex-trend-bot/1.0 (paper trading only)"


class OandaError(RuntimeError):
    """Raised when the OANDA API returns an unrecoverable error."""


class OandaClient:
    """Thin HTTP client for OANDA's practice-account REST API."""

    def __init__(self, api_key: str, account_id: str, timeout: float = 15.0) -> None:
        if not api_key or not account_id:
            raise ValueError("api_key and account_id are required")
        self.account_id = account_id
        self.timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            }
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> dict:
        url = f"{PRACTICE_BASE_URL}{path}"
        try:
            response = self._session.request(method, url, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise OandaError(f"request to {path} failed: {exc}") from exc

        if response.status_code >= 400:
            raise OandaError(f"OANDA request failed: {response.status_code} {response.text[:300]}")
        return response.json() if response.content else {}

    def get_account_summary(self) -> dict:
        data = self._request("GET", f"/v3/accounts/{self.account_id}/summary")
        return data["account"]

    def get_candles(self, instrument: str, granularity: str = "H1", count: int = 200) -> list[dict]:
        params = {"granularity": granularity, "count": count, "price": "M"}
        data = self._request("GET", f"/v3/instruments/{instrument}/candles", params=params)
        candles = []
        for c in data.get("candles", []):
            if not c.get("complete", True):
                continue
            mid = c["mid"]
            candles.append(
                {
                    "time": c["time"],
                    "open": float(mid["o"]),
                    "high": float(mid["h"]),
                    "low": float(mid["l"]),
                    "close": float(mid["c"]),
                    "volume": c.get("volume", 0),
                }
            )
        return candles

    def get_open_trades(self, instrument: str | None = None) -> list[dict]:
        data = self._request("GET", f"/v3/accounts/{self.account_id}/openTrades")
        trades = data.get("trades", [])
        if instrument:
            trades = [t for t in trades if t.get("instrument") == instrument]
        return trades

    def create_market_order(
        self,
        instrument: str,
        units: int,
        stop_loss_price: float | None = None,
        take_profit_price: float | None = None,
    ) -> dict:
        order: dict[str, Any] = {
            "type": "MARKET",
            "instrument": instrument,
            "units": str(units),
            "timeInForce": "FOK",
            "positionFill": "DEFAULT",
        }
        if stop_loss_price is not None:
            order["stopLossOnFill"] = {"price": f"{stop_loss_price:.5f}"}
        if take_profit_price is not None:
            order["takeProfitOnFill"] = {"price": f"{take_profit_price:.5f}"}
        return self._request("POST", f"/v3/accounts/{self.account_id}/orders", json={"order": order})

    def close_trade(self, trade_id: str) -> dict:
        return self._request("PUT", f"/v3/accounts/{self.account_id}/trades/{trade_id}/close")

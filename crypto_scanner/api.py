"""Thin client for the public CoinGecko API.

Only the read-only, no-API-key-required endpoints are used, so this
works out of the box. CoinGecko's free tier enforces a rate limit, so
requests are retried with backoff on HTTP 429.
"""

from __future__ import annotations

import time
from typing import Any, Iterable

import requests

BASE_URL = "https://api.coingecko.com/api/v3"
USER_AGENT = "crypto-coin-scanner/1.0 (+https://github.com/)"


class CoinGeckoError(RuntimeError):
    """Raised when the CoinGecko API returns an unrecoverable error."""


class CoinGeckoClient:
    """Minimal HTTP client with retry/backoff for the CoinGecko REST API."""

    def __init__(
        self,
        base_url: str = BASE_URL,
        timeout: float = 15.0,
        max_retries: int = 5,
        request_delay: float = 1.5,
    ) -> None:
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = max_retries
        self.request_delay = request_delay
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        backoff = 2.0
        last_error: Exception | None = None

        for attempt in range(1, self.max_retries + 1):
            try:
                response = self._session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = exc
            else:
                if response.status_code == 200:
                    time.sleep(self.request_delay)
                    return response.json()
                if response.status_code == 429:
                    last_error = CoinGeckoError("rate limited (429)")
                elif response.status_code >= 500:
                    last_error = CoinGeckoError(f"server error ({response.status_code})")
                else:
                    raise CoinGeckoError(
                        f"CoinGecko request failed: {response.status_code} {response.text[:200]}"
                    )

            if attempt < self.max_retries:
                time.sleep(backoff)
                backoff *= 2

        raise CoinGeckoError(f"CoinGecko request failed after {self.max_retries} attempts: {last_error}")

    def get_markets(
        self,
        vs_currency: str = "usd",
        per_page: int = 250,
        page: int = 1,
        price_change_percentage: str = "1h,24h,7d,30d",
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch a page of coins with market data, ranked by market cap."""
        params = {
            "vs_currency": vs_currency,
            "order": "market_cap_desc",
            "per_page": per_page,
            "page": page,
            "sparkline": "false",
            "price_change_percentage": price_change_percentage,
        }
        if category:
            params["category"] = category
        return self._get("/coins/markets", params)

    def get_markets_pages(
        self,
        pages: int,
        vs_currency: str = "usd",
        per_page: int = 250,
        price_change_percentage: str = "1h,24h,7d,30d",
    ) -> Iterable[dict[str, Any]]:
        """Yield coin market entries across multiple ranked pages."""
        for page in range(1, pages + 1):
            batch = self.get_markets(
                vs_currency=vs_currency,
                per_page=per_page,
                page=page,
                price_change_percentage=price_change_percentage,
            )
            if not batch:
                break
            yield from batch

    def get_coin(self, coin_id: str) -> dict[str, Any]:
        """Fetch full detail for a single coin (description, dev/community stats, etc.)."""
        params = {
            "localization": "false",
            "tickers": "false",
            "market_data": "true",
            "community_data": "true",
            "developer_data": "true",
            "sparkline": "false",
        }
        return self._get(f"/coins/{coin_id}", params)

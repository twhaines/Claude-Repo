# Claude-Repo

## Crypto Coin Scanner

A command-line tool that scans cryptocurrency markets (via the public
[CoinGecko](https://www.coingecko.com/en/api) API), scores coins using a
transparent momentum/liquidity/volatility heuristic, and produces
deeper research reports on the highest-scoring candidates.

> **This is not financial advice.** Scores are heuristic estimates based
> on public market data, not predictions of future performance.
> Cryptocurrency markets are highly volatile and speculative. Always do
> your own research.

### How it works

1. **Scan** -- pulls market data for the top N coins by market cap,
   filters out stablecoins and illiquid/micro-volume coins, and computes
   an "opportunity score" (0-100) from:
   - **Momentum** (40%) -- weighted 24h/7d/30d price change
   - **Liquidity** (25%) -- 24h volume relative to market cap
   - **Recovery potential** (20%) -- distance below all-time high, with a
     penalty for coins that look effectively abandoned
   - **Consistency** (15%) -- whether momentum agrees across timeframes,
     to down-weight single-day spikes likely to reverse
2. **Research** -- for the top-ranked shortlist, fetches a full coin
   profile (description, links, GitHub activity, community size,
   sentiment) and derives qualitative risk flags (stalled development,
   negative sentiment, large unvested supply, etc.).
3. **Report** -- prints a ranked console summary and, optionally, writes
   a Markdown report to disk.

### Install

```bash
pip install -r requirements.txt
```

### Usage

```bash
python -m crypto_scanner.cli --pages 1 --shortlist 10 --output reports/scan.md
```

Common options:

| Flag | Description | Default |
|------|-------------|---------|
| `--vs-currency` | Quote currency | `usd` |
| `--pages` | Market pages to scan (250 coins/page) | `1` |
| `--min-volume` | Minimum 24h volume filter | `100000` |
| `--min-market-cap` | Minimum market cap filter | `1000000` |
| `--include-stablecoins` | Don't filter out stablecoins | off |
| `--shortlist` | How many top coins to deep-research | `10` |
| `--output` | Path to write a Markdown report | none |

### Run tests

```bash
python -m unittest discover -s tests
```

The scoring logic is pure and network-free, so tests run without any
API calls.

## Forex Trend-Following Bot (paper trading only)

An automated trading bot for the [OANDA](https://www.oanda.com/) **fxPractice**
(paper trading / simulated money) environment. It trades a standard,
transparent EMA-crossover trend-following strategy with ATR-based stop-loss
and take-profit levels and fixed-fractional position sizing.

> **Paper trading only, by design.** `forex_bot/oanda_client.py` is
> hardcoded to OANDA's practice API host (`api-fxpractice.oanda.com`) --
> there is no code path to a live-money account anywhere in this bot.
> See `forex_bot/__init__.py` for the full disclaimer.

### How it works

1. **Signal** -- fetches recent candles and compares a fast/slow EMA
   (default 12/26) to decide whether the trend currently favors long,
   short, or flat.
2. **Risk** -- computes a stop-loss and take-profit from ATR (volatility),
   then sizes the position so a stop-out risks a fixed percentage of
   account balance (default 1%).
3. **Execute** -- compares the desired position to what's currently open
   on the practice account and closes/opens trades to match. Runs in
   **preview mode** by default (prints intended actions, places no
   orders) until you pass `--place-orders`.
4. **Backtest** -- `forex_bot/backtest.py` replays the same strategy over
   historical candles offline, with no network calls, so you can sanity
   check it before ever running it live against the practice account.

### Setup

1. Create a free [OANDA fxPractice account](https://www.oanda.com/us-en/trading/demo-account/)
   and generate a personal access token plus note your practice account ID.
2. Export credentials:
   ```bash
   export OANDA_API_KEY=your-practice-api-token
   export OANDA_ACCOUNT_ID=your-practice-account-id
   ```

### Usage

```bash
# Preview mode: prints the signal and what it would do, places no orders
python -m forex_bot.cli --instrument EUR_USD --once

# Run continuously, checking every 5 minutes, still preview-only
python -m forex_bot.cli --instrument EUR_USD --poll-interval 300

# Actually place orders on the OANDA practice (simulated money) account
python -m forex_bot.cli --instrument EUR_USD --place-orders
```

Common options:

| Flag | Description | Default |
|------|-------------|---------|
| `--instrument` | OANDA instrument | `EUR_USD` |
| `--granularity` | Candle timeframe (M15/H1/H4/D/...) | `H1` |
| `--fast-ema` / `--slow-ema` | EMA crossover periods | `12` / `26` |
| `--atr-multiplier` | Stop-loss distance, in ATRs | `2.0` |
| `--reward-risk` | Take-profit distance as a multiple of the stop | `2.0` |
| `--risk-pct` | % of account balance risked per trade | `1.0` |
| `--once` | Run a single decision cycle and exit | off |
| `--place-orders` | Actually submit orders (default is preview-only) | off |

### Why this design

This was built after researching `@not_a_lil_fish`'s public YouTube/Instagram
presence; the publicly available material centers on the **Lil Fish Terminal**
(a desk market-data display) rather than a disclosed trading algorithm, so
there was no specific proprietary strategy to reproduce. This bot instead
implements a standard, well-understood, and fully transparent technical
strategy with real risk controls, running only against simulated money.
"Futures" paper trading (e.g. CME via a broker like Interactive Brokers)
typically requires a heavier desktop-gateway integration; the strategy,
risk, and backtest modules here are broker-agnostic, so a futures client
could be swapped in later by replacing `oanda_client.py` alone.

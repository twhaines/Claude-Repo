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

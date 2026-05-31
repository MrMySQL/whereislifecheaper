# Kyiv Rent Pilot — Report

Generated: 2026-05-31T17:20:49.913Z
Numbeo captured: 2026-05-31

## Verdict: **FAIL**

- Cross-source agreement (≤15% diff): **FAIL**
- Numbeo benchmark (≤20% diff for 1BR/3BR): **FAIL**

## Per-bucket medians

| Source | Bedrooms | N | Dropped | Median UAH/mo | Median USD/mo | p25 USD | p75 USD |
|--------|----------|---|---------|---------------|---------------|---------|---------|
| domria | 0 | 435 | 48 | 20,000 | 452 | 316 | 655 |
| domria | 1 | 302 | 32 | 25,000 | 565 | 407 | 903 |
| domria | 2 | 129 | 14 | 30,000 | 678 | 452 | 1,204 |
| domria | 3 | 30 | 2 | 61,078 | 1,380 | 730 | 1,907 |
| olx | 0 | 369 | 40 | 16,000 | 361 | 271 | 497 |
| olx | 1 | 240 | 26 | 22,000 | 497 | 361 | 836 |
| olx | 2 | 163 | 16 | 38,000 | 858 | 599 | 1,501 |
| olx | 3 | 43 | 4 | 101,874 | 2,301 | 1,201 | 3,597 |

## Cross-source comparison (OLX vs DOM.RIA)

| Bedrooms | OLX UAH | DOM.RIA UAH | Rel diff | Pass | Note |
|----------|---------|-------------|----------|------|------|
| 0 | 16,000 | 20,000 | 22.2% | no |  |
| 1 | 22,000 | 25,000 | 12.8% | yes |  |
| 2 | 38,000 | 30,000 | 23.5% | no |  |
| 3 | 101,874 | 61,078 | 50.1% | no |  |

## Numbeo comparison (blended center+outside)

| Bedrooms | Source | Median UAH | Numbeo blend UAH | Rel diff | Pass |
|----------|--------|------------|------------------|----------|------|
| 1 | domria | 25,000 | 22,267 | 11.6% | yes |
| 1 | olx | 22,000 | 22,267 | 1.2% | yes |
| 3 | domria | 61,078 | 40,978 | 39.4% | no |
| 3 | olx | 101,874 | 40,978 | 85.3% | no |

## Interpretation guide

- If **cross-source FAIL but Numbeo PASS for one source**: one classifieds site is biased (likely toward higher-end listings). Investigate listing distribution by district before trusting either source.
- If **cross-source PASS but Numbeo FAIL**: classifieds asking prices systematically differ from Numbeo crowd-sourced averages. Likely cause: asking-vs-closing rent gap, or stale Numbeo data. Acceptable to proceed if magnitude is consistent (e.g. ~25% high in both sources).
- If **both FAIL**: methodology issue — recheck room→bedroom normalization and outlier trim.

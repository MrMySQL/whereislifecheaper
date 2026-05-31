# Kyiv Rent — flatfy.ua analysis

flatfy is a third classifieds source (lun.ua engine). After resuming pagination to its hard ceiling we have **2209 unique listings**, all priced in USD. Medians use the same method as the pilot: sqm filter (15–300 m²), 5% outlier trim per `(source, bedrooms)` bucket. USD→UAH at ~44.3 UAH/USD.

## flatfy median monthly rent per bedroom bucket

| Bedrooms (rooms) | N | Median USD | Median UAH | p25 USD | p75 USD |
|---|---|---|---|---|---|
| 0 (1-room / studio) | 967 | $372 | 16,468 | $293 | $518 |
| 1 (2-room) | 664 | $518 | 22,931 | $361 | $788 |
| 2 (3-room) | 295 | $808 | 35,768 | $541 | $1,238 |
| 3 (4-room+) | 60 | $1,825 | 80,788 | $1,082 | $3,075 |

## Cross-source comparison (median UAH/mo)

| Bedrooms | OLX | DOM.RIA | **flatfy** | LUN (benchmark) | flatfy vs LUN | flatfy vs OLX | flatfy vs DOM.RIA |
|---|---|---|---|---|---|---|---|
| 0 | 16,000 | 20,000 | **16,468** | 18,000 | −9% | +3% | −18% |
| 1 | 22,000 | 25,000 | **22,931** | 27,000 | −15% | +4% | −8% |
| 2 | 38,000 | 30,000 | **35,768** | 44,400 | −19% | −6% | +19% |
| 3 | 101,874 | 61,078 | **80,788** | — | n/a | −21% | +32% |

## Reading the data

- **0BR (1-room / studio)**: flatfy 16,468 UAH vs LUN 18,000 (−9%, 9% rel) — brackets LUN tightly. n=967.
- **1BR (2-room)**: flatfy 22,931 UAH vs LUN 27,000 (−15%, 16% rel) — within a reasonable band of LUN. n=664.
- **2BR (3-room)**: flatfy 35,768 UAH vs LUN 44,400 (−19%, 22% rel) — within a reasonable band of LUN. n=295.
- **3BR (4-room+)**: flatfy 80,788 UAH (n=60) — no LUN reference; small-sample/luxury skew on all sources, treat as unreliable.


# PR #40 review findings

All 21 reports were investigated. Twenty were confirmed as described; the nonfinite quantity report identified a real validation gap, but its claimed verified zero-price outcome was not reproduced. The follow-up PR contains the fixes.

| Finding | Root cause and resolution |
| --- | --- |
| Missing Russian/Ukrainian navigation label | Only English defined `nav.maintenance`. Added both translations. |
| Observation repository could write outside a transaction | Its optional client allowed an observation to commit independently of its price. Observation writes now require a transaction client. |
| Coverage hidden after 1,000 rows | The UI filtered and expanded a capped local array. Added database pagination, server filtering and totals, and previous/next controls. |
| Suggestions hidden after 200 rows | The query had a fixed limit and the UI had no paging controls. Added limit/offset and total metadata throughout the API and UI. |
| Price abstention fell back to a legacy comparison | Nullish fallback treated an intentional null comparison like missing quantity information. Legacy fallback now applies only when quantity information is absent. |
| Plan omitted the checks table | The migration ownership list was incomplete. Added `product_maintenance_checks`. |
| Old price could match a new unknown-quantity observation | Equal quantity JSON does not identify the observation. Public comparisons now require the selected price timestamp to be at least the observation timestamp. The same guard also applies to maintenance coverage, discovery and approval. |
| Dead-pipeline freshness disappeared | Freshness was calculated from the age-filtered current offers. Its aggregate now uses eligible offers without the age cutoff. |
| Price guard test exercised the wrong rejection | Artificial snapshot values failed snapshot agreement first. Replaced them with real interpretation underflow/overflow cases that reach the price guard. |
| Redundant mapping update | Existing URL and creation paths already wrote mapping metadata. Each existing mapping now receives one metadata update; the external-ID path still gets its necessary update. |
| Individual scraper fallback split observation and price | Mapping resolution committed availability before the separate price call. The new single-product save uses the same observation-and-price transaction as bulk saves; scraper fallback invokes it. |
| Failed scrapes triggered maintenance | `workflow_run: completed` includes unsuccessful conclusions. Added a job condition requiring success for workflow-run events, while retaining scheduled/manual runs. GitHub does not support a trigger-level `conclusion` filter. |
| Array status silently became pending | Non-string values were treated like omission. Only undefined defaults to pending; malformed filters return 400. |
| API run unexpectedly applied proposals | The route defaulted to apply. Route and service now default to dry-run; the admin run action explicitly sends `dry_run: false`. |
| Review failures all became conflicts | A blanket catch converted missing records and unexpected errors into 409 responses. Dedicated domain errors produce 404/409; unexpected errors reach the global error handler. |
| Failed targets advanced the discovery cursor | Targets were marked before discovery and proposal persistence. They are now marked only after successful processing. |
| Duplicate exclusion test had no duplicate | The fixture contained only legitimate cross-store offers. Added a same-store mapping with `duplicate_of_mapping_id` set and asserted exclusion. |
| Repository mocks depended on query order | Positional response shifting assigned rows to whichever query happened next. Responses now match SQL patterns and unknown statements fail explicitly. |
| Number formatting performed a no-op | Replacing a decimal point with itself changed nothing. Removed the redundant helper. |
| Nonfinite quantities were accepted as candidates | Parsed quantities and multipack totals lacked finite checks. They now cause explicit abstention. Previously Infinity became a self-conflict through NaN arithmetic; a verified zero-price result was not reproduced. |
| One-piece selling unit conflicted with textual pack count | Raw piece metadata was treated as package contents even when text supplied a different piece count. Raw one-piece units now defer to explicit textual counts. |

Regression coverage includes real PostgreSQL rollback and ingestion fallback behavior, stale and duplicate offer eligibility, dead-pipeline freshness, pagination beyond both previous caps, review transactions, malformed API filters, domain/server errors, cursor failures, and quantity edge cases. Browser verification checks pagination, filter resets, explicit apply requests and mobile layout.

Final verification on the follow-up branch: 288 tests passed across 31 suites, including all 28 PostgreSQL integration tests using an isolated disposable database. Backend and frontend production builds and `git diff --check` passed. Browser checks reached coverage row 1,005 and suggestion 205 and confirmed no mobile page overflow. Frontend build retains existing bundle-size and Browserslist-age warnings. Production deployment is outside this change.

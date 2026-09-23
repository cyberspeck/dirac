# test-baselines

Failing-test lists from full unit-suite runs via `scripts/run-unit.sh` (mocha `--parallel --jobs 2`,
per-file isolation, Node 22). One line per failure: `<file> :: <full title>`, sorted. `?` as file
means mocha reported no file — root-hook (`afterEach` logger guard) failures and uncaught worker errors.

| Baseline | Commit | Tests | Passing | Pending | Failing |
|---|---|---:|---:|---:|---:|
| `fork21` | `21e21fa6` — `local-model-patches` before the rebase (0.5.13 base) | 4272 | 4102 | 20 | 160 |
| `v0515` | upstream tag `v0.5.15` | 4256 | 3989 | 20 | 260 |
| `rebase` | `70621ff6` — patch set rebased onto `v0.5.15` | 4379 | 4111 | 20 | 255 |
| `task7` | `ce55a807` — `v0515-public` after repairing upstream-stale tests | 4380 | 4208 | 20 | 159 |

Totals are mocha's own `stats`; hook failures count as failures without being tests, so the columns
do not add up exactly.

A test that newly fails is a finding unless it also fails in `v0515` (upstream's own state).
Compare a fresh run with `diff test-baselines/task7.failing.txt tmp/unit-run/failing.txt`.

**Caveat:** the earlier "2461 passing / 78 failing" figure (FINDINGS F-014) came from a serial
`npm run test:unit` that aborted early at a failing `afterEach` — it is not a full-suite number and
must not be compared against these.

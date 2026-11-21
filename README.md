# csv-slice-reader

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Ethan-Zen/csv-slice-reader/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Ethan-Zen/csv-slice-reader/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A dependency-free drop-in for csv-reader 1.0.0: `run(input)` returns the same `{columns, rows, errors}` for the same text, broken rows included, while reading the text once and slicing its fields instead of growing strings a character at a time.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

`main.ts` answers every case of `cases.json` with `run()` from `solve.js` and writes `answers.json`.

## What it reads

The policy is csv-reader 1.0.0's, edge for edge:

- a U+FEFF at the very start is dropped; a record ends at LF or CRLF; a line left with no characters is no record;
- outside quotes a CR not followed by LF is dropped (`stray_cr`);
- a field that opens with a quote runs to the next quote that is not doubled, `""` being one quote, and each CRLF or lone CR inside it read as LF; what follows its closing quote is appended as it stands (`quote_junk`);
- a quote that never closes is a literal character and the text after it is reread as unquoted (`unterminated_quote`);
- `columns` is the first record when `header` is true, else null; every other record is padded with empty strings (`short_row`) or cut (`long_row`) to the first record's width;
- each error is `{code, line, row}`, `line` the line its record starts on, `row` its index in `rows` (null for the header), in the order met.

## How it is faster

One pass with `charCodeAt` and a fast path per field: the common unquoted field is found by scanning to its delimiter and taken as one `slice`, so a field costs a scan and one substring instead of one string concatenation per character. The three rare shapes — a stray CR inside a field, the text after a closing quote, and the text reread after a quote that never closes — leave the hot loop and share one reader. Row width is applied once per record.

On a drawn set of six cases, 10.3 MB of CSV, it writes byte-identical answers to csv-reader 1.0.0 and takes about half its CPU time.

## Licence

MIT. csv-reader 1.0.0 is make.fun's own program (MIT), derived from d3-dsv 3.0.2 (ISC) and papaparse 5.7.1 (MIT); this repository ships no copy of either, only its own reader written against the reference's policy.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rywn2b8e&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>

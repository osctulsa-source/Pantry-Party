# Spike · Capture accuracy

**Question:** Can we hit **≥ 90%** capture accuracy? **Throwaway. Timebox: ~1 week.**

## Run it

```bash
npm install
cp .env.example .env     # Open Food Facts needs no key; add UPCITEMDB_KEY for tier 2 at volume
npm start                # summary only
npm run start:verbose    # per-item breakdown
```

## What it does

`runHarness.ts` loads `testset.sample.json`, runs each barcode through the
`barcodeCascade` (Open Food Facts → UPCitemdb → paid stub), compares the resolved name
to the expected name, and prints a hit rate + a results file.

## The work that actually matters

The sample set is 6 items so the harness runs out of the box. **The real decision needs
a 500-item set pulled from the team's own grocery receipts.** Cover the hard cases:

- National brands (easy — OFF should nail these)
- Store/private-label brands (where OFF gets thin → UPCitemdb earns its place)
- **Fresh produce / PLU items** — no barcode. These should route to *manual entry*, not
  count as misses. Mis-handling this is the most common way to undercount your real rate.
- International items, multipacks, seasonal SKUs

## The OCR half

`receiptOcr.ts` is the vendor abstraction. Wire Tabscanner (or Veryfi), then measure: of
N labelled receipts, what % of line items extract + normalize correctly? `normalizeLine()`
is the lever — start with rules, measure, and only reach for an LLM pass if the rules
plateau below the bar.

## Decision

Log the resulting number and the engine/vendor call in `../../docs/DECISIONS.md`, then
**delete this directory.** The learning lives in the ADR; the code does not survive.

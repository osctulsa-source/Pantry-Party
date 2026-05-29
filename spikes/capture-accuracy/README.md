# Spike · Capture accuracy

**Question:** Can we hit **≥ 90%** capture accuracy? **Throwaway. Timebox: ~1 week.**

## Run it

```bash
npm install
npm run start:verbose      # per-item breakdown
npm start                  # summary only
```

The harness uses your real `src/testset.json` if it exists, otherwise the 5-item
`src/testset.sample.json` smoke sample. It reports three honest numbers, not one
misleading one:

- **Resolution rate** — of barcoded items, how many returned a real product? (the signal that matters)
- **Name accuracy** — of those that resolved, how many match the label?
- **Produce routed** — PLU/produce items are excluded from barcode metrics (they belong in manual entry)

## Building the real 500-item test set

A clean number means nothing on a toy sample. The real decision rests on **500+ items
labeled from your own grocery receipts** — where `expectedName` is INDEPENDENT ground
truth (the name on the package), never copied from a lookup database.

**Workflow:**
1. The team saves grocery receipts + keeps the physical items for ~2–3 weeks. Three
   households × a few weeks easily clears 500 items, and it's representative by construction.
2. Fill a spreadsheet using `testset.template.csv` as the column guide:
   `barcode, expectedName, kind, category, store, note`.
   - **Format the `barcode` column as plain text** in Google Sheets (Format → Number →
     Plain text) or leading zeros on UPCs get eaten.
   - `kind` = `produce` for PLU/fresh items (no real barcode); everything else `barcode`.
   - `expectedName` = what's actually on the package. This is the ground truth.
3. Export the sheet as `testset.csv` into this folder, then:
   ```bash
   npm run build:testset        # CSV -> src/testset.json + a distribution report
   npm run start:verbose        # measure
   ```

**Aim for a representative basket** (rough targets out of 500):

| Category | ~Target | Why |
|---|---|---|
| National / major brands | ~45% | the easy wins; confirms the baseline |
| Store / private-label | ~20% | the gap zone where free DBs thin out |
| Fresh produce / PLU | ~15% | routes to manual; tests correct exclusion |
| International / ethnic-market | ~10% | coverage stress test |
| Multipacks / variety packs | ~5% | quantity-inference edge cases |
| Household / non-food | ~5% | cleaning, paper, pet — do they resolve or degrade gracefully? |

## Read the misses, don't just read the rate

When the number lands, **bucket the misses by category.** If they cluster in one place
(e.g., international or store-brand), that tells you exactly what a paid tier-3 vendor
would buy you — and whether it's worth it. That analysis, not the headline percentage, is
the actual ADR input.

## The OCR half

`receiptOcr.ts` is the vendor abstraction. Wire Tabscanner/Veryfi, then measure line-item
extraction + normalization on labeled receipts. `normalizeLine()` is the lever — rules
first, measure, reach for an LLM pass only if rules plateau.

## Decision

Log the resulting numbers and the vendor/tier call in `../../docs/DECISIONS.md`, then
**delete this directory.** The learning lives in the ADR; the code does not survive.

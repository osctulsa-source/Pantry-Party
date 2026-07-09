# Shelf-life source data (USDA FoodKeeper)

`foodkeeper-ingredients.csv` + `foodkeeper-categories.csv` are a snapshot of the
USDA FSIS **FoodKeeper** dataset (public domain, produced by USDA FSIS with
Cornell University and the Food Marketing Institute). fsis.usda.gov blocks
non-browser downloads, so the snapshot was taken from the
`jelera/food-shelflife-db` GitHub mirror (same data, CSV form) on 2026-07-09.

`build.mjs` converts the ingredients CSV into
`packages/core/src/shelfLifeData.generated.ts` — the compact dataset the app
bundles for location-aware expiry suggestions. Regenerate after editing the
CSVs or the script:

    node data/shelf-life/build.mjs

The script validates its output and exits non-zero on violations; the generated
file is committed. `foodkeeper-categories.csv` is provenance-only in v1 (the
generated records don't carry FoodKeeper categories).

# Phase 8.3 Final Gate Report

## Scope

This release addresses three defects: Arabic PDF rendering, pricing and total consistency, and catalog/source fidelity. The authoritative catalog PDF was retained as the source of truth. No barcode, price, stock, or Arabic translation was invented.

## Results

| Area | Result | Evidence |
|---|---|---|
| A4 PDF rendering | PASS | Embedded DejaVu Sans TrueType font; generated A4 PDF opened and rasterized successfully. |
| 80mm receipt rendering | PASS | Embedded font; generated thermal receipt opened and rasterized successfully. |
| Mixed Arabic/Latin text | PASS | Invoice number, batch number, medicine strength, Arabic labels, and monetary values render without missing-glyph boxes. |
| Monetary unit math | PASS | Minor-unit conversion and formatting tests pass; line, invoice discount, and net-total calculations remain integer-based. |
| POS purchase search | PASS | Existing search covers Arabic/English/generic/active ingredient/manufacturer/code/barcode fields. |
| Catalog lineage | PASS | Source page and row metadata remain present; artifact rebuild is deterministic. |
| Arabic source fidelity | REVIEW REQUIRED | 3,353 records are flagged because the PDF text layer contains Arabic glyph-order/encoding artefacts. Extracted values are preserved unchanged; no guessed correction was applied. |
| TypeScript | PASS | `npm run lint` completed successfully. |
| Production build | PASS | `npm run build` completed successfully. |
| Regression suite | PASS | Existing phases plus Phase 8.3 and Phase 8.4 tests completed successfully. |

## Deliberate Safety Decision

The Arabic disease/category strings in the PDF text layer cannot be safely corrected from extracted text alone. The pipeline now records these values in `drug_catalog_review.csv` and reports them for visual review against the PDF. This prevents a guessed Arabic translation from silently entering the master catalog.

## Files Changed

The implementation embeds a mixed-script font for PDF generation, preserves the complete extracted disease text instead of truncating it, records source-fidelity review flags, and adds `test_phase8_3.ts` to the standard test command.

## Release Gate

The code and web build are verified locally. Android APK publication remains dependent on the GitHub Actions run after the commit is pushed; the APK link must only be issued after that run succeeds and the release asset is checked.

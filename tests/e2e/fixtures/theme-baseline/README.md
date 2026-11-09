# Frozen Atmo visual catalogue

The reference is the unchanged framework at `a1c3617`. The catalogue contains 662 cases, each captured in light and dark in Chromium at DPR 1 and 2 (2,648 images). Rendering changes must preserve these images with `maxDiffPixels: 0`.

Run the full gate with no `THEME_BASELINE_SURFACE` environment variable:

```powershell
npx playwright test tests/e2e/theme-baseline.spec.ts --project=chromium --project=chromium-high-dpr --workers=4
```

The reduced-motion project uses the existing DPR 1 references. All catalogue captures already request reduced motion:

```powershell
npx playwright test tests/e2e/theme-baseline.spec.ts --project=chromium-reduced-motion --workers=4
```

Type-check the catalogue independently:

```powershell
npx tsc -p tests/e2e/fixtures/theme-baseline/tsconfig.json --noEmit
```

## Capture conditions

- Fixed wall clock: 9 November 2026, 13:30 UTC. Frame scheduling remains live.
- Host typography, viewport and appearance are explicit.
- Fonts and HTML images finish loading before capture.
- The folder presentation gets a fresh document because it freezes a copy of its source DOM. CSS artwork, finite animations and measured SVG geometry settle before that copy is made.
- No sleeps, masks, increased pixel tolerance or control-drawing overrides are used.
- `THEME_BASELINE_SURFACE` filters diagnostic runs only. A filtered run is not the full parity gate.

## Freeze rule

After the Task 1 commit, never run `--update-snapshots` and never alter, delete or replace a reference image to pass a later task. `docs/superpowers/evidence/2026-11-09-theme-contract/baseline-sha256.json` records the immutable image hashes.

A visible difference requires investigation. Stop the affected slice if preserving the reference is impossible, record its evidence and continue independent work under the owner's instructions.

The one owner-approved initial-capture correction (dark DPR 2 folder presentation) and its original expected/diff/trace/geometry evidence are preserved in that evidence directory. It is not a later parity exception.

Only the existing ornamented login look is in the baseline. The planned `plain` presentation switches the existing ornament effect off and receives a separate owner-review evidence image. Journal belongs to the excluded site repository and is outside this catalogue.

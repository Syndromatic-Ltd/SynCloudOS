# About motion repair implementation plan

**Goal:** Restore the approved pre-migration About appearance and choreography through AppKit and FX objects.

**Authority:** Site `e3c3b39` motion recipes and the six owner-approved stills supplied in the task. No room-gradient or appearance redesign. Work only in the named shared worktrees; preserve concurrent changes, stage explicit owned paths, commit locally, never push.

- [x] Reproduce the tab failure and trace selection, mount, retained-slot handoff and animation settlement. Add a regression that exercises a real About application.
- [x] Compile LayerArtwork recipes to basic, spring and keyframe objects, with disabled model actions and system reduced motion. Preserve recipe timings and delays. Verify all consumers.
- [x] Add and test endless AFX compositor playback, hidden-page suspension/resumption and reduced-motion settlement. Document the framework contract. Framework loop implementation is delegated with disjoint ownership.
- [x] Adopt a committed, typechecked framework through the user-specified clean detached checkout/junction procedure; remove only Claude's explicitly identified temporary floor workaround.
- [x] Move floor travel to its outlet layer. Replace the sprite byte loop with a radial GraphicsFX gradient; compare additive blending and retain the approved look. Remove redundant renderer scheduling. Check circle sampling and standard scroll/image controls against the reference and document any precise gaps.
- [x] Remove the three dead images and correct team.svg's comment.
- [x] Capture all tabs at 1440x900 and 390x844, side-by-side comparisons, ~80ms tab frames for 1.5s, travelling floor, reduced crossfade and browser errors under `docs/superpowers/evidence/2026-11-07-about-repair/`.
- [x] Run both typechecks, focused regressions, framework animation suites, site suite and diff checks. Review owned changes; commit evidence and report SHAs, causes, per-finding results and limitations.

Final results and conditional scroll/image exceptions are recorded in `../evidence/2026-11-07-about-repair/README.md`. The full site suite retains three Gallery/Publisher failures; About and artwork consumers pass. Successive-tab and interrupted dial-layout regressions, six refreshed baseline comparisons, live/native playback, controlled 80 ms frames and synthetic visibility suspension are included.

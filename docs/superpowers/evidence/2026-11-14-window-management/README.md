# Window redesign evidence

Framework baseline is 1bfc47e9 in the Webspring framework worktree. Site baseline is 0472a7c with its then-installed Beta 2 SDK and existing local edits.

- Phase 0 established [framework fixture](captures/) and [site](site/) references. Phase 0b selected shared authority using four Chromium transfer tests. The production Webspring integration test verified window and controller identity, one content mount, draft and DOM focus when moving from stage to floating and back. The [plan records the boundary](../../plans/2026-11-14-window-management.md#transfer-prototype-results-sol) between that handoff and the child-document prototype.
- [Phase 1](phase-1/) replaced the retired frame component with window content borders and preserved sheet-focus and sidebar behavior.
- Phase 2 added confirmed fullscreen transitions, scoped focus and restoration migration. This changes window state and authority.
- [Phase 3](phase-3/) gave Webspring and the single-app host real stage windows so one controller can move between frames. The production site captures pair the Phase 0 stage with the current stage and its floating destination at both sizes, both schemes and both materials. The captures show settled states. Launch, return, QuickSwitch and MultiSwitch motion review remains open.
- [Phase 4](phase-4/titlebar/) placed title, controls, toolbar and accessories in shared chrome. The captures compare source-backed fixture scenes. The titlebar browser tests measure placement, overflow, drag exclusions and floating geometry. [Site captures](phase-4/site/) show About, Software and Journal through the installed SDK. The Metal rail follows the root split sidebar.
- [Phase 4 scroll correction](phase-4/scroll-overlap/) restored About's glass over its viewport via `fullSizeContentView`. Software defers responsive changes from its resize observer to the next frame to prevent a layout error during wide/compact handoff.
- [Phase 5](phase-5/menu/) added independent menu bar and toolbar opt-ins using the same application menu. The Cumulus recaptures show the glass aligned with the title row beneath the menu. [Site captures](phase-5/site/) pair Phase 0 scenes with the new toolbar menu in closed and open states across the matrix. Software's phone layout places the menu button in toolbar overflow.
- Phase 6 documents window state, frame appearance and opt-in menus.
- [Phase 7](phase-7/split-layout/) added three-pane seams and animated sidebar and inspector collapse. The scoped before/after fixture verifies retained content and focus during geometry changes.
- Phase 8 is a [written Electron plan](../../plans/2026-11-14-electron-window-host.md).

## Pending design review

- Pending design | Atmo menu-bar Metal colours and noise art. The menu bar uses existing tokens and semantic menu parts.
- Pending design | Atmo circular toolbar groups. The placeholder uses the existing button group.
- Pending design | Floating Cumulus titlebar art. The window opts in through titlebarPresentation, with a semantic floating surface and existing-token paint. Metal stays attached.
- Pending design | Journal and JournalOld frame-view art for the Mountain Lion and leather variants. Both use metric and token placeholders.
- Compare the shared titlebar's inline toolbar, controls, dark accessory paint, and desktop/phone layout with the reference captures. The titlebar and menu fixtures include their source hashes and geometry.
- The production site captures include the current Journal phone layout. Same-scene comparisons for Journal and JournalOld, MemoJournal and SynCal remain open, alongside production launch, return, QuickSwitch and MultiSwitch motion.
- Window-controls-overlay verification remains open. Chrome accepted a temporary-profile PWA installation, but the test could not obtain a live native titlebar rectangle.

## Remaining implementation and evidence

- Production Webspring moves the same mounted window between the stage and the in-page floating layer. Native detach and reattach still need host binding acknowledgements, generation-scoped activation, and recovery when a child document closes or disappears. The same-origin Chromium prototype exercised those cases separately.
- `standardWindowButton`, app-facing full-screen delegate callbacks, sidebar separator tracking, and scoped theme-validated frame-view stylesheets remain open. The frame views supply metrics and existing theme tokens. The Preferences surface and the expanded fallback retain a separate titlebar content component.
- The system-drawn menu bar has a fixture matrix. The production About and Software captures verify the independently enabled toolbar application menu. The Phase 3 evidence shows the settled stage and window states. The motion sequence is still open.

## Frozen screenshot results

The existing baseline images and assertion file match framework commit 1bfc47e9 byte for byte. Chromium DPR 1 and DPR 2 reported 80 failing partitions and 2 passing interaction checks at 6ca65fdf. Each failing partition stops at its first differing image, so the catalogue can have further differences after the entries below.

### Pending design review

These first mismatches were reported in light and dark in both DPR projects.

- Cumulus stage titlebar (`top-bar-atmoCumulus-dark` is the catalogue ID in both ambient schemes).
- Metal key window with preference toolbar (`window-metal-key-preference`).
- Standard inactive window with automatic, expanded, unified or unified compact toolbar.
- Standard key window with automatic, expanded or unified compact toolbar.

### Other screenshot mismatches

The first differing images also included Metal switches on and off, and circular sliders in mini, small and regular sizing at normal, focused, minimum or maximum positions. Their cause is unresolved. Exact surface IDs and all 80 partition results are in [the catalogue failure index](frozen-theme-failures.md).

## Verification

| Check | Frozen source or installed SDK | Observed result |
| --- | --- | --- |
| Framework typecheck and SDK build | `131b9eda` | Passed. |
| Site typecheck and boundaries | `c138484`, embedded framework `131b9eda` | Passed. Vendored archive SHA-256 is `bb1aa746669d72f108cbc813a1c909e11eb0890d8eb528726c2ee2fd2c0f948f`. |
| Full framework runtime suite | `34fac939` | 8,881 passed, six failed. Two QuickSwitch assertions and the retired Atmo selectors passed their focused reruns after fixing them. Three packed-consumer tests ran while the SDK output was being rebuilt. |
| Full framework suite | `34fac939`, isolated SDK build followed by tests | 9,914 passed, three test failures and one failed suite. QuickSwitch, Atmo validation and the obsolete titlebar import were fixed and verified in focused reruns. |
| Framework focused runtime | `27834416` and `131b9eda` | 832 toolbar, runtime and semantic tests passed. 14 ownership, AppKit counterpart and QuickSwitch tests passed. 10 titlebar, menu and Atmo bundle tests passed after selector cleanup. |
| Framework browser | `131b9eda` | 21 focused titlebar and stage overlay cases passed. Earlier separate runs passed all 34 Chromium titlebar geometry cases at standard and high DPR and all four stage overlay tests. |
| Site runtime | `c138484`, embedded framework `131b9eda` | 24 Node tests passed. Vitest reported 403 passed and ten failed, including Gallery lifecycle and focus, and Publisher transient anchors and image editing. |
| Site browser | `c138484`, embedded framework `131b9eda` | 11 passed and 14 failed. All five Chromium scroll/chrome viewports passed. Journal passed in Chromium, Firefox and WebKit. Failures cluster in Chronosphere/Gallery presentation, login, and Publisher. |

The acceptance-name search covered `src`, `tests`, `scripts` and `tooling` in both repositories. Hits remaining in active code are `sourceList` names for the unrelated NSE outline selection style, its fixtures and Gallery navigation strings. The retired `frame.sourceList` field is gone. The plan, migration guide and capture metadata retain historical names to identify what was removed. The frozen theme assertion and image tree still match `1bfc47e9` byte for byte.

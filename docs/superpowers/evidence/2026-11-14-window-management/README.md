# Window redesign evidence

Framework baseline is 1bfc47e9 in the Webspring framework worktree. Site baseline is 0472a7c with its then-installed Beta 2 SDK and existing local edits.

- Phase 0 established framework fixture and site references. Phase 0b selected shared authority using four Chromium transfer tests. The production Webspring integration test additionally verified window and controller identity, one content mount, draft and DOM focus when moving from stage to floating and back.
- [Phase 1](phase-1/) replaced the retired frame component with window content borders and preserved sheet-focus and sidebar behavior.
- Phase 2 added confirmed fullscreen transitions, scoped focus and restoration migration. This changes window state and authority.
- Phase 3 gave Webspring and the single-app host real stage windows so a controller can move between frames. The full launch, return, QuickSwitch and MultiSwitch visual matrix is still open.
- [Phase 4](phase-4/titlebar/) placed title, controls, toolbar and accessories in shared chrome. The captures compare source-backed fixture scenes. The titlebar browser tests measure placement, overflow, drag exclusions and floating geometry.
- [Phase 5](phase-5/menu/) added independent menu bar and toolbar opt-ins using the same application menu. The semantic fixture captures closed/open states. The Cumulus recaptures show the glass aligned with the title row beneath the menu.
- Phase 6 documents window state, frame appearance and opt-in menus.
- [Phase 7](phase-7/split-layout/) added three-pane seams and animated sidebar and inspector collapse. The scoped before/after fixture verifies retained content and focus during geometry changes.
- Phase 8 is a [written Electron plan](../../plans/2026-11-14-electron-window-host.md).

## Pending design review

- Pending design | Atmo menu-bar Metal colours and noise art. The menu bar uses existing tokens and semantic menu parts.
- Pending design | Atmo circular toolbar groups. The placeholder uses the existing button group.
- Pending design | Floating Cumulus titlebar art. The window opts in through titlebarPresentation, with a semantic floating surface and existing-token paint. Metal stays attached.
- Pending design | Journal and JournalOld frame-view art for the Mountain Lion and leather variants. Both use metric and token placeholders.
- Compare the shared titlebar's inline toolbar, controls, dark accessory paint, and desktop/phone layout with the reference captures. The titlebar and menu fixtures include their source hashes and geometry.
- Production Journal, JournalOld, MemoJournal and SynCal phone comparison and the production stage motion matrix are still open.
- Window-controls-overlay verification remains open. Chrome accepted a temporary-profile PWA installation, but the test could not obtain a live native titlebar rectangle.

The frozen theme image baselines are retained. Verification logs are recorded separately as the frozen-source suites finish.

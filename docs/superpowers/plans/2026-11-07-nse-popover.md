# NSEPopover implementation plan

The owner's decision 4 is the approved design: retain AppKit edge names and compact sheets; add an anchored arrow, bounded placement, spring presentation and content-painted surfaces. Work in this checkout without changing branches, ports or site applications.

1. Add focused regressions for real Floating UI flips/shifts, arrow alignment and point-anchored context menus. Connect the arrow and draw a continuous rounded frame; keep geometry independent of presentation motion.
2. Add `drawsBackground` (default true) to the internal popover and `NSEPopoverPositioning`, using the content root's `--nse-popover-content-fill` for its arrow. Reuse AnimationFX spring sampling and the existing reduced-motion environment. Preserve focus, dismissal and compact content identity.
3. Document the API and mark decision 4 landed. Run focused overlay/controller tests, TypeScript and a server-free browser rendering probe at DPR 1 and 2. Commit only this task's changes, preserving concurrent edits.

Authority: `NSEPopover` owns presentation; Floating UI owns placement; the overlay manager owns interaction; Atmo owns paint; the animation environment owns reduced motion. A single SVG outline joins plate and arrow without a border seam. Content paints its own interior when background drawing is disabled.

Completed: TypeScript (`npx tsc -b --pretty false`), 176 focused tests across 11 files, and `node scripts/quality/verify-nse-popover.mjs` pass. The server-free browser probe covers Chromium, Firefox and WebKit at DPR 1 and 2, light/dark/paper surfaces, real spring samples (0.85, overshoot, 1), unchanged entry start time after reposition, bounded tall content, both reduced-motion sources, inert exit copies and compact sheets. Captures and measurements are in `artifacts/nse-popover/`. Light, dark, paper and compact captures were visually inspected. Site migration and application-level visual acceptance remain with Claude and the owner.

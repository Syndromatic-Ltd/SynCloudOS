# NSEPopover implementation plan

The owner's decision 4 is the approved design: retain AppKit edge names and compact sheets; add an anchored arrow, bounded placement, spring presentation and content-painted surfaces. Work in this checkout without changing branches, ports or site applications.

1. Add focused regressions for real Floating UI flips/shifts, arrow alignment and point-anchored context menus. Connect the arrow and draw a continuous rounded frame; keep geometry independent of presentation motion.
2. Add `drawsBackground` (default true) to the internal popover and `NSEPopoverPositioning`, using the content root's `--nse-popover-content-fill` for its arrow. Reuse AnimationFX spring sampling and the existing reduced-motion environment. Preserve focus, dismissal and compact content identity.
3. Document the API and mark decision 4 landed. Run focused overlay/controller tests, TypeScript and a server-free browser rendering probe at DPR 1 and 2. Commit only this task's changes, preserving concurrent edits.

Authority: `NSEPopover` owns presentation; Floating UI owns placement; the overlay manager owns interaction; Atmo owns paint; the animation environment owns reduced motion. A single SVG outline joins plate and arrow without a border seam. Content paints its own interior when background drawing is disabled.

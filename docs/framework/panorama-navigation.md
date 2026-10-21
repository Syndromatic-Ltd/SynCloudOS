# Panorama navigation

Panorama is a framework presentation, selected with the declarative
`peerNavigation.kind: "panorama"`. Theme identifiers never choose behavior;
packages provide typography and colors, not executable renderers. Use
`NSESourceListScene` projection `title` for the global application title. The
stage changes to command-only chrome only when a mounted scene registers this
presentation, retaining Home, QuickSwitch and application menu commands.

## Historical basis and adaptations

Microsoft's [Panorama overview](https://learn.microsoft.com/en-us/previous-versions/windows/apps/ff941104(v=vs.105))
describes a 24px next-content reveal in the original 480px-wide reference.
The [control architecture](https://learn.microsoft.com/en-us/previous-versions/windows/apps/ff941126(v=vs.105))
separates title, background and items, with direct item tracking and a single
title leaving and returning from the opposite edge. The
[design guidance](https://learn.microsoft.com/en-us/previous-versions/windows/apps/hh202912(v=vs.105))
specifies the title moving more slowly than the content and background.
The user's People hub reference is an unfolded Panorama, not a Pivot.

This implementation adapts the reveal to 5% of the actual viewport after a
24px inner content gutter. It reserves a separate global title band and section
heading band, and translates genuine destination content. The authored title
and background rates (.22 and .45 of content), 320ms cubic settling, 8px axis
lock, .18-panel drag threshold, and .5px/ms flick threshold over a recent 80ms window with 12px minimum travel are calibrated implementation choices,
not claims of undocumented Windows Phone constants. Desktop-width layouts,
clickable headings, keyboard arrows and previous/next commands are deliberate
accessibility/desktop adaptations; the original was portrait-oriented and its
Panorama headings were not Pivot-style tap controls.

## State and accessibility guarantees

Each app destination is mounted once. Cyclic positioning changes its transform,
not its React parent or key. A visited pane remains mounted when another theme
projects the same model as a source list or tab strip. Inactive panes remain
visible when needed for the peek but are inert and aria-hidden. Headings are a
separate tablist, so tapping a neighboring label does not activate the peeking
app's controls. Selection repairs focus out of a newly inert pane. Hierarchy
navigation keeps its own chrome even when the theme's peer presentation is
Panorama.

One destination has no wrap or peek. Two destinations cannot display the same
neighbor on both sides without duplicating its app tree: the unique neighbor
changes sides when the gesture reverses, and the two-sided peek is not seamless
in that special case. Three or more sections recycle fully exited slots ahead
of the viewport, including during settling and first/last wrap.

Vertical scrolling, editing, sliders and interactive controls retain their
native gestures. Desktop text selection is excluded. Interrupted transitions,
renderer re-entry, pointer cancellation/lost capture, RTL, and reduced-motion
changes are covered by focused tests in `nse-panorama-navigation.test.tsx`.

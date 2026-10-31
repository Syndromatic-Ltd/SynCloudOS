# Source-list application chrome

Declare a standard system frame with `sourceList` in the SynWare manifest. Use `NSESourceListScene` for the body. The system owns the application identity on the rail, dynamic main title, QuickSwitch, return control, the right-slot menu, and the rail width. Do not place another NSEAppFrame or top bar inside this scene.

```tsx
// Manifest
frame: {
  material: "metal", topBar: "standard",
  sourceList: { minWidth: 220, maxWidth: 320, defaultWidth: 254 },
}

// Application body
<NSESourceListScene
  title={selectedSection.title}
  compact={adaptiveSnapshot.renderer === "tabs"}
  sidebar={<NSESidebar surface="metal" header={<NSESearchField aria-label="Search sections" />} sections={sections} />}
  status={{ rail: "25 sections", leading: "Ready" }}
>
  {content}
</NSESourceListScene>
```

`NSESidebar.header` is a floating, transparent slot inside the row scroll surface. It reserves its natural height initially; rows scroll underneath it. The sidebar supplies one continuous material and the seam shadow across the whole rail. Applications supply controls, without a separate material wrapper or sticky-position CSS. Header input keys remain owned by the input rather than sidebar row navigation.

Section arrows manage collapse internally when both `collapsedSectionIds` and the section's `collapsed` flag are omitted. An application that needs persistence supplies `collapsedSectionIds` and handles `onToggleSection`; explicit controlled state always wins. Collapsed rows are inert and excluded from row keyboard navigation.

`NSESourceListScene.status.rail` is the sidebar footer cell; `leading`, `center` and `trailing` belong to the main footer. The scene draws one split footer and shares the system frame's rail width, so the header, body and footer seam resize together. Do not add a second footer inside the sidebar.

For the semantic navigation `projection` API, the adaptive controller selects compact chrome automatically. The physical sidebar/children API accepts `compact` when the application already owns its adaptive controllers. Compact mode retains the content subtree and hides the desktop rail/footer; the system top bar drops its rail at the same presentation threshold. Main content settings should be ordinary children of the page scroll view unless explicitly intended to remain pinned.

Peer navigation now compares three presentations using its allocated scene, in untransformed CSS pixels. A short landscape scene (height at most 480px, width greater than height) uses a 104px vertical rail when at least 360px remains for content. Other scenes retain bottom tabs below 768px and the source-list sidebar at larger widths. These are shared content budgets, not device or posture rules. The existing 72px tab height is retained; a shallow rail scrolls independently. Portrait scenes keep their width. An explicit `presentation: "bottom-tabs"` remains fixed.

`NSESourceListScene` supplies its allocation to the existing adaptive controller through `setContentBounds`. Custom class-based compositions may call that method from their view layout lifecycle; use client dimensions or ResizeObserver content dimensions, excluding animation transforms. Pass `null` when releasing that binding. Hidden or invalid sizes retain the last allocation. `snapshot.layoutBounds` records the decision rectangle, while `snapshot.traits` keeps canonical mount/host facts. Retained or unavailable host geometry cannot trigger a new presentation decision. No controller, destination host, selected route or document is recreated by a presentation change.

`NSETabBar orientation="vertical"` projects the same tab elements as a rail, including More, disabled destinations and accessible labels. Its tablist advertises vertical orientation and uses Up/Down/Home/End. Horizontal arrows follow inherited or explicit text direction. An adaptive scene transfers navigation focus between hidden sidebar and tab controls; content and external overlay focus remain owned by their existing responder. Scene compactness is also handed to the existing source-list frame so the body and header seam agree in short regular-width windows.

The rail is intended for peer destinations. Hierarchical folder/detail flows remain stack/list-detail navigation; editing commands, inspectors and modal actions retain their own abstractions. Browser emulation validates these layouts, but does not establish physical folding, Home Screen behavior or thumb reachability.

Automatic popover/sheet changes retain one portal surface and its content nodes. The existing overlay registration is updated in place, and a focus scope's live handle supports `updatePresentation({ kind, modal, trapFocus })`. That operation preserves ancestry, open children, ordering and original return focus; it cannot retarget scope ownership. Actual close still dismisses descendants and restores focus through the existing authority. Closed or superseded handles cannot update a replacement scope with the same id.

The right-slot menu already supplies About (when the host supplies attribution for the app) and System Preferences. Declare `applicationMenu.preferences` only when the app actually has a separate application preferences command; it adds an extra entry rather than replacing System Preferences.

Utility panels belong to their application session. Navigation between retained sections must not be treated as dismissal: keep a font panel mounted until explicit close or session teardown, even when its editing sample is currently hidden.

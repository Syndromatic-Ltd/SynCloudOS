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

The right-slot menu already supplies About (when the host supplies attribution for the app) and System Preferences. Declare `applicationMenu.preferences` only when the app actually has a separate application preferences command; it adds an extra entry rather than replacing System Preferences.

Utility panels belong to their application session. Navigation between retained sections must not be treated as dismissal: keep a font panel mounted until explicit close or session teardown, even when its editing sample is currently hidden.

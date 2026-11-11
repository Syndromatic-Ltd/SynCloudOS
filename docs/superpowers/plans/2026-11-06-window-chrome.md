# Window chrome: toolbar, title bar and bottom bar (phase 6, Option C stages 2–3)

AppKit defines the architecture; Atmo defines the appearance. Every step is checked against captures
taken before it (desktop and phone, light and dark, every control state) and must match pixel for pixel,
except where a difference is a recorded fix.

## Owner decisions

- Option C (2026-11-06): `NSEToolbarController` merges into `NSEToolbar`, which the window owns.
- D8 (2026-11-06): controls an app puts in its title bar are `NSETitlebarAccessoryViewController`s
  (`NSTitlebarAccessoryViewController`) added with `window.addTitlebarAccessoryViewController(_:)`.
  Publisher's File pull-down is a leading accessory; Atmo draws leading accessories beside the title.

## The AppKit shape

```ts
const toolbar = new NSEToolbar({
  identifier: "journal-publisher.toolbar",            // NSToolbar(identifier:)
  items,                                               // toolbar(_:itemForItemIdentifier:willBeInsertedIntoToolbar:)
  defaultItemIdentifiers, allowedItemIdentifiers,      // toolbarDefaultItemIdentifiers / toolbarAllowedItemIdentifiers
  displayMode: "iconAndLabel", sizeMode: "regular",
  allowsUserCustomization: true,
  autosavesConfiguration: true,                        // saved in the application's preferences under the identifier
});
window.toolbar = toolbar;                              // NSWindow.toolbar: the window draws it under the title bar
toolbar.runCustomizationPalette();                     // the customisation sheet, on the window
toolbar.insertItem("link", 3); toolbar.removeItem(3);  // insertItem(withItemIdentifier:at:), removeItem(at:)
toolbar.items; toolbar.visibleItems; toolbar.isVisible;

window.title = post.title;                             // centred in the title bar
window.subtitle = "Draft";                             // NSWindow.subtitle; Atmo draws it as the status capsule
window.addTitlebarAccessoryViewController(fileAccessory);   // layoutAttribute "leading" | "trailing" | "bottom"
```

- The window owns its toolbar (disposed with it) and resolves the command runtime and preference store from
  its application, so apps no longer build an `NSEPreferencesController` or pass `SCOS.menus.runtime`.
- The toolbar and accessories render inside the app's own React tree, so custom items keep the app's context,
  overlays and responder chain; accessories reach the host's title bar through a portal.
- The app name, QuickSwitch, the Webspring return and the right slot stay system chrome, drawn by the host.
  A window with a title shows the app name leading and the title centred (the source-list bar already does).

## Stages

1. Done: inline toolbars are `NSEButton` (`texturedRounded`) and `NSESegmentedControl` (`texturedRounded`).
2. Done: `NSEToolbar` is the model class (`NSEToolbarController` and `NSEToolbarConfigurationSheet` are
   internal); `window.toolbar` is drawn by the window; `runCustomizationPalette`, `validateVisibleItems`.
3. Done for Publisher: `window.title`, `window.subtitle`, `window.isDocumentEdited`, titlebar accessories
   (leading before the title, trailing after it, bottom under the toolbar) and the standard bar's document
   layout, in flow above the window. Publisher is `topBar: "standard"`; its phone back is the stage's
   navigation back (owner decision, 2026-11-06), drawn as its labelled push button; its phone recipes are
   Atmo's compact document title bar. The gallery and Software use `window.title` and the host's source-list
   frame; `NSETopBar` is internal. FieldLab remains a separate Fusion consumer.
4. Done: the status line is the window's bottom content border, `setContentBorderThickness(_:for: .minY)`, with the
   content's own raised labels (`NSETextField backgroundStyle="raised"`) over it, as in AppKit; a bottom titlebar
   accessory is not used, since it sits under the title bar. Atmo draws the band as the metal footer (tall) or the
   compact strip (short). Publisher and FieldLab use it. Phase 7 adds the approved `window.bottomBarAccessory`
   extension for ordinary views in that border; Software and the gallery supply their own footer cells,
   aligned with the shared split/sidebar seam. `NSEStatusBar` and `NSESourceListScene` are removed. Bottom navigation
   tabs remain `NSETabViewController` controls. Recorded difference: Publisher's light-mode bottom rim is 1 px darker (the window's rim now draws
   over its content border).

Users: Publisher (configured toolbar, custom top bar, status bar, phone bottom toolbar), the gallery (toolbar,
top bar and status bar specimens), Fusion FieldLab (configured toolbar in its menu strip, custom top bar,
status bar), SynCal's footer, Software and the gallery's window bottom-bar accessories.

## Open for later (owner)

- Menus without a global menu bar look different per app: Publisher shows one File pull-down in its title bar,
  FieldLab a full menu-bar strip (`NSEMenuBar` over `mainMenu`). The owner wants these standardised in a later pass.

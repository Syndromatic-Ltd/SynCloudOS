# NSEPageController

`NSEPageController` is the public owner of page navigation, including the paper curl. Import it from `@syndromatic/syncloudos/nse/page` and render its `view` with `<pages.view />`.

The focused entry exports only the controller and `NSEPageControllerOptions`, `NSEPageControllerSnapshot`, `NSEPageControllerTransitionStyle` and `NSEPageControllerSpineLocation`. The curl leaf, hook, renderer, geometry, presets and their types are private implementation modules. There is no standalone public page component or page facade.

## Controller contract

`transitionStyle` accepts `"stackHistory"` (the default), `"horizontalStrip"` and `"pageCurl"`.

- `stackHistory` shows a page from drill-in history. `navigateForwardToObject` discards the pages after the selected one and appends the new object.
- `horizontalStrip` lays pages side by side and slides between them.
- `pageCurl` uses the selected child controller's view as the curling sheet's front and reveals the next or previous child's view underneath. A drag from the trailing or leading edge, a horizontal swipe, or `navigateForward`/`navigateBack` turns it.

For page curls, `spineLocation: "min"` (the default) shows a single page and `"mid"` shows two-page spreads. These names follow `UIPageViewController.TransitionStyle.pageCurl` and `UIPageViewController.SpineLocation`, owner-approved exceptions to AppKit naming in decision 8 (2026-11-07). The controller remains the counterpart of `NSPageController`.

An app subclasses the controller and supplies `identifierForObject`, `viewControllerForIdentifier` and `prepareViewController`, after `NSPageControllerDelegate`. Children are created with `this.addChild(...)`; preparation sets each child's `representedObject` by default. In stack-history and horizontal-strip styles, the identifier selects a reusable child controller. In page-curl style the identifier still names the page kind, but each arranged object retains its own child because multiple printed pages can be visible together. Each live child view is mounted once. Any repeated decorative front, reverse or ghost face uses an inert DOM replica.

`getSnapshot()` and controller observation expose `selectedIndex`, `count`, `turnProgress` (`0..1`) and `turnDirection` (`"forward"`, `"backward"` or `null`). In page-curl style, `didTransitionToObject(object)` fires only after a successful curl completion. Cancelling a gesture keeps the current selection and sends no completion delegate call. Portfolio reads the snapshot for its book scene; the app retains ownership of opening and closing that scene.

`selectedIndex` selects a distant page without animation. In curl style `navigateForwardToObject` accepts the next arranged page or spread; distant and unarranged objects are rejected. Before the view loads, navigation completes immediately, as there is no visible sheet to animate.

## Curl rendering and interaction

The controller reuses the existing curl engine. A turn retains one renderer from start to finish: `data-curl-renderer` is `webgl` or `css`. Where WebGL 2 is available, the resting page is drawn into a texture and rolled around the fold in a WebGL canvas, with soft shadows and its own print showing through the underside. The CSS fold is the fallback, and reduced motion crossfades the page faces.

The geometry module models a physical fold in measured layout pixels, using `ResizeObserver` so angles stay true at any aspect ratio:

- During an automatic corner peel, the page corner follows an arc toward the far corner. During a drag, the fold tracks the pointer before settling forward or back.
- The fold line is the perpendicular bisector of the resting and curled corners. The front is clipped there and the flap is reflected across that line.
- A quadratic bulge rounds the flap's crease silhouette. Fold-aligned gradients provide rim light, crease shadow and roll highlight; a cast shadow falls on the page underneath.
- The internal book-corner trajectory travels across twice a leaf's width, landing on the opposite side of the binding. Leading and trailing corners mirror it. Reverse faces compensate for the fold's reflection.
- Decorative curl carriers and repeated printed faces are `aria-hidden`, inert and excluded from pointer input. Live child controls keep a single semantic mount.

The renderer also retains its internal peel, rigid spine-turn, strip-based flexible turn and tear machinery. Built-in presets and low-level progress/gesture handles are engine details rather than application API. Engine tests import those modules directly; consumers navigate through the controller.

## Verification boundary

Geometry, engine lifecycle, inert replicas, controller navigation and public-package exports have automated coverage. Rendered curls, pointer input, page content and reduced motion still require browser evidence for the affected consumer and renderer. Static geometry or jsdom checks alone do not establish GPU or human visual acceptance.

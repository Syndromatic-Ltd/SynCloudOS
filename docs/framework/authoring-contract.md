# SynCloudOS authoring contract

This page says which SynCloudOS API to use for each part of a SynWare application. It's written for people and for coding agents: the SDK ships it as `AGENTS.md` at the root of the installed `@syndromatic/syncloudos` package, so an agent working in your project finds it before it writes code.

An app can mount and pass validation and still work against the framework. If it keeps its state in React hooks, draws its own buttons and paints its own palette, it loses most of what SynCloudOS provides: the selected appearance in light and dark, focus and keyboard handling, accessibility, the responder chain, undo, document saving and managed lifetimes. Use these APIs instead:

| Job | Use | Do not use |
| --- | --- | --- |
| Application, window and view ownership | An `NSEApplication` subclass as the default export, `NSEWindowController`, and `NSEViewController` subclasses holding `@observable` state, `bind()` bindings, `@action` methods and `actionRef()` handles. See [Class authoring](cocoa-authoring.md). | A plain function component with many `useState` and `useEffect` hooks as the application. Function authoring is an explicit opt-in for small apps. |
| Controls | `NSEButton`, `NSESwitch`, `NSETextField`, `NSESearchField`, `NSESlider`, `NSEStepper`, `NSESegmentedControl`, `NSEPopUpButton`, `NSETextView`, `NSETableView` with an `NSEArrayController`, `NSESplitView`, `NSETabView` and `NSEToolbar`. See [NSE controls](nse-controls.md). | Raw `<button>`, `<input>`, `<select>` or `<textarea>` controls, or an interactive list built from `<table>`. A static content table is legitimate. |
| Appearance and dark mode | NSE semantic appearance values (`--nse-colour-*`) in light and dark. Atmo is the default. A custom look is a `.scostheme` [theme bundle](themes.md), which the Developer MCP can create and check with `scaffold_theme` and `validate_theme`. See [Appearance](appearance.md). | Hard-coded UI colour overrides, private NSE class selectors, and forcing a named appearance without a reasoned opt-out. A theme bundle may supply its own palette. |
| Primary application state | A document type declared in `documentTypes` and opened through `workspaceDocuments`, which provides saving, undo and autosave. See [Documents](documents.md). | `preferences.set()` holding JSON records. Preferences are for small settings. |
| Asynchronous and worker computation | `managedTask(this, { lifetime, policy: "latest", debounceMs })` on a view controller, which cancels superseded work and ends with the view. | `new Worker()` or promises started inside `useEffect`. |
| 2.5D layer animation | `this.fx.animation.manageRenderer(outlet)` with `AFXLayer`. | Hand-written `requestAnimationFrame` loops. |
| Three.js, raw WebGL2 or WebGPU | `this.fx.animation.manageDisplayLink(outlet, { drawableSizeDidChange })`, `onFrame` and `setNeedsDisplay()`. The display link paces frames, pauses while the view is hidden or off screen, follows reduced motion and reports the drawable size; your engine owns the canvas context. | `requestAnimationFrame`, `ResizeObserver` and `devicePixelRatio` wired by hand in an effect. |
| 2D vector figures and plots | `GFXContext` recording a `GFXDisplayList`, drawn on screen by `NSEView.draw(dirtyRect, context)` (replay cached figures with `context.drawDisplayList`, use `layerContentsPlacement` and an `@outlet` of `NSEViewOutlet<HTMLDivElement>`) and exported to SVG or PDF from the same display list. | A second, hand-written `<svg>` component that duplicates the exported figure. |

## NSE names follow AppKit

NSE classes, properties and methods keep the names, shape and meaning of their AppKit counterparts, so if you know AppKit you can usually guess the NSE API. When you need something:

- Look for the existing NSE way first. A child view controller's view is placed with `<child.view />`; a dialog is a view controller presented with `presentAsSheet`, `presentAsModalWindow` or `presentAsPopover`; an alert is an `NSEAlert`.
- A new look is a theme drawing for an existing control style (a `bezelStyle`, a `tabStyle`, a box type), never a new component.
- Don't invent API that only sounds plausible, and don't bring in UIKit classes or idioms. If nothing fits, say so and propose the smallest addition in the same style instead of adding one silently.
- The Developer MCP's `lookup_sdk` reports each NSE symbol's `appkitCounterpart`. Read it before you use the symbol; when it says there is none, it explains why, and names a `replacement` where one exists.

Every package entry exports the same objects, so you can mix imports from different entries safely. Prefer one entry per job: `@syndromatic/syncloudos` for application, window and view controller classes, decorators and `SCOS`; `@syndromatic/syncloudos/nse` for controls and NSE types, with focused controls such as `NSEDrawer` in `@syndromatic/syncloudos/nse/controls`; `@syndromatic/syncloudos/sdk` for `SynWareInfo` and hooks; and `@syndromatic/syncloudos/sdk/testing` for tests.

Start a new application from the scaffold, which follows this contract: `npm run synware:create -- Name.app` in the framework checkout, or the Developer MCP `scaffold` tool. Both default to class authoring with a separate view file.

The Developer MCP `validate` tool returns an `idiomAudit`. Its `idiom.*` findings have `severity: "error"` for definite misuse that has a replacement, and `severity: "warning"` for heuristics. Errors make `ok` false, and any idiom finding makes `idiomatic` false. A `// syncloudos-allow <rule-id>: <reason>` comment exempts its own line or the next one, and the result lists every such comment. Surfaces and calls owned by a third-party renderer, and ordinary APIs with no SynCloudOS equivalent, are exempt, but UI beside a renderer in the same file is still checked. Explicit overflow is a warning, not an error. See [the rule reconciliation](developer-mcp/idiom-rules.md).

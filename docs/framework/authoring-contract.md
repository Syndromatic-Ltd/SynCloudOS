# SynCloudOS authoring contract

This is the contract for writing a SynWare application with SynCloudOS. It is written for people and for coding agents. The installed SDK ships it as `AGENTS.md` at the root of the installed `@syndromatic/syncloudos` package, so an agent working in a consumer project finds it before writing code.

A SynWare that mounts and validates is not automatically idiomatic. An app that keeps its state in React hooks, draws its own buttons and paints its own palette loses most of SynCloudOS: NSE's selected appearance in light and dark, focus and keyboard handling, accessibility, the responder chain, undo, document saving and managed lifetimes. Use the APIs below for each job.

| Job | Use | Do not use |
| --- | --- | --- |
| Application, window and view ownership | An `NSEApplication` subclass as the default export, `NSEWindowController`, and `NSEViewController` subclasses holding `@observable` state, `bind()` bindings, `@action` methods and `actionRef()` handles. See [Class authoring](cocoa-authoring.md). | A plain function component with many `useState` and `useEffect` hooks as the application. Function authoring is an explicit opt-in for small apps. |
| Controls | `NSEButton`, `NSESwitch`, `NSETextField`, `NSESearchField`, `NSESlider`, `NSEStepper`, `NSESegmentedControl`, `NSEPopUpButton`, `NSETextView`, `NSETableView` with an `NSEArrayController`, `NSESplitView`, `NSETabView` and `NSEToolbar`. See [NSE controls](nse-controls.md). | Raw `<button>`, `<input>`, `<select>` or `<textarea>` controls, or an interactive list built from `<table>`. A static content table is legitimate. |
| Appearance and dark mode | NSE semantic appearance values in light and dark. Atmo is the default; custom themes are supported through `defineNSEAppearance` and can be provisioned and checked with Developer MCP `scaffold_theme` / `validate_theme`. See [Appearance](appearance.md). | Hard-coded UI colour overrides, private NSE class selectors, and forced named system appearances without a reasoned opt-out. Theme definitions may supply their own palette. |
| Primary application state | A document type declared in `documentTypes` and opened through `workspaceDocuments`, which provides saving, undo and autosave. See [Documents](documents.md). | `preferences.set()` holding JSON records. Preferences are for small settings. |
| Asynchronous and worker computation | `managedTask(this, { lifetime, policy: "latest", debounceMs })` on a view controller, which cancels superseded work and ends with the view. | `new Worker()` or promises started inside `useEffect`. |
| 2.5D layer animation | `this.fx.animation.manageRenderer(outlet)` with `AFXLayer`. | Hand-written `requestAnimationFrame` loops. |
| Three.js, raw WebGL2 or WebGPU | `this.fx.animation.manageDisplayLink(outlet, { drawableSizeDidChange })`, `onFrame` and `setNeedsDisplay()`. The display link paces frames, pauses while the view is hidden or off screen, follows reduced motion and reports the drawable size; your engine owns the canvas context. | `requestAnimationFrame`, `ResizeObserver` and `devicePixelRatio` wired by hand in an effect. |
| 2D vector figures and plots | `GFXContext` recording a `GFXDisplayList`, drawn on screen by `NSEView.draw(dirtyRect, context)` (replay cached figures with `context.drawDisplayList`, use `layerContentsPlacement` and an `@outlet` of `NSEViewOutlet<HTMLDivElement>`) and exported to SVG or PDF from the same display list. | A second, hand-written `<svg>` component that duplicates the exported figure. |

## NSE names are AppKit names

NSE follows AppKit, and the FX frameworks follow Apple's Core frameworks: an NSE class, property or method has the name, shape and meaning of its AppKit counterpart (`NSEPopUpButton` is `NSPopUpButton`, `isEnabled` is `isEnabled`, `presentAsSheet` is `presentAsSheet(_:)`). When you need something:

- Look for the AppKit way first, and write it with NSE's names. A child view controller's view is placed with `<child.view />`, as AppKit adds a subview; a dialog is a view controller presented with `presentAsSheet`, `presentAsModalWindow` or `presentAsPopover`; an alert is an `NSEAlert`.
- A new appearance is a theme recipe for the selected appearance to draw for an existing AppKit class (a `bezelStyle`, a `tabStyle`, a box type), never a new component.
- Do not invent API with an AppKit-sounding name, or bring in UIKit classes and idioms. If AppKit has no counterpart, say so and propose the smallest AppKit-shaped addition rather than adding one silently.
- The Developer MCP's `lookup_sdk` gives each NSE symbol its `appkitCounterpart`. Read it before using the symbol, and when it says there is none, use its `replacement`.

Every package entry exports the same objects, so imports from different entries mix safely. Prefer one entry per job: `@syndromatic/syncloudos` for application, window and view controller classes, decorators and `SCOS`; `@syndromatic/syncloudos/nse` for controls and NSE types, with focused controls such as `NSEDrawer` in `@syndromatic/syncloudos/nse/controls`; `@syndromatic/syncloudos/sdk` for `SynWareInfo` and hooks; and `@syndromatic/syncloudos/sdk/testing` for tests.

Start new applications from the scaffold, which follows this contract: `create-synware Name.app` from the framework, or the Developer MCP `scaffold` tool. Both default to class authoring with a separate view file.

The Developer MCP `validate` tool returns an `idiomAudit`. Its `idiom.*` findings have `severity: "error"` for definite misuse with an existing replacement and `severity: "warning"` for heuristics. Errors make `ok` false. Any idiom finding makes `idiomatic` false. Reasoned `// syncloudos-allow <rule-id>: <reason>` comments exempt their own or the next line and are listed in the result. Third-party renderer-owned surfaces and calls, and ordinary APIs without an equivalent, are exempt. UI beside a renderer in the same file is still checked. Explicit overflow is a warning rather than an error. See [the rule reconciliation](developer-mcp/idiom-rules.md).

# SynCloudOS authoring contract

This is the contract for writing a SynWare application with SynCloudOS. It is written for people and for coding agents. The installed SDK ships it as `AGENTS.md` at the root of the installed `@syndromatic/syncloudos` package, so an agent working in a consumer project finds it before writing code.

A SynWare that mounts and validates is not automatically idiomatic. An app that keeps its state in React hooks, draws its own buttons and paints its own palette loses most of SynCloudOS: Atmo's appearance in light and dark, focus and keyboard handling, accessibility, the responder chain, undo, document saving and managed lifetimes. Use the APIs below for each job.

| Job | Use | Do not use |
| --- | --- | --- |
| Application, window and view ownership | An `NSEApplication` subclass as the default export, `NSEWindowController`, and `NSEViewController` subclasses holding `@observable` state, `bind()` bindings, `@action` methods and `actionRef()` handles. See [Class authoring](cocoa-authoring.md). | A plain function component with many `useState` and `useEffect` hooks as the application. Function authoring is an explicit opt-in for small apps. |
| Controls | `NSEButton`, `NSESwitch`, `NSETextField`, `NSESearchField`, `NSESlider`, `NSEStepper`, `NSESegmentedControl`, `NSEPopUpButton`, `NSETextView`, `NSETableView` with an `NSEArrayController`, `NSESplitView`, `NSETabView` and `NSEToolbar`. See [NSE controls](nse-controls.md). | Raw `<button>`, `<input>`, `<select>`, `<textarea>` or `<table>` elements. |
| Appearance and dark mode | Atmo, the vector theme SynCloudOS ships. It draws NSE controls and window and application chrome, and it supports light and dark colour schemes itself (`colourScheme` `"auto"`, `"light"` or `"dark"`). Use semantic tokens (`var(--nse-*)`) and `[data-mode="dark"]` only for your own content. See [Appearance](appearance.md). | A custom stylesheet with a hard-coded hex palette. Atmo-Heritage and Atmo-Onyx, which are obsolete raster themes and are never a dark mode. |
| Primary application state | A document type declared in `documentTypes` and opened through `workspaceDocuments`, which provides saving, undo and autosave. See [Documents](documents.md). | `preferences.set()` holding JSON records. Preferences are for small settings. |
| Asynchronous and worker computation | `managedTask(this, { lifetime, policy: "latest", debounceMs })` on a view controller, which cancels superseded work and ends with the view. | `new Worker()` or promises started inside `useEffect`. |
| 2.5D layer animation | `this.fx.animation.manageRenderer(outlet)` with `AFXLayer`. | Hand-written `requestAnimationFrame` loops. |
| Three.js, raw WebGL2 or WebGPU | `this.fx.animation.manageDisplayLink(outlet, { drawableSizeDidChange })`, `onFrame` and `setNeedsDisplay()`. The display link paces frames, pauses while the view is hidden or off screen, follows reduced motion and reports the drawable size; your engine owns the canvas context. | `requestAnimationFrame`, `ResizeObserver` and `devicePixelRatio` wired by hand in an effect. |
| 2D vector figures and plots | `GFXContext` recording a `GFXDisplayList`, drawn on screen by `NSEView.draw(dirtyRect, context)` (replay cached figures with `context.drawDisplayList`, use `layerContentsPlacement` and an `@outlet` of `NSEViewOutlet<HTMLDivElement>`) and exported to SVG or PDF from the same display list. | A second, hand-written `<svg>` component that duplicates the exported figure. |

## NSE names are AppKit names

NSE follows AppKit, and the FX frameworks follow Apple's Core frameworks: an NSE class, property or method has the name, shape and meaning of its AppKit counterpart (`NSEPopUpButton` is `NSPopUpButton`, `isEnabled` is `isEnabled`, `presentAsSheet` is `presentAsSheet(_:)`). When you need something:

- Look for the AppKit way first, and write it with NSE's names. A child view controller's view is placed with `<child.view />`, as AppKit adds a subview; a dialog is a view controller presented with `presentAsSheet`, `presentAsModalWindow` or `presentAsPopover`; an alert is an `NSEAlert`.
- A new appearance is a theme recipe that Atmo draws for an existing AppKit class (a `bezelStyle`, a `tabStyle`, a box type), never a new component.
- Do not invent API with an AppKit-sounding name, or bring in UIKit classes and idioms. If AppKit has no counterpart, say so and propose the smallest AppKit-shaped addition rather than adding one silently.
- The Developer MCP's `lookup_sdk` gives each NSE symbol its `appkitCounterpart`. Read it before using the symbol, and when it says there is none, use its `replacement`.

Every package entry exports the same objects, so imports from different entries mix safely. Prefer one entry per job: `@syndromatic/syncloudos` for application, window and view controller classes, decorators and `SCOS`; `@syndromatic/syncloudos/nse` for controls and NSE types, with focused controls such as `NSEDrawer` in `@syndromatic/syncloudos/nse/controls`; `@syndromatic/syncloudos/sdk` for `SynWareInfo` and hooks; and `@syndromatic/syncloudos/sdk/testing` for tests.

Start new applications from the scaffold, which follows this contract: `create-synware Name.app` from the framework, or the Developer MCP `scaffold` tool. Both default to class authoring with a separate view file.

The Developer MCP `validate` tool returns an `idiomAudit`. Its `idiom.*` findings have `severity: "warning"`: they never make `ok` false, but a project with idiom warnings is not idiomatic SynCloudOS. Treat each one as work to do.

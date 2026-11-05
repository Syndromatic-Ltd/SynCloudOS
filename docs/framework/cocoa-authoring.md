# Class authoring, bindings and managed work

Use classes for application/window/region ownership and ordinary React components for layout and local hook state. The root import supplies the authoring contracts; controls and all twelve FX frameworks retain their existing subpaths. TypeScript 6.0.3 uses standard TC39 decorators without `experimentalDecorators` or `emitDecoratorMetadata`.

## Inline and separate views

An application that needs no custom window policy declares its root class directly:

```tsx
import { NSEApplication, NSEViewController, observable, bind, action, actionRef, type NSEBinding } from "@syndromatic/syncloudos";
import { NSESearchField, NSEButton } from "@syndromatic/syncloudos/nse/controls";

class SearchController extends NSEViewController {
  @observable accessor query = "";
  readonly queryBinding: NSEBinding<string> = bind<SearchController, "query">(this, "query");
  @action clearSearch() { this.query = ""; return this.query; }
  override renderView() {
    return <section>
      <NSESearchField aria-label="Search" binding={this.queryBinding} />
      <NSEButton action={actionRef(SearchController, "clearSearch")} title="Clear" />
    </section>;
  }
}
export default class SearchApplication extends NSEApplication {
  static override mainViewController = SearchController;
}
```

The descriptor's explicit type arguments avoid polymorphic-`this` inference inside a field initializer. Outside that initializer, `bind(controller, "query")` infers the concrete property normally. Bind descriptors are stable and inert; each mounted control acquires its own editor lease.

For a separate view, use `static view = SearchView` on the same controller. `SearchView({ controller })` is an ordinary function component; call `useState`, `useSCOS`, DOM measurement hooks and local refs there. Do not call React hooks directly from `renderView`, or declare both `renderView` and `static view`. The host observes the controller automatically; `static viewDependencies = (controller: SearchController) => [controller.search]` names additional observable sources and rebinds them after notifications.

For a custom window, `static contentViewControllerClass` constructs the root in its own ownership scope and supplies the owning window as its constructor argument:

```tsx
class InspectorContent extends NSEViewController {
  constructor(readonly windowController: InspectorWindow) { super(); }
  override renderView() {
    return <button onClick={() => void this.windowController.window.close()}>Close inspector</button>;
  }
}
class InspectorWindow extends NSEWindowController {
  static override contentViewControllerClass = InspectorContent;
}
```

Import `NSEWindowController` from the root for that pattern. No-argument root constructors remain valid. Declare `static mainWindow = InspectorWindow` on the application when window close/document policy is needed; declare `mainViewController` when the framework's ordinary main window is sufficient. Dynamic children use `addChild(ChildClass, ...arguments)` so each child receives its own construction scope. Avoid constructing a root eagerly in a window field initializer.

## Value authority and editing

`binding` is a permanent alternative to controlled/uncontrolled value callbacks. It cannot be combined with that control's value writer, initial value or separate undo owner. The explicit `createNSEBinding(owner, adapter)` form supplies canonical snapshots and editor leases for document/selection transactions; it does not invent another document or undo history. Invalid commits retain the editor and expose its issues. `useNSEBinding` supports app-owned views using the same contract.

For `NSEComboBox`, `binding<string>` owns editable text and excludes `inputValue` and `onInputValueChange`. `value` and `onValueChange` remain the separate typed domain-selection channel. Selecting a represented object uses the data source's label for the bound text. Freeform text, form submission and IME composition retain their existing semantics; binding a string does not convert the represented object into a string.

Other value families preserve their existing native forms, focus, accessible invalid messages, composition boundaries, preview/commit/cancel behavior and controller models. A search should be debounced once: use the field's existing query mechanism or the task debounce, not both.

## Actions and undo

`actionRef(ControllerClass, "method")` returns immutable declaration metadata. It infers the method's zero/one payload argument and awaited result, validates `@action` metadata, and captures no controller instance. `useAction(reference, payload?)` and action-capable controls, menus and toolbars still dispatch through the focused responder chain. Their runtime validation, disabled/hidden states, payload schemas, exact target acceptance and cancellation remain authoritative. Dynamic string action IDs remain supported.

An `@action` method's actual result travels through canonical mounted result admission. `NSEActionOptions<Payload, Result>.undo` accepts the existing command undo policy. Omit it when the document/text transaction already registers undo, so one edit does not acquire two histories. A TypeScript payload type is not a runtime parser; use the command schema and mounted portable payload builders at boundaries. DOM nodes, File values, callbacks and live leases belong in domain/outlet adapters rather than command payloads.

Menu and toolbar controllers constructed in functional views also have a real owner: their required runtime port supplies its lifetime signal when neither an explicit owner nor a synchronous class construction owner exists. Class factories keep their narrower ownership. Functional views may still dispose their local controllers earlier on unmount; they need no extra owner argument for these runtime-backed controllers.

## Tasks, observations and preferences

`managedTask(owner, { lifetime, policy, run, apply })` owns asynchronous work. View controllers can use `owner`, `mounted` or `visible` lifetime; applications and windows use `owner`. Choose `latest` for supersedable reads, optionally with `debounceMs`; choose `serial` for ordered writes, optionally with `maximumQueued`. Read `getSnapshot()` for pending/value/error and each run's `finished` for succeeded/failed/cancelled settlement.

After every await, recheck cancellation before domain work. `context.commit` gates a synchronous mutation against the run and captured lifetime; it returns false without invoking stale work. `context.own` constructs synchronous run-owned resources and releases them at settlement. For a resource that must survive that run, construct it through `controller.own` inside a successful commit. Factories, apply and commit callbacks are synchronous. A task cannot undo an arbitrary external side effect or turn an unknown external write outcome into a cancelled write; document/provider revisions and external idempotency contracts still apply.

`@observes("query", { lifetime: "mounted", initial: true })` observes one direct property. Its synchronous method receives the new and previous values; schedule a managed task for asynchronous work. Source factories/projectors support external observables. Initial delivery follows construction/ref/load ordering and pending deliveries are fenced by their lifetime epoch.

`@preference("explicit.key") accessor includeArchived = false` uses the accessor initializer as its default and the attached app's persistence authority. Complex values use a versioned descriptor/parser/migrations. Failed writes retain the prior published value. Existing grouped preferences drafts stay with `NSEPreferencesController`. Navigation restoration uses its existing controller APIs and preserves explicit-route precedence; it is not another route store.

Adapters for grouped preferences can import `PreferenceValidationError` and `PreferencePersistenceError` beside `NSEPreferencesController` from the NSE entry. Invalid values and refused synchronous writes can become binding issues; unexpected or unknown-outcome failures must still reject. Keep the controller's transaction and saved envelope.

## Outlets and animation

`@outlet accessor artwork!: NSEViewOutlet<HTMLDivElement>` creates a stable typed handle; attach `ref={controller.artwork.ref}`. `current` is nullable. `element`, `layer` and `mountSignal` require a live committed mount. Retaining the handle does not own a React node or keep an old mount alive. An outlet connects any HTML element or a root `<svg>`, such as the one `NSEGraphicsView` renders. Canvas outlets use `controller.fx.animation.manageRenderer(outlet, options)` with the existing scoped renderer, full content-bound DPR and explicit capability errors.

`AFXTransaction.perform({ duration, delay, timing, disableActions }, changes)` closes a synchronous layer transaction in `finally`. It inherits outer options, batches actual applicable layer actions and does not roll back application model writes. Async callbacks are invalid. Existing begin/commit/flush, explicit animation handles and all other FX framework imports remain available.

Managed frame callbacks use monotonic seconds and stop when the view is inactive. Resuming begins with delta zero. Select reduced-motion behavior explicitly (`static` or `continue`), retain the scene's real content/media timebases and handle unsupported renderers through the app's unavailable UI. Source and jsdom tests do not prove physical-GPU or visual acceptance.

### Display links for your own GPU engine

`manageRenderer` gives the canvas to `AFXRenderer`, and a canvas has exactly one context owner. When Three.js, raw WebGL2 or WebGPU draws instead, use `controller.fx.animation.manageDisplayLink(outlet, options)`, the `CADisplayLink` / `MTKView` pattern. It runs the same managed machinery as a renderer (mount lifetime, view visibility, on-screen tracking, resizes, device pixel ratio, the application frame scheduler and reduced motion) but never creates a context and never writes `canvas.width` or `canvas.height`.

- `drawableSizeDidChange(viewport)` runs in the frame-batched resize pass, before frame observers, whenever the CSS size or pixel ratio changes. Size your drawing buffer there.
- `onFrame(callback, { reducedMotion })` delivers `time`, `delta`, `reducedMotion`, `width`, `height` and `pixelRatio`. `static` observers draw once under reduced motion and again only when display is needed.
- `setNeedsDisplay()` requests one more frame for every observer. Changes to the controller already request display; call it when state the controller doesn't observe changes, such as a camera an orbit control moved.
- A mounted canvas takes a renderer or a display link, never both. A second request with the same options returns the same link.

```tsx
import * as THREE from "three";
import { NSEViewController, observable, outlet, type NSEManagedAFXDisplayLink, type NSEViewOutlet } from "@syndromatic/syncloudos";
import type { AFXRendererViewport } from "@syndromatic/syncloudos/fx/animation";

export class FieldViewController extends NSEViewController {
  @outlet accessor scene!: NSEViewOutlet<HTMLCanvasElement>;
  @observable accessor coilCurrent = 1;
  readonly #camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  readonly #world = new THREE.Scene();
  #renderer?: THREE.WebGLRenderer;
  #link?: NSEManagedAFXDisplayLink;

  // One stable function, so asking for the link again returns the same one.
  readonly #drawableSizeDidChange = ({ width, height, pixelRatio }: AFXRendererViewport) => {
    this.#renderer!.setPixelRatio(pixelRatio);
    this.#renderer!.setSize(width, height, false);
    this.#camera.aspect = width / height;
    this.#camera.updateProjectionMatrix();
  };

  override viewDidAppear() {
    // A remount brings a new canvas and a new link; an ordinary reappearance does not.
    if (this.#link && this.#renderer?.domElement === this.scene.element) return;
    this.#renderer?.dispose();
    this.#renderer = new THREE.WebGLRenderer({ canvas: this.scene.element, antialias: true });
    this.#link = this.fx.animation.manageDisplayLink(this.scene, { drawableSizeDidChange: this.#drawableSizeDidChange });
    this.#link.onFrame(() => this.#renderer!.render(this.#world, this.#camera), { reducedMotion: "static" });
  }

  protected override didDispose() { this.#renderer?.dispose(); }

  override renderView() {
    return <canvas ref={this.scene.ref} aria-label="Magnetic field" style={{ inlineSize: "100%", blockSize: "100%" }} />;
  }
}
```

Create the engine's renderer before asking for the link: `drawableSizeDidChange` runs once while the link is set up, with the first size. The display link ends with the mount on its own; the engine's renderer and scene are yours to dispose.

### Vector figures and plots

Record a figure once with `GFXContext`, draw its `GFXDisplayList` on screen with `NSEGraphicsView`, and export the same display list to SVG or PDF; don't write a second `<svg>` component for the screen. `NSEGraphicsView` forwards its ref to the root `<svg>`, so `@outlet accessor plot!: NSEViewOutlet<SVGSVGElement>` connects with `ref={this.plot.ref}`.

- `autoSize` fills the layout container and scales through the viewBox, instead of keeping the display list's size in CSS pixels.
- `contentsGravity` is `"resize-aspect"` (the default: the whole figure stays visible, centred), `"resize-aspect-fill"` or `"resize"`, as on `AFXLayer`.
- Pointer handlers (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerLeave`, `onPointerCancel`) receive the event and `locationInView`, the point in display-list coordinates after scaling and gravity. `convertPointToGFXDisplayList(svg, clientX, clientY, displayList)` performs the same conversion directly. Points beyond the figure are not clipped, so drags can continue past an edge.

`GFXContext.recording` needs `identifiers`, an issuer that gives every gradient, clip and pattern definition in the output an identifier unique on the page. Ask the host for one with `SCOS.images.createGraphicsIdentifierIssuer()` (or `useImages().createGraphicsIdentifierIssuer()` in a view); see [Graphics contexts](fx/graphics/contexts.md).

```ts
const context = GFXContext.recording({ size: { width: 480, height: 240 }, identifiers: SCOS.images.createGraphicsIdentifierIssuer() });
context.fillPath(GFXPath.ellipse({ x: 8, y: 8, width: 64, height: 64 }), GFXColour.rgba(0.2, 0.5, 0.8));
const figure = context.displayList; // draw with <NSEGraphicsView displayList={figure} autoSize />
```

## Scaffolds and validation

`synware:create Search.app` generates the separate-view pattern by default, with `Contents/Views/SearchView.tsx`; `--authoring inline` keeps the view in `index.tsx`. Add `--content-application-menu` to declare `applicationMenu.trigger: "content"` and render the menu trigger as an `NSEButton`. `--authoring function` is an explicit opt-in for a function-component app, and it is what the hook-based `--fx` recipe scaffolds use when no authoring is given. Class views can compose those components; combining class scaffold mode with `--fx` is diagnosed before writing files. The Developer MCP `scaffold` tool uses the same templates.

The [authoring contract](authoring-contract.md) lists which API to use for each job, and the Developer MCP `validate` tool reports `idiom.*` warnings where an application departs from it.

Run `npm run typecheck:authoring` for public positive/negative contracts. The complete [installed consumer specimen](../../tests/fixtures/synware-authoring/6e/README.md) has standalone TypeScript/Vitest configs with no source aliases. Its package acceptance requires the exact built archive in a clean directory. The source host gate exercises those same application files without proving packed acceptance.

HMR keeps state on compatible method/render edits, refreshes actions through the canonical responder bindings and relaunches only the affected app when resource/decorator/dependency declarations change. Local descriptors referenced by fields participate in the signature; unrelated local constants do not. Classes with private brands keep the existing conservative relaunch rule. Real relaunch ends old tasks/outlets so stale callbacks cannot publish into the replacement epoch.

# Class authoring, bindings and managed work

In a class-based application, classes own the application, its windows and the regions inside them, and ordinary React components handle layout and local hook state. This page shows how the two connect: views, bindings, actions, managed tasks and outlets. The authoring APIs come from the package root; controls and the twenty-two FX frameworks keep their own subpaths. With TypeScript 6.0.3 the decorators are standard TC39 decorators, so you don't set `experimentalDecorators` or `emitDecoratorMetadata`.

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

The explicit type arguments on `bind` are needed inside a field initialiser, where TypeScript would otherwise infer a polymorphic `this`. Elsewhere, `bind(controller, "query")` infers the property type on its own. A binding descriptor is stable and does nothing by itself; each mounted control takes its own editor lease from it.

For a separate view, set `static view = SearchView` on the same controller. `SearchView({ controller })` is an ordinary function component, so that's where `useState`, `useSCOS`, DOM measurement hooks and local refs go. Don't call React hooks from `renderView`, and don't declare both `renderView` and `static view`. The host observes the controller for you; to observe other objects as well, list them with `static viewDependencies = (controller: SearchController) => [controller.search]`, which is re-evaluated after each notification.

For a custom window, `static contentViewControllerClass` constructs the root view controller, owned by the window, and passes the window controller to its constructor:

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

Import `NSEWindowController` from the package root for this pattern. A root constructor that takes no arguments works too. Declare `static mainWindow = InspectorWindow` on the application when you need your own window close or document policy, and `mainViewController` when the framework's standard main window is enough. Create dynamic children with `addChild(ChildClass, ...arguments)` so that each child is owned correctly, and don't construct a root eagerly in a window field initialiser.

## Value authority and editing

`binding` replaces the controlled and uncontrolled value props. You can't combine it with the control's value callback, initial value or a separate undo owner. For document or selection transactions, `createNSEBinding(owner, adapter)` lets you supply the snapshots and editor leases yourself; it uses your document and undo history and creates no new ones. An invalid commit keeps the editor open and reports its issues. `useNSEBinding` gives your own views the same contract.

On `NSEComboBox`, a `binding<string>` owns the editable text, so you can't also pass `inputValue` or `onInputValueChange`. `value` and `onValueChange` stay as the separate, typed selection. Choosing an item puts the data source's label into the bound text. Freeform text, form submission and IME composition behave as usual, and binding the text never turns the selected object into a string.

Other controls keep their native form behaviour, focus, accessible invalid messages, composition boundaries, preview, commit and cancel behaviour, and controller models when bound. Debounce a search once: use the field's own query mechanism or the task debounce, not both.

## Actions and undo

`actionRef(ControllerClass, "method")` returns an immutable, typed reference to an action. It infers the method's payload (none or one argument) and its awaited result, checks the `@action` metadata, and holds no controller instance. `useAction(reference, payload?)` and controls, menus and toolbars that take an action still dispatch through the focused responder chain, so runtime validation, disabled and hidden states, payload schemas, target acceptance and cancellation all still apply. Plain string action IDs work too.

An `@action` method's return value is checked like any command result. `NSEActionOptions<Payload, Result>.undo` takes a command undo policy; leave it out when a document or text transaction already registers undo, so one edit doesn't end up in two histories. A TypeScript payload type doesn't validate anything at run time, so use the command schema and the mounted payload builders at boundaries. DOM nodes, `File` values, callbacks and live leases belong in domain or outlet adapters, not command payloads.

Menu and toolbar controllers created in function components still have an owner: when there's no explicit owner and no class under construction, the runtime port they require supplies its lifetime signal. Controllers created by class factories keep their narrower ownership. A function component may still dispose its local controllers earlier on unmount, and needs no extra owner argument for these controllers.

## Tasks, observations and preferences

`managedTask(owner, { lifetime, policy, run, apply })` owns a piece of asynchronous work. View controllers can use the `owner`, `mounted` or `visible` lifetime; applications and windows use `owner`. Use the `latest` policy for reads where a newer request replaces an older one, optionally with `debounceMs`, and `serial` for writes that must happen in order, optionally with `maximumQueued`. `getSnapshot()` gives the pending state, value and error, and each run's `finished` promise tells you whether it succeeded, failed or was cancelled.

After every `await`, check for cancellation before doing domain work. `context.commit` runs a synchronous mutation only if the run and its lifetime are still current, and returns `false` without running it otherwise. `context.own` creates a resource that belongs to the run and is released when the run settles; for a resource that must outlive the run, create it with `controller.own` inside a successful commit. Factories and the `apply` and `commit` callbacks are synchronous. A task can't undo an external side effect, or turn an external write with an unknown outcome into a cancelled one, so document revisions and external idempotency rules still apply.

`@observes("query", { lifetime: "mounted", initial: true })` observes one property of the object. The decorated method is synchronous and receives the new and previous values; start a managed task from it for asynchronous work. Source factories and projectors let you observe external sources too. The initial delivery follows construction, ref and load order, and a delivery that is still pending when its lifetime ends is dropped.

`@preference("explicit.key") accessor includeArchived = false` stores a value in the app's preferences, with the initialiser as its default. Structured values use a versioned descriptor with a parser and migrations. If a write fails, the previous value stays. Grouped settings with drafts belong in `NSEUserDefaultsController`. Navigation restoration has its own controller APIs and an explicit route still wins over restored state; it is not a second route store. See [Preferences and observations](authoring-preferences.md).

Bindings to grouped preferences can import `PreferenceValidationError` and `PreferencePersistenceError`, along with `NSEUserDefaultsController`, from `@syndromatic/syncloudos/nse`. Invalid values and refused synchronous writes can surface as binding issues, but unexpected failures, or failures with an unknown outcome, must still reject. Keep the controller's transaction and saved envelope.

## Outlets and animation

`@outlet accessor artwork!: NSEViewOutlet<HTMLDivElement>` creates a stable, typed handle to an element; attach it with `ref={controller.artwork.ref}`. `current` may be `null`. `element`, `layer` and `mountSignal` need a live, committed mount. Holding the handle doesn't own a React node or keep an old mount alive. An outlet connects any HTML element or a root `<svg>`, and `NSEView` connects its `HTMLDivElement`, including when it draws GraphicsFX content. For a canvas, call `controller.fx.animation.manageRenderer(outlet, options)` to get a scoped renderer at the content's full device pixel ratio; it reports missing capabilities as explicit errors.

`AFXTransaction.perform({ duration, delay, timing, disableActions }, changes)` runs `changes` in a synchronous layer transaction and always closes it, even if `changes` throws. It inherits options from an outer transaction, batches the layer actions that apply, and doesn't roll back writes to your application model. `changes` must not be asynchronous. Explicit begin, commit and flush and explicit animation handles are still available.

Managed frame callbacks receive monotonic time in seconds and stop while the view is inactive; the first frame after resuming has a delta of zero. Choose the reduced-motion behaviour explicitly (`static` or `continue`), keep your scene's own content and media timebases, and show your app's unavailable state when a renderer isn't supported. Source and jsdom tests can't tell you how the result looks on a real GPU.

### Display links for your own GPU engine

`manageRenderer` hands the canvas to `AFXRenderer`, and a canvas can have only one context owner. When Three.js, raw WebGL2 or WebGPU does the drawing, use `controller.fx.animation.manageDisplayLink(outlet, options)` instead. A display link gives you the same managed frame pacing as a renderer (mount lifetime, view visibility, on-screen tracking, resizes, device pixel ratio, the application frame scheduler and reduced motion), but it never creates a context and never writes `canvas.width` or `canvas.height`.

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

Create the engine's renderer before you ask for the link, because `drawableSizeDidChange` runs once with the first size while the link is set up. The display link ends with the mount by itself; disposing the engine's renderer and scene is up to you.

### Vector figures and plots

Give `NSEView` a `draw(dirtyRect, context)` function to draw custom content. The view measures its bounds, records into a fresh `GFXContext` each time it displays, and renders the finished display list. To redraw, re-render the React view. The host supplies the identifier issuer and live geometry, so you pass neither to `NSEView`. The drawing sits behind any subviews and works with `menu`, `toolTip` and `appearance`. Size the view with `style` or a class; the drawing fills those bounds without affecting layout.

`layerContentsPlacement` sets how the drawing sits in the view:

- `scaleProportionallyToFit` (the default) fits the whole drawing, centred; `scaleProportionallyToFill` fills the box; `scaleAxesIndependently` stretches both axes.
- `center`, `top`, `topRight`, `right`, `bottomRight`, `bottom`, `bottomLeft`, `left` and `topLeft` align the drawing at its natural size.

The view's `ref` connects an `@outlet` of type `NSEViewOutlet<HTMLDivElement>`. Pointer handlers are ordinary view handlers (`React.PointerEvent<HTMLDivElement>`) whose target is the view, and drawing coordinates start at the top-left of its bounds. Give the view an accessible name and description with `aria-label` and `aria-description`.

A controller can also cache a `GFXDisplayList` and export the same figure to SVG or PDF. Recording that figure with `GFXContext.recording` needs an identifier issuer from `SCOS.images.createGraphicsIdentifierIssuer()` (or `useImages()`); `NSEView` gets the issuer for its own display context. Replay a cached figure into the view's context with `drawDisplayList`:

```tsx
const context = GFXContext.recording({ size: { width: 480, height: 240 }, identifiers: SCOS.images.createGraphicsIdentifierIssuer() });
context.fillPath(GFXPath.ellipse({ x: 8, y: 8, width: 64, height: 64 }), GFXColour.rgba(0.2, 0.5, 0.8));
const figure = context.displayList;

<NSEView
  aria-label="Recorded figure"
  style={{ width: "100%", height: 240 }}
  draw={(dirtyRect, displayContext) => displayContext.drawDisplayList(figure, dirtyRect)}
/>
```

`drawDisplayList` scales the cached figure into its destination rectangle. To keep the figure's aspect ratio in view bounds of a different shape, pass an aspect-fitted destination rectangle. `layerContentsPlacement` positions the whole drawing layer; it doesn't move individual drawing commands. See [Graphics contexts](fx/graphics/contexts.md).

## Scaffolds and validation

`npm run synware:create -- src/SynWare/Search.app` generates the separate-view pattern by default, with `Contents/Views/SearchView.tsx`; `--authoring inline` keeps the view in `index.tsx`. Add `--application-menu-toolbar` to create an `NSEWindowController` with `NSEToolbarItem.applicationMenu("gear")`. `--authoring function` opts into a function-component app, and it's the default for the hook-based `--fx` recipe scaffolds. Class views can use those recipe components, but asking for a class scaffold together with `--fx` is reported as an error before any file is written. The Developer MCP `scaffold` tool uses the same templates.

The [authoring contract](authoring-contract.md) lists which API to use for each job, and the Developer MCP `validate` tool reports `idiom.*` warnings where an application departs from it.

`npm run typecheck:authoring` checks the public authoring types against examples that must and must not compile. The [installed consumer specimen](../../tests/fixtures/synware-authoring/6e/README.md) is a complete app with its own TypeScript and Vitest configuration and no source aliases. Its package check installs the exact built archive in a clean directory; the source-tree check runs the same application files but doesn't prove the packed archive works.

Hot reload keeps state when you edit methods or render code, refreshes actions through the responder bindings, and relaunches only the affected app when resource, decorator or dependency declarations change (see [Applications](applications.md#hot-reload)). Local descriptors that fields refer to are part of the class signature; unrelated local constants aren't. Classes with private members still relaunch on any edit. A relaunch ends the old tasks and outlets, so stale callbacks can't publish into the new instance.

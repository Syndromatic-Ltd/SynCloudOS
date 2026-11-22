# Preferences, observations and restoration

This page covers three ways a controller keeps state in step with the world: preferences that persist a property, observations that react to a property changing, and restoration that brings navigation back where the user left it.

Applications, window controllers and view controllers declare a primitive preference with `@preference` and an app-scoped key:

```ts
class ReaderController extends NSEViewController {
  @preference("reader.inspector.visible") accessor inspectorVisible = false;
  @observable accessor query = "";

  @observes("query", { lifetime: "visible", initial: true })
  queryChanged(value: string, previous: string | undefined) {
    this.search.run(value);
  }
}
```

Inside the constructor, a preference reads as its default. The session loads stored values after construction and attachment, and before the application's launch callbacks and the view and window load callbacks. A value you write in the constructor wins over the stored one. A child added to an attached owner is fully set up before `addChild` returns. The first rendered view therefore sees stored values.

A primitive preference is stored raw, under exactly the key you give. For structured values, pass an `NSEPreferenceDescriptor<T>` with an explicit key, version, parser and a run of consecutive migrations; the accessor's initialiser is the default. Version zero can read an existing raw structured value without wrapping it in an envelope, and existing tagged envelopes are kept. Positive versions are stored in the `syncloudos:nse-preferences:v1` envelope. A value written by a newer, unsupported schema is never overwritten. Grouped settings with drafts and undo belong in `NSEUserDefaultsController` (see [Controllers](controllers.md)).

A write must succeed synchronously before the accessor publishes the new value. If it throws `PreferencePersistenceError`, the previous value stays. Storing an equal value publishes nothing. Accessors also see writes and removals made through the ordinary SDK preferences client, not only their own. Disposing the owner ends these subscriptions.

`@observes` takes a property key on the same object, or a factory that returns an observable source together with a `select(snapshot)` projection. Factories run after construction and are re-run when the owner changes. Observer methods are synchronous; start a managed task for asynchronous work. Changes are delivered together in one microtask, and projected values are compared with `Object.is`. A delivery still pending when its lifetime ends is dropped. Writes that keep triggering each other, and observer methods that return a promise, are reported in diagnostics.

Observations with the `owner` lifetime connect after stored preferences load. A `mounted` observation's initial delivery runs after refs are attached and `viewDidLoad` has run; a `visible` observation's runs when the view becomes active. Each time a lifetime starts again it can deliver its own initial value, and React StrictMode's double render doesn't start a new one. `observe` and the React hook `useObserve` still work.

## Navigation restoration

Navigation controllers such as `NSETabViewController` accept a `restoration` descriptor (`NSENavigationRestorationDescriptor`) with `key`, `version`, `parse`, `capture`, `restore` and `migrations`. `restore(controller, value)` calls the controller's own restoration API. If `hasExplicitRoute(controller)` returns `true`, the incoming route wins and nothing is restored. Outside an attached application, pass an `NSEUserDefaults` (from `@syndromatic/syncloudos/foundation`) as `defaults`. The descriptor connects after construction, so you don't need a separate route store.

The framework source includes `createNSETabSelectionRestoration({ key })`, which stores the selected tab's identity, checks it against the current tabs when restoring, and falls back to the initial selection you set. Renaming a tab doesn't rewrite the stored selection. It isn't exported from a package entry, so an application writes the equivalent descriptor itself. To keep reading an existing unversioned format, declare a version-zero descriptor whose `parse` and `capture` match that format exactly.

## Window roots

A window's root view controller can receive its window controller without a constructor factory:

```ts
class ReaderViewController extends NSEViewController {
  constructor(readonly readerWindow: ReaderWindowController) { super(); }
  renderView() { return <ReaderContent controller={this} />; }
}
class ReaderWindowController extends NSEWindowController {
  static contentViewControllerClass = ReaderViewController;
}
```

The framework passes the window controller when it constructs the root, which the window owns. A root class with a no-argument constructor works too.

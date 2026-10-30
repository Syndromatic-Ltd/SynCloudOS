# Preferences, observations and restoration

Applications, windows and view controllers can declare primitive preferences with their existing app-scoped keys:

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

Constructor reads see accessor defaults. The session hydrates declarations after construction and context attachment, before application launch and view/window load callbacks. An explicit constructor write wins over stored data. Children added to an attached owner are finalized before `addChild` returns. Stored values are therefore available on the first rendered view.

Primitive preferences retain their raw storage format and exact key. `NSEPreferenceDescriptor<T>` adds an explicit key, version, parser and consecutive migrations for structured values. Its initializer is the default. Version zero can adapt an existing raw structured value without adding an envelope; existing tagged envelopes are retained. Positive versions use the existing `syncloudos:nse-preferences:v1` tuple. A newer unsupported schema is never overwritten. Grouped settings drafts and undo remain with `NSEPreferencesController`.

Writes must succeed synchronously before the accessor publishes. `PreferencePersistenceError` leaves the previous value intact. Equal storage echoes publish nothing. The canonical persistence manager notifies scoped accessors for ordinary SDK writes and removals as well as decorated writes. Disposing an owner releases these subscriptions.

`@observes` accepts a direct property key or an explicit observable-source factory with a `select(snapshot)` projection. Factories resolve after construction and rebind when the owner changes. Observer methods are synchronous; use a managed task for asynchronous work. Deliveries coalesce into one microtask and compare projected values with `Object.is`. Pending deliveries from ended epochs are discarded. Repeated nonconverging writes and thenable method results enter diagnostics.

Owner observations connect after hydration. Initial mounted observations run after committed refs and `viewDidLoad`; visible observations run when effective activity begins. Each new epoch can deliver its own initial value. StrictMode replay preserves the committed epoch. Existing `observe` and React `useObserve` remain supported.

Navigation controllers accept a `restoration` descriptor containing `key`, `version`, `parse`, `capture`, `restore` and `migrations`. `restore(controller, value)` calls the controller's existing restoration API. `hasExplicitRoute` preserves app-owned incoming route authority. Outside an attached application, supply the existing `PreferencesAdapter` through `preferences`. Connection occurs after construction; creating a separate route store is unnecessary.

`createNSETabSelectionRestoration({ key })` persists selected destination identity, validates it against the current destinations through canonical restoration, and falls back to the authored initial selection. Retitling tabs does not write selection state. For existing unversioned app formats, declare a version-zero descriptor whose parser/capture match that format exactly.

Window roots may receive their owning window without writing a constructor factory:

```ts
class ReaderViewController extends NSEViewController {
  constructor(readonly readerWindow: ReaderWindowController) { super(); }
  renderView() { return <ReaderContent controller={this} />; }
}
class ReaderWindowController extends NSEWindowController {
  static contentViewControllerClass = ReaderViewController;
}
```

The framework supplies the window while constructing the root in its own ownership scope. No-argument root classes remain valid.

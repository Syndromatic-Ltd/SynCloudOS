import { createElement } from "react";
import { NSEApplication, NSEViewController, NSEWindowController, observable, bind, action, actionRef, useAction, managedTask, outlet, preference, observes,
  type NSEActionReference, type NSEViewOutlet, type NSEManagedAFXRenderer, type NSETaskSettlement, type NSEBinding, type NSETaskContext } from "@syndromatic/syncloudos";
import { NSEButton, NSESearchField, NSESlider } from "@syndromatic/syncloudos/nse/controls";
import { NSEComboBox, type NSEComboBoxProps } from "@syndromatic/syncloudos/nse";
import { AFXTransaction } from "@syndromatic/syncloudos/fx/animation";

class SearchController extends NSEViewController {
  @observable accessor query = "";
  @observable accessor count = 0;
  @preference("search.includeArchived") accessor includeArchived = false;
  @outlet accessor content!: NSEViewOutlet<HTMLDivElement>;
  readonly fixed = "read only";
  readonly queryBinding: NSEBinding<string> = bind<SearchController, "query">(this, "query");
  readonly search = managedTask(this, { lifetime: "visible", policy: "latest", run: async (query: string, context) => {
    await Promise.resolve(); context.throwIfCancelled(); return query.length;
  }, apply: count => { this.count = count; } });
  @action clearSearch() { this.query = ""; return this.query; }
  @action async chooseItem(id: string) { return id.length; }
  @observes("query", { lifetime: "mounted", initial: true }) queryChanged(value: string, previous: string | undefined) { void [value, previous]; }
  override renderView() { return createElement("div", { ref: this.content.ref }); }
}
declare const controller: SearchController;
declare const application: NSEApplication;
const query = bind(controller, "query");
const choose = actionRef(SearchController, "chooseItem");
const reference: NSEActionReference<string, number> = choose;
const field: Parameters<typeof NSESearchField>[0] = { binding: query };
const slider: Parameters<typeof NSESlider>[0] = { binding: bind(controller, "count") };
declare const comboBase: Omit<NSEComboBoxProps<number>, "inputValue" | "onInputValueChange">;
const combo: Parameters<typeof NSEComboBox<number>>[0] = { ...comboBase, binding: query, value: 42, onValueChange: () => {} };
// @ts-expect-error Binding owns combo editable text, so inputValue cannot compete.
const competingCombo: Parameters<typeof NSEComboBox<number>>[0] = { ...comboBase, binding: query, inputValue: "competing" };
// @ts-expect-error Binding owns combo editable text writes.
const callbackCombo: Parameters<typeof NSEComboBox<number>>[0] = { ...comboBase, binding: query, onInputValueChange: () => {} };
void [field, slider, reference];
// @ts-expect-error Missing binding member.
bind(controller, "missingProperty");
// @ts-expect-error Readonly binding member.
bind(controller, "fixed");
// @ts-expect-error Methods are not writable binding members.
bind(controller, "clearSearch");
// @ts-expect-error Unknown action method.
actionRef(SearchController, "clearSerach");
// @ts-expect-error Wrong reference result type.
const wrongResult: NSEActionReference<string, string> = choose;
// @ts-expect-error Wrong field binding value.
const wrongField: Parameters<typeof NSESearchField>[0] = { binding: bind(controller, "count") };
// @ts-expect-error Binding and controlled value are mutually exclusive.
const competing: Parameters<typeof NSESearchField>[0] = { binding: query, value: "another writer" };
// @ts-expect-error Binding and value-mutating callbacks are mutually exclusive.
const callback: Parameters<typeof NSESearchField>[0] = { binding: query, onValueChange: () => {} };
// @ts-expect-error Owned factories are synchronous, including after await.
controller.own(async () => ({ dispose() {} }));
// @ts-expect-error Application tasks have owner lifetime only.
managedTask(application, { lifetime: "visible", policy: "latest", run: () => 1 });
// @ts-expect-error Serial tasks cannot debounce writes.
managedTask(controller, { lifetime: "owner", policy: "serial", debounceMs: 5, run: () => 1 });
// @ts-expect-error Latest tasks do not have a serial queue limit.
managedTask(controller, { lifetime: "owner", policy: "latest", maximumQueued: 1, run: () => 1 });
// @ts-expect-error Scoped transactions are synchronous.
AFXTransaction.perform({}, async () => {});
declare const taskContext: NSETaskContext;
taskContext.commit(() => { controller.count += 1; });
// @ts-expect-error Task commits must reject async callbacks at the public type boundary.
taskContext.commit(async () => {});
function ActionView() {
  const state = useAction(choose, "note");
  void state.perform("next").then(result => { if (result?.status === "executed") { const n: number = result.value; void n; } });
  // @ts-expect-error Hook payload is inferred from the method.
  useAction(choose, 42);
  // @ts-expect-error Event payload is inferred from the method.
  state.perform(42);
  return createElement(NSEButton, { action: actionRef(SearchController, "clearSearch"), title: "Clear" });
}
declare const renderer: NSEManagedAFXRenderer;
renderer.onFrame(frame => { const seconds: number = frame.delta; void seconds; }, { reducedMotion: "static" });
const settlement: Promise<NSETaskSettlement<number>> = controller.search.run("query").finished;
void [ActionView, settlement, wrongResult, wrongField, competing, callback];

class SpecificWindow extends NSEWindowController { readonly specificWindowState = "publisher"; }
class RequiresSpecificWindow extends NSEViewController {
  constructor(readonly publisher: SpecificWindow) { super(); }
}
// A custom window supplies its own window argument to its content class.
class CustomWindow extends SpecificWindow {
  static override contentViewControllerClass = RequiresSpecificWindow;
}
// @ts-expect-error The shorthand creates a standard window and requires a zero-argument root.
class InvalidMainViewApplication extends NSEApplication {
  static override mainViewController = RequiresSpecificWindow;
}
class ValidMainViewApplication extends NSEApplication {
  static override mainViewController = SearchController;
}
void [CustomWindow, InvalidMainViewApplication, ValidMainViewApplication];

// The lazy loader already admits class and component entries; its public
// module type must describe those same 6C authoring paths.
import type { SynCloudOSAppModule } from '@syndromatic/syncloudos/browser';
class PlaybackModuleApplication extends NSEApplication {}
const playbackClassModule = { default: PlaybackModuleApplication } satisfies SynCloudOSAppModule;
const playbackComponentModule = { default: () => createElement('p', null, 'Generated module') } satisfies SynCloudOSAppModule;
// @ts-expect-error A primitive is not a supported application entry.
const rejectedPlaybackModule = { default: 42 } satisfies SynCloudOSAppModule;
void playbackClassModule; void playbackComponentModule; void rejectedPlaybackModule;

import type { SCOSFacade, AppPlaybackPresentationLease, AppScreenWakeLease } from '@syndromatic/syncloudos/sdk';
const publicWakeLease = (lease: ReturnType<SCOSFacade['screenWakeLock']['request']>): AppScreenWakeLease => lease;
const publicPlaybackLease = (lease: ReturnType<SCOSFacade['audio']['present']>): AppPlaybackPresentationLease => lease;
void publicWakeLease; void publicPlaybackLease;

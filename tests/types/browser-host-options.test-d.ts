import { mountSynCloudOS } from "../../src/SynCloudOSReact/browser";
import type { WebspringDefinition } from "../../src/Webspring/webspringTypes";
import { IndexedDBDocumentRecoveryStore } from "../../src/SynCloudOS/Documents/IndexedDBDocumentRecoveryStore";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters/InMemoryDocumentAdapter";
import { defineIntegration } from "../../src/Webspring/webspringIntegration";
import type { ActionResult, WebspringWidgetViewProps } from "../../src/Webspring/webspringTypes";
declare const element: Element;
declare const shell: WebspringDefinition;
mountSynCloudOS({ element, shell, authentication: "optional" });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" } });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, authentication: "disabled" });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, authentication: "optional" });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, authentication: "required" });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game", frame: "fullscreen" } });
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game", frame: "declared" } });
declare const authentication: Exclude<Parameters<typeof mountSynCloudOS>[0]["authentication"], string | undefined>;
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, authentication });
mountSynCloudOS({ element, shell, about: { copyright: "© 2026 Example Ltd.", trademark: "Example", tagline: "Made in Manchester." } });
// @ts-expect-error About attribution cannot override an application's identity.
mountSynCloudOS({ element, shell, about: { version: "9.0.0" } });
defineIntegration({
  owners: ["com.example.notes"],
  applicationDocuments: environment => ({
    recoveryStore: new IndexedDBDocumentRecoveryStore({ indexedDB, persistenceNamespace: "notes", environment }),
  }),
  install(context) {
    context.documents.registerAdapter(new InMemoryDocumentAdapter(context.environment));
    // @ts-expect-error Installations receive document environment ports, not raw browser authority.
    context.environment.browser.getWindow();
  },
});
declare const widget: WebspringWidgetViewProps<readonly string[]>;
const navigation: Promise<ActionResult> = widget.navigate("/notes/one");
void navigation;
// @ts-expect-error A production host must choose a mode.
mountSynCloudOS({ element });
// @ts-expect-error Application and shell are mutually exclusive.
mountSynCloudOS({ element, shell, application: { bundleIdentifier: "com.example.game" } });
// @ts-expect-error Shell resources cannot be attached to an application host.
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, shellResources: {} });
// @ts-expect-error The application frame is either the full page or the app's declared frame.
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game", frame: "windowed" } });
// @ts-expect-error Content sources are gone; widgets are declared with defineWebspring.
mountSynCloudOS({ element, application: { bundleIdentifier: "com.example.game" }, contentSources: {} });

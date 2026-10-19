import { mountSynCloudOS } from "../../src/SynCloudOSReact/browser";
import type { WebspringDefinition } from "../../src/Webspring/webspringTypes";
declare const element: Element;
declare const shell: WebspringDefinition;
mountSynCloudOS({ element, shell, authentication: "optional" });
mountSynCloudOS({ element, application: { id: "com.example.game" } });
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication: "disabled" });
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication: "optional" });
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication: "required" });
mountSynCloudOS({ element, application: { id: "com.example.game", frame: "fullscreen" } });
mountSynCloudOS({ element, application: { id: "com.example.game", frame: "declared" } });
declare const authentication: Exclude<Parameters<typeof mountSynCloudOS>[0]["authentication"], string | undefined>;
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication });
// @ts-expect-error A production host must choose a mode.
mountSynCloudOS({ element });
// @ts-expect-error Application and shell are mutually exclusive.
mountSynCloudOS({ element, shell, application: { id: "com.example.game" } });
// @ts-expect-error Shell resources cannot be attached to an application host.
mountSynCloudOS({ element, application: { id: "com.example.game" }, shellResources: {} });
// @ts-expect-error The application frame is either the full page or the app's declared frame.
mountSynCloudOS({ element, application: { id: "com.example.game", frame: "windowed" } });
// @ts-expect-error Content sources belong to Webspring.
mountSynCloudOS({ element, application: { id: "com.example.game" }, contentSources: {} });

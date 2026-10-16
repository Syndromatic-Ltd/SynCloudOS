import { mountSynCloudOS } from "../../src/SynCloudOSReact/browser";
import type { WebspringDefinition } from "../../src/Webspring/webspringTypes";
declare const element: Element;
declare const shell: WebspringDefinition;
mountSynCloudOS({ element, shell, authentication: "optional" });
mountSynCloudOS({ element, application: { id: "com.example.game" } });
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication: "disabled" });
// @ts-expect-error A production host must choose a mode.
mountSynCloudOS({ element });
// @ts-expect-error Application and shell are mutually exclusive.
mountSynCloudOS({ element, shell, application: { id: "com.example.game" } });
// @ts-expect-error Shell resources cannot be attached to an application host.
mountSynCloudOS({ element, application: { id: "com.example.game" }, shellResources: {} });
// @ts-expect-error Application hosting has no login presentation.
mountSynCloudOS({ element, application: { id: "com.example.game" }, authentication: "required" });

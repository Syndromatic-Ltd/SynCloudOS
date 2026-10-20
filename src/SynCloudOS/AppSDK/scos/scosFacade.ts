/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type {
  AppAppearanceClient,
  AppCommandClient,
  AppDocumentClient,
  AppLocaleClient,
  AppNavigationClient,
  AppNavigationTransitionResult,
  AppPasteboardClient,
  AppServiceClient,
  AppUndoClient,
  AppWindowClient,
} from "../appClientTypes";
import type {
  AppNotificationClient,
  AppPersistenceClient,
  AppSchedulerClient,
  AppShareClient,
} from "../appEnvironmentClientTypes";
import type { SynCloudOSAlertRequest } from "../../SystemUI/alertCenter";
import type { SynCloudOSTranslationParams, SynCloudOSTranslationPrimitive } from "../../LocaleServices/localeTypes";
import type { SynWareContextValue } from "../appContextTypes";
import { resolveSCOSSession, type SCOSAppSession } from "./scosSessionRegistry";
import { scosUnboundError, SCOSError } from "./scosErrors";
import { controllerServicesFor, type SCOSRoutes } from "../controllerServices";
import type { SynWareFontAccess } from "../fontAccess";
import type { NSEMenuRuntimePort } from "../../../NSE/Menus";

/** The parts of a mounted app `SCOS` is bound to, resolved on every call so a
 * timer, an awaited continuation or module-level code reaches the app the
 * module belongs to even after a remount replaced its session. */
export interface SCOSFacadeSource {
  readonly app: SCOSApplicationInfo;
  readonly context: SynWareContextValue;
}

export interface SCOSApplicationInfo {
  /** The authored bundle identifier, not the folder name. */
  readonly bundleIdentifier: string;
  readonly version: string;
  readonly displayName: string;
}

/** Calls into the mounted app's preference slice. The values live in the same
 * store as `persistence`; this is the reading-shaped view of it. */
export interface SCOSPreferences {
  get<T = unknown>(key: string): T | undefined;
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): boolean;
  remove(key: string): void;
}

/** Localised strings for the bound app. Values are read when asked, so the
 * object stays valid across a locale change; re-render with `useStrings()`. */
export interface SCOSStrings {
  readonly locale: string;
  readonly dictionaryVersion: number;
  t(key: string, fallback: string, params?: SynCloudOSTranslationParams): string;
  menuT(key: string, fallback: string, params?: SynCloudOSTranslationParams): string;
}

/**
 * The platform's short front door for a mounted app. Everything here is a
 * call into the running app; reactive values stay with the hooks.
 */
export interface SCOSFacade extends Omit<SynWareContextValue, "appId" | "appInfo" | "launcher" | "alerts"> {
  readonly app: SCOSApplicationInfo;
  /** Aborted when the bound app's session ends. */
  readonly signal: AbortSignal;
  /** Shows a system alert and resolves with the chosen button id. A safe
   * dismissal or the app closing resolves to the cancel button. */
  alert(request: SynCloudOSAlertRequest, signal?: AbortSignal): Promise<string>;
  /** Opens a bundle identifier or an absolute route and resolves with the transition. */
  open(bundleIdentifierOrRoute: string, options?: Readonly<{ signal?: AbortSignal }>): Promise<AppNavigationTransitionResult>;
  /** Closes the bound app. */
  close(options?: Readonly<Record<string, unknown>>): void;
  readonly windows: AppWindowClient;
  readonly documents: AppDocumentClient;
  readonly undo: AppUndoClient;
  readonly commands: AppCommandClient;
  readonly preferences: SCOSPreferences;
  readonly persistence: AppPersistenceClient;
  readonly notifications: AppNotificationClient;
  readonly appearance: AppAppearanceClient;
  readonly locale: AppLocaleClient;
  readonly strings: SCOSStrings;
  readonly scheduler: AppSchedulerClient;
  readonly navigation: AppNavigationClient;
  readonly pasteboards: AppPasteboardClient;
  readonly services: AppServiceClient;
  readonly share: AppShareClient;
  readonly routes: SCOSRoutes;
  readonly fonts: SynWareFontAccess;
  readonly menus: Readonly<{ runtime: NSEMenuRuntimePort }>;
}

function stringsFor(context: () => SynWareContextValue): SCOSStrings {
  const translate = (key: string, fallback: string, params: SynCloudOSTranslationParams | undefined, segment: string | undefined) => {
    const mount = context();
    const namespace = segment ? `synapps.${mount.appId}.${segment}` : `synapps.${mount.appId}`;
    const translated = mount.locale.t(key, params, namespace);
    if (translated !== key) return translated;
    if (!params) return fallback;
    return fallback.replace(/\{([A-Za-z0-9_.-]+)\}/g, (match, name: string) => {
      const value: SynCloudOSTranslationPrimitive = params[name];
      return value === null || typeof value === "undefined" ? match : String(value);
    });
  };
  return Object.freeze({
    get locale() { return context().locale.getSnapshot().locale; },
    get dictionaryVersion() { return context().locale.getSnapshot().dictionaryVersion ?? 0; },
    t: (key: string, fallback: string, params?: SynCloudOSTranslationParams) => translate(key, fallback, params, undefined),
    menuT: (key: string, fallback: string, params?: SynCloudOSTranslationParams) => translate(key, fallback, params, "mainMenu"),
  });
}

function preferencesFor(context: () => SynWareContextValue): SCOSPreferences {
  return Object.freeze({
    get<T>(key: string, fallback?: T): T | undefined { return context().persistence.getPreference(key, fallback); },
    set<T>(key: string, value: T): boolean { return context().persistence.setPreference(key, value); },
    remove(key: string): void { context().persistence.removePreference(key); },
  });
}

/** One facade shape serves the app-bound module, `useSCOS()` and the unbound
 * `SCOS`; only the lookup differs, and it runs per member access. */
function createFacade(source: () => SCOSFacadeSource): SCOSFacade {
  const context = () => source().context;
  const strings = stringsFor(context);
  const preferences = preferencesFor(context);
  return Object.freeze({
    get app() { return source().app; },
    get signal() { return context().signal; },
    alert(request: SynCloudOSAlertRequest, signal?: AbortSignal) {
      return context().alerts.present(request, signal);
    },
    async open(bundleIdentifierOrRoute: string, options: Readonly<{ signal?: AbortSignal }> = {}) {
      const mount = context();
      const target = String(bundleIdentifierOrRoute ?? "").trim();
      if (!target) throw new TypeError("SCOS.open needs a bundleIdentifier or an absolute route.");
      const route = target.startsWith("/") ? target : mount.launcher.routeFor(target);
      if (!route) throw new SCOSError({ code: "SCOS_APP_NOT_FOUND", message: `No application named "${target}" is registered. Check the bundleIdentifier or pass an absolute route to SCOS.open().` });
      const handle = mount.navigation.openRoute(route, {
        source: "app",
        ...(options.signal ? { signal: options.signal } : {}),
      });
      return handle.result;
    },
    close(options?: Readonly<Record<string, unknown>>) {
      context().lifecycle.closeSelf(options);
    },
    get windows() { return context().windows; },
    get documents() { return context().documents; },
    get undo() { return context().undo; },
    get commands() { return context().commands; },
    get preferences() { return preferences; },
    get persistence() { return context().persistence; },
    get notifications() { return context().notifications; },
    get appearance() { return context().appearance; },
    get locale() { return context().locale; },
    get strings() { return strings; },
    get scheduler() { return context().scheduler; },
    get navigation() { return context().navigation; },
    get pasteboards() { return context().pasteboards; },
    get services() { return context().services; },
    get share() { return context().share; },
    get routes() { return controllerServicesFor(context()).routes; },
    get fonts() { return controllerServicesFor(context()).fonts; },
    get menus() { return controllerServicesFor(context()).menus; },
    get runtimeInfo() { return context().runtimeInfo; },
    get branding() { return context().branding; },
    get responderId() { return context().responderId; },
    get sessionId() { return context().sessionId; },
    get presentation() { return context().presentation; },
    get lifecycle() { return context().lifecycle; },
    get responders() { return context().responders; },
    get drag() { return context().drag; },
    get colourPanel() { return context().colourPanel; },
    get audio() { return context().audio; },
    get mediaQueries() { return context().mediaQueries; },
    get identity() { return context().identity; },
    get errors() { return context().errors; },
    get externalActions() { return context().externalActions; },
    get workArea() { return context().workArea; },
    get settingsAvailability() { return context().settingsAvailability; },
    get connectivity() { return context().connectivity; },
    get events() { return context().events; },
    get tracking() { return context().tracking; },
    get textLayout() { return context().textLayout; },
    get animations() { return context().animations; },
    get images() { return context().images; },
    get filePanels() { return context().filePanels; },
    get motion() { return context().motion; },
    get media() { return context().media; },
    get video() { return context().video; },
    get location() { return context().location; },
    get midi() { return context().midi; },
    get lumina() { return context().lumina; },
    get haptics() { return context().haptics; },
    get webContent() { return context().webContent; },
    get trusted() { return context().trusted; },
  });
}

function sessionSource(session: () => SCOSAppSession): SCOSFacadeSource {
  const mount = session();
  return {
    app: Object.freeze({ bundleIdentifier: mount.appId, version: mount.version, displayName: mount.displayName }),
    context: mount.context,
  };
}

/** The module-bound facade the Vite plugin injects into `<Name>.app` code. */
export function createAppSCOS(appId: string): SCOSFacade {
  const id = String(appId ?? "").trim();
  if (!id) throw new TypeError("createAppSCOS needs the app ID it binds to.");
  return createFacade(() => sessionSource(() => resolveSCOSSession(id)));
}

/** The facade `useSCOS()` returns: bound to the nearest provider's mount. */
export function createContextSCOS(context: SynWareContextValue): SCOSFacade {
  const source: SCOSFacadeSource = { app: context.appInfo, context };
  return createFacade(() => source);
}

function unboundMember(name: string): never {
  throw scosUnboundError(`SCOS.${name}`);
}

/** Shared code outside an app folder. Every member names the calling file. */
export const unboundSCOS: SCOSFacade = Object.freeze({
  get app() { return unboundMember("app"); },
  get signal() { return unboundMember("signal"); },
  alert() { return unboundMember("alert"); },
  open() { return unboundMember("open"); },
  close() { unboundMember("close"); },
  get windows() { return unboundMember("windows"); },
  get documents() { return unboundMember("documents"); },
  get undo() { return unboundMember("undo"); },
  get commands() { return unboundMember("commands"); },
  get preferences() { return unboundMember("preferences"); },
  get persistence() { return unboundMember("persistence"); },
  get notifications() { return unboundMember("notifications"); },
  get appearance() { return unboundMember("appearance"); },
  get locale() { return unboundMember("locale"); },
  get strings() { return unboundMember("strings"); },
  get scheduler() { return unboundMember("scheduler"); },
  get navigation() { return unboundMember("navigation"); },
  get pasteboards() { return unboundMember("pasteboards"); },
  get services() { return unboundMember("services"); },
  get share() { return unboundMember("share"); },
  get routes() { return unboundMember("routes"); },
  get fonts() { return unboundMember("fonts"); },
  get menus() { return unboundMember("menus"); },
  get runtimeInfo() { return unboundMember("runtimeInfo"); },
  get branding() { return unboundMember("branding"); },
  get responderId() { return unboundMember("responderId"); },
  get sessionId() { return unboundMember("sessionId"); },
  get presentation() { return unboundMember("presentation"); },
  get lifecycle() { return unboundMember("lifecycle"); },
  get responders() { return unboundMember("responders"); },
  get drag() { return unboundMember("drag"); },
  get colourPanel() { return unboundMember("colourPanel"); },
  get audio() { return unboundMember("audio"); },
  get mediaQueries() { return unboundMember("mediaQueries"); },
  get identity() { return unboundMember("identity"); },
  get errors() { return unboundMember("errors"); },
  get externalActions() { return unboundMember("externalActions"); },
  get workArea() { return unboundMember("workArea"); },
  get settingsAvailability() { return unboundMember("settingsAvailability"); },
  get connectivity() { return unboundMember("connectivity"); },
  get events() { return unboundMember("events"); },
  get tracking() { return unboundMember("tracking"); },
  get textLayout() { return unboundMember("textLayout"); },
  get animations() { return unboundMember("animations"); },
  get images() { return unboundMember("images"); },
  get filePanels() { return unboundMember("filePanels"); },
  get motion() { return unboundMember("motion"); },
  get media() { return unboundMember("media"); },
  get video() { return unboundMember("video"); },
  get location() { return unboundMember("location"); },
  get midi() { return unboundMember("midi"); },
  get lumina() { return unboundMember("lumina"); },
  get haptics() { return unboundMember("haptics"); },
  get webContent() { return unboundMember("webContent"); },
  get trusted() { return unboundMember("trusted"); },
});

/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { getSynWareNamespace } from "../SynCloudOS/AppSDK/useStrings";
import "../SynCloudOS/styles/runtime.css";
import { StrictMode, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { App as ShellApp } from "../App";
import { ApplicationHost, applicationRecoveryError } from "./ApplicationHost";
import { createApplicationHostHome, type ApplicationHostHome } from "./applicationHome";
import { NSEAppearanceProvider, type NSEAppearanceDefinition } from "../NSE/Appearance";
import { atmoAppearance } from "../NSE/Themes/Atmo";
import { NSERubberBandProvider } from "../NSE/Scroll";
import { NSEAlertBackdrop } from "../NSE/SystemUI";
import { SystemAlert } from "./SystemAlert";
import { SCOSAlertPresenter } from "./SCOSAlertPresenter";
import { HostSiteBrandingProvider } from "./siteBrandingContext";
import { HostFontsProvider } from "./hostFontsContext";
import { NSEFontManager } from "../NSE/Typography/NSEFontManager";
import { captureFontDeclaration, type FontDeclaration } from "../NSE/Typography/fontDeclaration.mjs";
import { runtimeFontCatalogue, type SynWareFontCatalogue } from "../SynCloudOS/AppSDK/fontAccess";
import { useActiveLocale, useResolvedMode } from "./serviceHooks";
import { resolveSiteBranding, type ResolvedSiteBranding } from "../SynCloudOS/Branding/siteBranding";
import { exposeSynCloudOS } from "../SynCloudOS/Developer/exposeSynCloudOS";
import { createSynWareBundle } from "../SynCloudOS/AppSDK/createSynWare";
import { normalizeBundleIdentifier } from "../SynCloudOS/Identity/bundleIdentifier.mjs";
import { captureSynWareManifest, projectRuntimeManifest, type SynWareManifestV1 } from "../SynCloudOS/AppSDK";
import type { SynWareDefinition } from "../SynCloudOS/AppSDK/appDefinitionTypes";
import type { SynWareRuntimeManifestContext } from "../SynCloudOS/AppSDK/manifest/manifestTypes";
import { createRegisteredFontResourceLoader, fontResourceMimeTypeForPath } from "../SynCloudOS/BundleLoader/fontResourceLoader";
import type { SynCloudOSAppModule, TrustedSynWareBundle } from "../SynCloudOS/BundleLoader/bundleTypes";
import { trustSynWareBundleForProject } from "../SynCloudOS/BundleLoader/trustedBundleProvenance";
import { SynCloudOSWatchdog } from "../SynCloudOS/ErrorManager/SynCloudOSWatchdog";
import type { CapturedSynCloudOSError } from "../SynCloudOS/ErrorManager/errorTypes";
import type { OperationResult } from "../SynCloudOS/Operations/operationTypes";
import type { SynCloudOSLocaleBundleResourceInput } from "../SynCloudOS/LocaleServices/localeTypes";
import { createBrowserRuntimeEnvironment } from "../SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { createBrowserRoutePlatform } from "../SynCloudOS/PlatformAdapters/BrowserRoutePlatform";
import { createBrowserRecoveryWatchdog } from "../SynCloudOS/PlatformAdapters/BrowserRecoveryWatchdog";
import { createBrowserRouteCoordinator, type CoordinatedRouteResolution } from "../SynCloudOS/Routing/BrowserRouteCoordinator";
import { createSynCloudOS } from "../SynCloudOS/Runtime/createSynCloudOS";
import type { RuntimeDisposalResult } from "../SynCloudOS/Runtime/disposalTypes";
import type { SynCloudOSRuntime, SynCloudOSRuntimeConfig } from "../SynCloudOS/Runtime/runtimeInstanceTypes";
import type { SynCloudOSPolicyProfile } from "../SynCloudOS/PolicyKit/policyTypes";
import { createSynCloudOSFacade } from "../SynCloudOS/SynCloudOS";
import type { AuthenticationInput, WebspringDefinition } from "../Webspring/webspringTypes";
import type { SynCloudOSShellResources } from "../Webspring/WebspringController";
import { getWebspringLocaleResourceLoader } from "../Webspring/webspringLocale";
import { webspringPresentationRoles } from "../SynCloudOS/SynCloudOS";
import { FocusScope, RuntimeInputBoundary, SynCloudOSProvider } from "./index";
import {
  composeSynCloudOSHostContributions,
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
  type SynCloudOSHostCompositionInput,
  type SynCloudOSHostContribution,
} from "./browserHostContributions";
import {
  emptyProjectComposition,
  type SynCloudOSDiscoveredBundleDescriptor,
  type SynCloudOSProjectComposition,
} from "./projectComposition";
import { withDiscoveredWebspringItems } from "../Webspring/Webspring";
/** One application folder as the project discovered it; see projectComposition.ts. */
export type { SynCloudOSDiscoveredBundleDescriptor, SynCloudOSProjectComposition } from "./projectComposition";

export type SynCloudOSBrowserBundle = Readonly<SynWareDefinition> | SynCloudOSDiscoveredBundleDescriptor;

interface BrowserHostOptions {
  readonly element: Element;
  readonly bundles?: readonly SynCloudOSBrowserBundle[];
  /** Browser deployment prefix, such as `/nested/product/`. Runtime/app routes remain rooted at `/`. */
  readonly deploymentBasePath?: string;
  /** One host-owned declaration, with URLs generated by the Vite typography module. */
  readonly fonts?: { readonly declaration: FontDeclaration; readonly resourceUrls: Readonly<Record<string, string>> };
  readonly authentication?: AuthenticationInput;
  /** This host's role taxonomy. Defaults to the built-in profile. */
  readonly policyProfile?: SynCloudOSPolicyProfile;
  /** The NSE appearance (theme) that paints the shell, windows and controls.
   * Import the theme's stylesheet alongside it. Defaults to Atmo. */
  readonly appearance?: NSEAppearanceDefinition;
  readonly contributions?: readonly SynCloudOSHostContribution[];
  /** Host-owned legal attribution for each application's standard About panel.
   * Its display name and version remain the application's Info.ts identity. */
  readonly about?: SynWareRuntimeManifestContext["about"];
  /** What the project's folders declare. Defaults to `virtual:syncloudos/project`,
   * which the Vite plugin generates; pass one to host a build without it. */
  readonly composition?: SynCloudOSProjectComposition;
}

/** How an application-only host presents its primary application:
 * `fullscreen` (the default) fills the page with the app's content and no
 * system top bar; `declared` keeps the manifest's presentation and frame.
 * A primary that fills the page under `optional` or `required` authentication
 * must declare `applicationMenu: { trigger: "content" }` and open the menu
 * from its content with `useApplicationMenuTrigger()`: that menu is the
 * only way to reach Preferences > Account, Sign In and Log Out. */
export type SynCloudOSApplicationFrameMode = "fullscreen" | "declared";

/** A host chooses its Webspring shell, one primary application, or — with
 * neither — the shell its project declares. */
export type MountSynCloudOSOptions = BrowserHostOptions & (
  | { readonly shell: WebspringDefinition; readonly application?: never;
      readonly shellResources?: SynCloudOSShellResources }
  | { readonly application: Readonly<{ bundleIdentifier: string; frame?: SynCloudOSApplicationFrameMode }>; readonly shell?: never;
      readonly shellResources?: never }
  | { readonly shell?: undefined; readonly application?: undefined;
      readonly shellResources?: SynCloudOSShellResources }
);

export interface MountedSynCloudOSHost {
  dispose(reason?: string): Promise<RuntimeDisposalResult>;
}

type InternalMountOptions = MountSynCloudOSOptions & { readonly persistenceNamespace?: string };

/** The options after the project composition filled in what the host omitted. */
interface ResolvedHostOptions extends BrowserHostOptions {
  readonly shell?: WebspringDefinition;
  readonly application?: Readonly<{ bundleIdentifier: string; frame?: SynCloudOSApplicationFrameMode }>;
  readonly shellResources?: SynCloudOSShellResources;
  readonly composition: SynCloudOSProjectComposition;
}

function validateHostMode(options: MountSynCloudOSOptions): void {
  if (options.shell !== undefined && options.application !== undefined) {
    throw new TypeError("mountSynCloudOS requires at most one of shell or application; these modes are mutually exclusive.");
  }
  if (options.application !== undefined) {
    const application = options.application;
    if (!application || typeof application !== "object" || Array.isArray(application)
      || Object.keys(application).some(key => key !== "bundleIdentifier" && key !== "frame")
      || typeof application.bundleIdentifier !== "string" || application.bundleIdentifier.trim() !== application.bundleIdentifier || !application.bundleIdentifier) {
      throw new TypeError("mountSynCloudOS application.bundleIdentifier must be a non-empty application identifier.");
    }
    if (application.frame !== undefined && application.frame !== "fullscreen" && application.frame !== "declared") {
      throw new TypeError('mountSynCloudOS application.frame must be "fullscreen" or "declared".');
    }
    if (options.shellResources !== undefined) {
      throw new TypeError("Application-only hosting cannot include Webspring shell resources.");
    }
  }
}

type ResolvedMountOptions = InternalMountOptions & ResolvedHostOptions;

/**
 * Fills what the host omitted from the project composition: the shell its
 * folders declare (with their panes and widgets), its applications and its
 * integrations. Hosts without the Vite plugin pass a composition.
 */
function resolveHostOptions(input: InternalMountOptions): ResolvedMountOptions {
  const composition = input.composition ?? emptyProjectComposition;
  const declaredShell = input.shell;
  const shell = declaredShell === undefined || declaredShell === composition.shell
    ? composition.shell
    : withDiscoveredWebspringItems(declaredShell, composition);
  if (shell === null && input.application === undefined) {
    throw new TypeError("mountSynCloudOS found no Webspring shell: this project declares none at src/Webspring/Contents/index.tsx. Pass a shell, or an application for an application-only host.");
  }
  return {
    ...input,
    composition,
    bundles: input.bundles ?? composition.bundles,
    contributions: [...composition.contributions, ...(input.contributions ?? [])],
    ...(input.application === undefined && shell !== null ? { shell } : {}),
    ...(input.shellResources === undefined ? { shellResources: composition.shellResources } : {}),
  } as ResolvedMountOptions;
}

function hostBranding(options: ResolvedHostOptions, runtime: SynCloudOSRuntime): ResolvedSiteBranding {
  if (options.shell) return resolveSiteBranding(options.shell.manifest.webspringShell.branding,
    options.shellResources?.resourceUrls ?? {}, runtime.locale, getSynWareNamespace(options.shell.manifest.bundleIdentifier));
  const app = runtime.apps.getApp(options.application!.bundleIdentifier);
  const name = app?.displayName ?? options.application!.bundleIdentifier;
  return Object.freeze({ name, logoUrl: null, logoAlt: name, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null });
}


function componentKeyFromPackageName(value: string): string {
  const compact = value
    .replace(/\.app$/iu, "")
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    .replace(/[^A-Za-z0-9]/gu, "");
  return compact || "SynWare";
}

function dataValues(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) return [value];
  const values: unknown[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && "value" in descriptor) values.push(descriptor.value);
  }
  return values;
}

function capturedDescriptorManifest(input: unknown, modulePath: string): Readonly<SynWareManifestV1> {
  const candidates = [input, ...dataValues(input)];
  const seenCandidates = new Set<unknown>();
  const valid = candidates.flatMap((candidate) => {
    if ((typeof candidate === "object" || typeof candidate === "function") && candidate !== null) {
      if (seenCandidates.has(candidate)) return [];
      seenCandidates.add(candidate);
    }
    const result = captureSynWareManifest(candidate);
    return result.ok ? [result.value] : [];
  });
  if (valid.length !== 1) {
    throw new TypeError(`Discovered bundle ${modulePath} must expose exactly one valid SynWare manifest.`);
  }
  return valid[0]!;
}

function validatedResourceMap(value: Readonly<Record<string, string>> | undefined, label: string, prefix = "./Resources/") {
  const result: Record<string, string> = {};
  const folded = new Set<string>();
  if (value !== undefined && (typeof value !== "object" || value === null || Array.isArray(value))) throw new TypeError(`${label} must be a resource map.`);
  for (const key of Reflect.ownKeys(value ?? {})) {
    if (typeof key !== "string") throw new TypeError(`${label} must not contain symbol keys.`);
    const property = Object.getOwnPropertyDescriptor(value ?? {}, key);
    if (!property || !property.enumerable || !("value" in property)) throw new TypeError(`${label} ${key} must be an enumerable data property.`);
    const url = property.value;
    const relative = key.startsWith(prefix) ? key.slice(prefix.length) : "";
    const segments = relative.split("/");
    if (!relative || segments.some((segment) => !segment || segment === "." || segment === "..") || key.includes("\\")) {
      throw new TypeError(`${label} key ${key} must stay within ${prefix}.`);
    }
    if (typeof url !== "string" || !url) throw new TypeError(`${label} ${key} requires a URL.`);
    const lower = key.toLocaleLowerCase("en-US");
    if (folded.has(lower)) throw new TypeError(`${label} contains a case-colliding resource key ${key}.`);
    folded.add(lower);
    result[key] = url;
  }
  return Object.freeze(result);
}

function descriptorData(descriptor: object, key: string, required = false): unknown {
  const property = Object.getOwnPropertyDescriptor(descriptor, key);
  if (!property) {
    if (required) throw new TypeError(`A discovered bundle requires ${key}.`);
    return undefined;
  }
  if (!property.enumerable || !("value" in property)) throw new TypeError(`Discovered bundle ${key} must be an enumerable data property.`);
  return property.value;
}

function descriptorBundle(descriptor: SynCloudOSDiscoveredBundleDescriptor, about: BrowserHostOptions["about"]): TrustedSynWareBundle {
  const modulePath = descriptorData(descriptor, "modulePath", true);
  const loadModule = descriptorData(descriptor, "loadModule", true);
  if (typeof modulePath !== "string" || !modulePath) throw new TypeError("A discovered bundle modulePath must be a non-empty string.");
  if (typeof loadModule !== "function") throw new TypeError("A discovered bundle loadModule must be a function.");
  const manifest = capturedDescriptorManifest(descriptorData(descriptor, "manifest", true), modulePath);
  const resourceUrls = validatedResourceMap(descriptorData(descriptor, "resourceUrls") as Readonly<Record<string, string>> | undefined, "Bundle resources");
  const declaredIcon = manifest.webspring?.icon;
  const icon = declaredIcon === undefined ? undefined : resourceUrls[declaredIcon];
  if (declaredIcon !== undefined && icon === undefined) {
    throw new TypeError(`SynWare icon resource ${declaredIcon} is not registered for ${manifest.bundleIdentifier}.`);
  }
  const projected = icon === undefined ? manifest : Object.freeze({
    ...manifest,
    webspring: Object.freeze({ ...manifest.webspring, icon }),
  });
  const appRoot = modulePath.replaceAll("\\", "/").replace(/\/Contents\/.*$/u, "");
  const packageName = appRoot.slice(appRoot.lastIndexOf("/") + 1);
  const runtimeManifest = projectRuntimeManifest(projected, {
    about,
    appRoot,
    packageName,
    path: `${appRoot}/`,
    resourceUrls,
    componentKey: componentKeyFromPackageName(packageName),
  });
  const fontUrls = validatedResourceMap(descriptorData(descriptor, "fontResourceUrls") as Readonly<Record<string, string>> | undefined, "Bundle fonts");
  const fonts = Object.fromEntries(Object.entries(fontUrls).map(([path, url]) => {
    const runtimePath = path.slice(2);
    return [runtimePath, Object.freeze({ url, mimeType: fontResourceMimeTypeForPath(runtimePath) })];
  }));
  return Object.freeze({
    manifest: runtimeManifest,
    synWareManifest: manifest,
    componentKey: runtimeManifest.componentKey,
    modulePath,
    loadModule: loadModule as () => Promise<SynCloudOSAppModule>,
    services: [...runtimeManifest.requiredServices, ...(runtimeManifest.optionalServices ?? [])],
    optionalServices: [...(runtimeManifest.optionalServices ?? [])],
    permissions: [...(manifest.permissions ?? [])],
    localeResources: descriptorData(descriptor, "localeResources") as SynCloudOSLocaleBundleResourceInput | undefined,
    fontResourceLoader: createRegisteredFontResourceLoader(fonts),
  });
}

function isDiscoveredBundle(value: SynCloudOSBrowserBundle): value is SynCloudOSDiscoveredBundleDescriptor {
  return Object.prototype.hasOwnProperty.call(value, "loadModule");
}

function browserBundles(
  inputs: readonly SynCloudOSBrowserBundle[],
  firstParty: boolean,
  about: BrowserHostOptions["about"],
): readonly TrustedSynWareBundle[] {
  const bundles = inputs.map((input) => {
    if (!isDiscoveredBundle(input)) return createSynWareBundle(input, { about });
    const bundle = descriptorBundle(input, about);
    return firstParty ? trustSynWareBundleForProject(bundle, input.modulePath) : bundle;
  });
  const ids = new Set<string>();
  for (const bundle of bundles) {
    const id = normalizeBundleIdentifier(bundle.synWareManifest?.bundleIdentifier ?? bundle.manifest.bundleIdentifier);
    if (ids.has(id)) throw new TypeError(`Duplicate SynWare manifest ID ${id}.`);
    ids.add(id);
  }
  return bundles;
}


function RootRecoveryBoundary({ runtime, options, fontCatalogue, children }: PropsWithChildren<{
  runtime: SynCloudOSRuntime;
  options: ResolvedHostOptions;
  fontCatalogue: SynWareFontCatalogue;
}>) {
  const appearance = useResolvedMode();
  useActiveLocale();
  const branding = hostBranding(options, runtime);
  return <HostSiteBrandingProvider value={branding}><HostFontsProvider catalogue={fontCatalogue}>
    <SynCloudOSWatchdog runtime={runtime} watchdogName="SynCloudOS root" scope="root" fallback={(error) => {
      if (!error) return null;
      const browserWindow = runtime.environment.browser.getWindow();
      return <FocusScope scopeId={`root-system-alert:${error.id}`} kind="modal" parentResponderId="runtime" trapFocus>
        <div className="syncloudos-root-error-shell"><NSEAlertBackdrop><SystemAlert
          error={options.application ? applicationRecoveryError(error) : error} appearance={appearance}
          onDismiss={() => browserWindow?.location.reload()} onReload={() => browserWindow?.location.reload()}
          onReturn={() => options.shell ? browserWindow?.location.assign("/") : browserWindow?.location.reload()}
          onOpenMailClient={(destination) => { browserWindow?.location.assign(destination); }}
        /></NSEAlertBackdrop></div>
      </FocusScope>;
    }}>{children}</SynCloudOSWatchdog>
  </HostFontsProvider></HostSiteBrandingProvider>;
}

function renderHost(
  element: Element,
  runtime: SynCloudOSRuntime,
  options: ResolvedHostOptions,
  fontCatalogue: SynWareFontCatalogue,
  appearance: NSEAppearanceDefinition,
  home: ApplicationHostHome | null,
  Shell: typeof ShellApp | undefined,
): Root {
  const root = createRoot(element);
  root.render(
    <StrictMode>
      <SynCloudOSProvider runtime={runtime}>
        <NSEAppearanceProvider appearance={appearance} appearanceService={runtime.appearance}>
          <RuntimeInputBoundary>
            <RootRecoveryBoundary runtime={runtime} options={options} fontCatalogue={fontCatalogue}>
              <NSERubberBandProvider>{home
                ? <ApplicationHost applicationId={home.primaryId} authentication={options.authentication ?? "disabled"} home={home} />
                : Shell && <Shell shell={options.shell!} shellResources={options.shellResources} authentication={options.authentication} />}</NSERubberBandProvider>
              {!home ? <SCOSAlertPresenter center={runtime.alerts} /> : null}
            </RootRecoveryBoundary>
          </RuntimeInputBoundary>
        </NSEAppearanceProvider>
      </SynCloudOSProvider>
    </StrictMode>,
  );
  return root;
}
interface InstalledContribution {
  readonly cleanup?: () => void | Promise<void>;
  readonly contextCleanup: () => Promise<void>;
  readonly runBootNotifications: () => Promise<void>;
}

async function cleanupInstalledContributions(
  installed: readonly InstalledContribution[],
): Promise<readonly unknown[]> {
  const errors: unknown[] = [];
  for (const entry of [...installed].reverse()) {
    if (entry.cleanup) {
      try { await entry.cleanup(); } catch (error) { errors.push(error); }
    }
    try { await entry.contextCleanup(); } catch (error) { errors.push(error); }
  }
  return errors;
}

function assertHostInstallLive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The host contribution installation was aborted.", "AbortError");
}

interface BrowserMountAttempt {
  readonly controller: AbortController;
  mounting: boolean;
  retirement?: Promise<BrowserMountRetirement>;
  dispose?: () => Promise<RuntimeDisposalResult>;
  recoveryRoot?: Root;
}

type BrowserMountRetirement =
  | { readonly status: "released" }
  | { readonly status: "blocked"; readonly owner: BrowserMountAttempt; readonly error: unknown };

const browserMountAttempts = new WeakMap<Element, BrowserMountAttempt>();

function assertMountCurrent(element: Element, attempt: BrowserMountAttempt) {
  if (browserMountAttempts.get(element) !== attempt || attempt.controller.signal.aborted) {
    throw new DOMException("The browser mount was superseded.", "AbortError");
  }
}

async function beginBrowserMount(element: Element): Promise<BrowserMountAttempt> {
  const previous = browserMountAttempts.get(element);
  const attempt: BrowserMountAttempt = { controller: new AbortController(), mounting: true };
  browserMountAttempts.set(element, attempt);
  // A newer retry also joins teardown already started by its predecessor.
  // Otherwise three overlapping attempts could construct two live runtimes.
  attempt.retirement = previous ? (async (): Promise<BrowserMountRetirement> => {
    const earlier = await previous.retirement;
    if (earlier?.status === "blocked") return earlier;
    try {
      const result = await previous.dispose?.();
      if (result?.status === "cancelled") {
        return { status: "blocked", owner: previous,
          error: new DOMException(`The existing browser host could not close: ${result.reason}`, "AbortError") };
      }
      previous.controller.abort("mount-replaced");
      previous.recoveryRoot?.unmount();
      previous.recoveryRoot = undefined;
      return { status: "released" };
    } catch (error) {
      return { status: "blocked", owner: previous, error };
    }
  })() : Promise.resolve({ status: "released" });
  const retirement = await attempt.retirement;
  if (retirement.status === "blocked") {
    if (browserMountAttempts.get(element) === attempt) browserMountAttempts.set(element, retirement.owner);
    throw retirement.error;
  }
  assertMountCurrent(element, attempt);
  return attempt;
}

interface BootstrapRecovery {
  readonly error: CapturedSynCloudOSError;
  readonly branding: ResolvedSiteBranding;
  readonly appearance: "light" | "dark";
  readonly applicationIcon: string | null;
  readonly browserWindow: ReturnType<SynCloudOSRuntime["environment"]["browser"]["getWindow"]>;
}

function bootstrapOperationResult(error: unknown) {
  return error instanceof Error && error.cause && typeof error.cause === "object"
    ? error.cause as Partial<OperationResult<unknown>> : undefined;
}

function captureBootstrapFailure(runtime: SynCloudOSRuntime, error: unknown, route: string): CapturedSynCloudOSError {
  const result = bootstrapOperationResult(error);
  const context = { source: "SynCloudOS.BrowserHost.mount", phase: "bootstrap", route };
  if (result?.status === "failed" && result.error?.code === "route-not-found") {
    return runtime.errors.createRouteNotFoundError(route, context);
  }
  // Route preload already captures the app's classified error and import cause.
  const latest = runtime.errors.getLatest();
  const resolution = runtime.routes.resolveRoute(route);
  if (latest && resolution.kind === "app" && normalizeBundleIdentifier(latest.appId) === normalizeBundleIdentifier(resolution.app.bundleIdentifier)
    && latest.source === "SynCloudOS.RouteManager.openRoute"
    && (latest.context?.phase === "route-preload" || latest.context?.phase === "route-preparation")) {
    return latest;
  }
  return runtime.errors.capture({
    code: "UNKNOWN_RUNTIME_ERROR", title: "SynCloudOS could not start.",
    message: "Something prevented SynCloudOS from starting. Reload the page to try again.",
    error, source: context.source, severity: "fatal", recoverable: false,
    suggestedActions: ["reload", "returnToWebspring"], context,
  });
}

function renderBootstrapRecovery(element: Element, attempt: BrowserMountAttempt, recovery: BootstrapRecovery, home: string, appearance: NSEAppearanceDefinition) {
  if (browserMountAttempts.get(element) !== attempt) return;
  const navigate = (destination?: string) => {
    if (browserMountAttempts.get(element) !== attempt) return;
    if (destination === undefined) recovery.browserWindow?.location.reload();
    else recovery.browserWindow?.location.assign(destination);
  };
  const root = createRoot(element);
  attempt.recoveryRoot = root;
  // Only captured data and browser navigation survive teardown. The existing
  // NSE backdrop owns physical focus; no disposed kernel provider is retained.
  root.render(<HostSiteBrandingProvider value={recovery.branding}>
    <NSEAppearanceProvider appearance={appearance} colourScheme={recovery.appearance}>
      <div className="syncloudos-root-error-shell"><NSEAlertBackdrop>
        <SystemAlert error={recovery.error}
          appearance={recovery.appearance} applicationIcon={recovery.applicationIcon}
          onDismiss={() => navigate(home)} onReturn={() => navigate(home)} onReload={() => navigate()}
          onOpenMailClient={(destination) => navigate(destination)} />
      </NSEAlertBackdrop></div>
    </NSEAppearanceProvider>
  </HostSiteBrandingProvider>);
}

async function mountInternal(options: ResolvedMountOptions, projectBundles: boolean): Promise<MountedSynCloudOSHost> {
  validatedResourceMap(options.shellResources?.resourceUrls, "Shell resources");
  validatedResourceMap(options.shellResources?.fontResourceUrls, "Shell fonts");
  const shellResourceUrls = options.shellResources?.resourceUrls ?? {};
  for (const reference of [
    options.shell?.manifest.webspringShell.branding.logo,
    options.shell?.manifest.webspringShell.branding.lightLogo,
    options.shell?.manifest.webspringShell.branding.darkLogo,
    options.shell?.manifest.webspringShell.branding.compactLogo,
    options.shell?.manifest.webspringShell.branding.homeIcon,
  ]) {
    if (reference && !shellResourceUrls[reference.resource]) {
      throw new TypeError(`Site branding resource ${reference.resource} is not registered.`);
    }
  }
  const authenticationPolicy = typeof options.authentication === "string" ? options.authentication : options.authentication?.policy;
  if (authenticationPolicy !== undefined && !["disabled", "optional", "required"].includes(authenticationPolicy)) {
    throw new TypeError("Unsupported authentication policy.");
  }
  // Capture metadata before asynchronous preparation so a caller cannot
  // mutate the shared panel's catalogue while this host is starting.
  let fontCatalogue: SynWareFontCatalogue;
  if (options.fonts) {
    const declaration = captureFontDeclaration(descriptorData(options.fonts, "declaration") as FontDeclaration);
    const urls = validatedResourceMap(descriptorData(options.fonts, "resourceUrls") as Readonly<Record<string,string>>, "Managed fonts", "Resources/");
    const resources = Object.fromEntries(Object.values(declaration.resources).map(path => {
      if (!urls[path]) throw new TypeError(`Managed font resource ${path} is not registered.`);
      return [path, Object.freeze({ url:urls[path]!, mimeType:fontResourceMimeTypeForPath(path) })];
    }));
    fontCatalogue = Object.freeze({ declaration, manager:new NSEFontManager({families:declaration.families}), loadResource:createRegisteredFontResourceLoader(resources) });
  } else {
    fontCatalogue = Object.freeze({ manager:new NSEFontManager({ families: options.shellResources?.fontFamilies }) });
  }
  const attempt = await beginBrowserMount(options.element);
  const environment = createBrowserRuntimeEnvironment();
  const prepared = await prepareSynCloudOSHostContributions(options.contributions ?? [], environment);
  assertMountCurrent(options.element, attempt);
  const baseRuntimeConfig: SynCloudOSHostCompositionInput["runtimeConfig"] = {
    authenticationPolicy: authenticationPolicy ?? "disabled",
    presentationRolesForRoute: options.application ? () => [] : webspringPresentationRoles,
    ...(options.persistenceNamespace !== undefined
      ? { persistenceNamespace: options.persistenceNamespace }
      : options.application ? { persistenceNamespace: `SynCloudOS:application:${normalizeBundleIdentifier(options.application.bundleIdentifier)}` } : {}),
    ...(options.policyProfile === undefined ? {} : { policyProfile: options.policyProfile }),
    ...(typeof options.authentication === "object"
      ? { identity: { sessionAdapter: options.authentication.service.sessionAdapter } }
      : {}),
  };
  const composition = composeSynCloudOSHostContributions(prepared, {
    runtimeConfig: baseRuntimeConfig,
    initialBundles: browserBundles(options.bundles ?? [], projectBundles, options.about),
  });
  let initialBundles = composition.initialBundles;
  if (options.application) {
    const primaryId = normalizeBundleIdentifier(options.application.bundleIdentifier);
    if (!initialBundles.some(bundle => normalizeBundleIdentifier(bundle.manifest.bundleIdentifier) === primaryId)) {
      throw new TypeError(`Application ${primaryId} is not registered in this host.`);
    }
    for (const bundle of initialBundles) {
      if (bundle.manifest.route === "/") {
        throw new TypeError(`Application ${bundle.manifest.bundleIdentifier} needs a non-root entry route; / is the host's alias for ${primaryId}.`);
      }
      if (normalizeBundleIdentifier(bundle.manifest.bundleIdentifier) !== primaryId && (bundle.manifest.presentation ?? "appView") === "appView") {
        throw new TypeError(`Application ${bundle.manifest.bundleIdentifier} declares the appView presentation; only the primary application fills an application-only host, so other applications must present in windows.`);
      }
    }
    if ((options.application.frame ?? "fullscreen") === "fullscreen") {
      initialBundles = initialBundles.map(bundle => normalizeBundleIdentifier(bundle.manifest.bundleIdentifier) !== primaryId ? bundle : Object.freeze({ ...bundle,
        manifest: Object.freeze({ ...bundle.manifest, presentation: "appView" as const,
          frame: Object.freeze({ ...bundle.manifest.frame, topBar: "none" as const, presentationMotion: "content" as const }),
        }) }));
    }
    const primary = initialBundles.find(bundle => normalizeBundleIdentifier(bundle.manifest.bundleIdentifier) === primaryId)!.manifest;
    if (authenticationPolicy !== undefined && authenticationPolicy !== "disabled"
      && (primary.presentation ?? "appView") === "appView" && primary.applicationMenu?.trigger !== "content") {
      throw new TypeError(`Application ${primaryId} fills the page with ${authenticationPolicy} sign-in but declares no content application-menu trigger. Declare applicationMenu: { trigger: "content" } and open the menu with useApplicationMenuTrigger(), so people can reach Preferences > Account, Sign In and Log Out.`);
    }
  }
  const config: SynCloudOSRuntimeConfig = {
    environment,
    ...composition.runtimeConfig,
    initialBundles,
    trustedDocumentKinds: composition.trustedDocumentKinds,
    ...(composition.applicationDocuments === undefined ? {} : { applicationDocuments: composition.applicationDocuments }),
  };
  const runtime = createSynCloudOS(config);
  runtimeFontCatalogue(runtime, fontCatalogue);
  const disposeHost = (reason: string): Promise<RuntimeDisposalResult> => {
    const disposal = runtime.dispose({ reason, inFlight: "cancel" });
    void disposal.then(result => {
      // Bootstrap recovery outlives the disposed runtime. Its root keeps the
      // attempt's ownership until a newer mount explicitly unmounts it.
      if (result.status === "disposed" && !attempt.mounting && !attempt.recoveryRoot
        && browserMountAttempts.get(options.element) === attempt) {
        browserMountAttempts.delete(options.element);
      }
    }, () => undefined);
    return disposal;
  };
  attempt.dispose = () => disposeHost("mount-replaced");
  const installationAbort = new AbortController();
  const installSignal = AbortSignal.any([runtime.signal, installationAbort.signal, attempt.controller.signal]);
  if (typeof options.authentication === "object") {
    runtime.registerDisposalParticipant({
      id: "authentication-service",
      prepare: () => ({
        status: "ready",
        commit: () => options.authentication && typeof options.authentication === "object"
          ? options.authentication.service.dispose()
          : undefined,
      }),
    });
  }
  const installed: InstalledContribution[] = [];
  let root: Root | undefined;
  let hostCleanup: Promise<void> | undefined;
  const releaseHost = (reason: string): Promise<void> => {
    if (!hostCleanup) {
      hostCleanup = (async () => {
        const errors: unknown[] = [];
        installationAbort.abort(reason);
        try { root?.unmount(); } catch (error) { errors.push(error); }
        root = undefined;
        // Join the active disposal even when a caller disposed the runtime
        // directly. Keep its owner registered until every commit completes.
        void disposeHost(reason);
        errors.push(...await cleanupInstalledContributions(installed.splice(0)));
        if (errors.length > 0) {
          const details = errors.map((error) => error instanceof Error ? error.message : String(error)).join("; ");
          throw new AggregateError(errors, `Browser host cleanup failed: ${details}`);
        }
      })();
    }
    return hostCleanup;
  };
  // The root and contributions belong to the runtime's committed lifetime.
  // Preparation can be cancelled by a document/window owner, so it must leave
  // these capabilities intact. Direct runtime disposal uses this same owner.
  runtime.registerDisposalParticipant({
    id: "browser-host",
    prepare: ({ reason }) => ({ status: "ready", commit: () => releaseHost(reason) }),
  });
  const home = options.application ? createApplicationHostHome(runtime, options.application.bundleIdentifier, authenticationPolicy === "required") : null;
  if (home) {
    runtime.registerDisposalParticipant({
      id: "application-host-home",
      prepare: () => ({ status: "ready", commit: () => home.dispose() }),
    });
  }
  let initialPathname = `${environment.browser.getLocation().pathname}${environment.browser.getLocation().search}${environment.browser.getLocation().hash}`;
  try {
    const loadShellLocale = getWebspringLocaleResourceLoader();
    runtime.locale.registerBundleLocaleResourceLoader("webspring", async activeLocale => {
      const resources = await loadShellLocale(activeLocale);
      if (resources) runtime.locale.registerBundleLocaleResources("webspring", resources);
      // Site-owned strings must retain precedence over built-in defaults,
      // including after a language change reloads those defaults.
      return options.shellResources?.localeResources;
    });
    for (const contribution of prepared) {
      assertHostInstallLive(installSignal);
      const handle = createSynCloudOSHostInstallContext(
        contribution,
        runtime,
        options.shellResources?.resourceUrls,
        installSignal,
      );
      let contributionCleanup: (() => void | Promise<void>) | undefined;
      try {
        const returnedCleanup = await contribution.install?.(handle.context);
        contributionCleanup = returnedCleanup === undefined ? undefined : returnedCleanup;
        if (contributionCleanup !== undefined && typeof contributionCleanup !== "function") {
          throw new TypeError(`Host contribution ${contribution.id} cleanup must be a function.`);
        }
        assertHostInstallLive(installSignal);
        installed.push({
          cleanup: contributionCleanup,
          contextCleanup: handle.cleanup,
          runBootNotifications: handle.runBootNotifications,
        });
      } catch (error) {
        if (contributionCleanup) {
          try { await contributionCleanup(); } catch { /* preserve installation error */ }
        }
        try { await handle.cleanup(); } catch { /* preserve installation error */ }
        throw error;
      }
    }
    assertHostInstallLive(installSignal);
    for (const contribution of installed) await contribution.runBootNotifications();
    const browserRoutePlatform = createBrowserRoutePlatform(environment, {
      deploymentBasePath: options.deploymentBasePath,
    });
    const isApplicationRoot = (href: string) => Boolean(options.application && /^\/(?:[?#]|$)/u.test(href));
    const applicationPath = (href: string) => isApplicationRoot(href)
      ? `${runtime.apps.getApp(options.application!.bundleIdentifier)!.route}${href.slice(1)}` : href;
    const browserRoutes = createBrowserRouteCoordinator({
      platform: browserRoutePlatform,
      getRuntimeSnapshot: runtime.store.getSnapshot,
      subscribeRuntime: runtime.store.subscribe,
      subscribeRouteOpen: (listener) => runtime.events.subscribe("route.open", (event) => {
        const payload = event.payload as { browserHref?: unknown; syncRoute?: unknown; historyMode?: unknown };
        if (typeof payload.browserHref === "string" && typeof payload.syncRoute === "boolean") {
          listener({
            browserHref: payload.browserHref,
            syncRoute: payload.syncRoute,
            ...(payload.historyMode === "replace" || payload.historyMode === "push"
              ? { historyMode: payload.historyMode }
              : {}),
          });
        }
      }),
      resolveRoute: (pathname) => runtime.routes.resolveRoute(applicationPath(pathname)) as CoordinatedRouteResolution,
        openRoute: (pathname, routeOptions) => runtime.routes.openRoute(applicationPath(pathname),
          isApplicationRoot(pathname) ? { ...routeOptions, syncRoute: false } : routeOptions),
        getRedirectSuccessor: runtime.routes.getRedirectSuccessor,
      waitForPresentationSettlement: async (id) => { await runtime.presentationSettlements.get(id)?.result; },
      cancelPresentationSettlement: (id, reason) => { runtime.presentationSettlements.get(id)?.cancel(reason); },
      run: (operation) => operation(),
    });
    const location = browserRoutePlatform.getLocation();
    const frameworkTestPath = import.meta.env.DEV && location.pathname.startsWith("/__framework-tests/");
    initialPathname = frameworkTestPath
      ? "/"
      : `${applicationPath(location.pathname)}${location.search}${location.hash}`;

    // Framework fixtures intentionally boot the canonical Webspring runtime at
    // `/` while keeping their own browser URL so App can mount the fixture.
    // Starting browser routing before that boot lets the boot-time route.open
    // synchronise `/` into history, erasing the fixture pathname before React
    // gets a chance to select FrameworkTestHost.
    if (!frameworkTestPath) browserRoutes.start();
    runtime.registerDisposalParticipant({
      id: "browser-route-coordinator",
      prepare: () => ({ status: "ready", commit: () => browserRoutes.stop() }),
    });
    runtime.globalWatchdog.install();
    const recoveryWatchdog = createBrowserRecoveryWatchdog(runtime, {
      getSiteName: () => hostBranding(options, runtime).name,
      authentication: typeof options.authentication === "object" ? options.authentication.service : undefined,
    });
    runtime.registerDisposalParticipant({
      id: "browser-recovery-watchdog",
      prepare: () => ({ status: "ready", commit: () => recoveryWatchdog.dispose() }),
    });
    recoveryWatchdog.install();
    const exposure = exposeSynCloudOS(runtime, createSynCloudOSFacade(runtime));
    if (exposure) {
      runtime.registerDisposalParticipant({
        id: "developer-exposure",
        prepare: () => ({ status: "ready", commit: () => exposure.dispose() }),
      });
    }
    if (frameworkTestPath) {
      await runtime.boot({ initialPathname });
      browserRoutes.start();
    }
    assertMountCurrent(options.element, attempt);
    // Load the optional shell only for shell hosts; awaiting it keeps mounting
    // and bootstrap recovery atomic without attaching launcher CSS to apps.
    const Shell = options.shell ? (await import("../App")).App : undefined;
    assertMountCurrent(options.element, attempt);
    root = renderHost(
      options.element,
      runtime,
      options,
      fontCatalogue,
      options.appearance ?? atmoAppearance,
      home,
      Shell,
    );
    if (!frameworkTestPath) await runtime.boot({ initialPathname });
    assertMountCurrent(options.element, attempt);
  } catch (error) {
    const cancelled = browserMountAttempts.get(options.element) !== attempt || runtime.signal.aborted
      || (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
      || bootstrapOperationResult(error)?.status === "cancelled";
    let recovery: BootstrapRecovery | undefined;
    if (!cancelled) {
      const captured = captureBootstrapFailure(runtime, error, initialPathname);
      // A captured retry closure can belong to the failed runtime; recovery
      // retries through a fresh browser mount instead of invoking that owner.
      const { retry: _retry, ...capturedData } = captured;
      recovery = {
        error: options.application ? applicationRecoveryError(capturedData) : capturedData,
        branding: hostBranding(options, runtime),
        appearance: runtime.appearance.resolved(),
        applicationIcon: captured.appId ? runtime.store.getSnapshot().appInfo[normalizeBundleIdentifier(captured.appId)]?.icon.src ?? null : null,
        browserWindow: environment.browser.getWindow(),
      };
    }
    const result = await runtime.dispose({ reason: "mount-failed", inFlight: "cancel" });
    if (result.status === "cancelled") {
      // A failed boot can still have a live document owner. Do not dismantle
      // its host when close preparation refuses disposal.
      throw new AggregateError([error], `Browser host initialization failed; runtime disposal was cancelled: ${result.reason}`, { cause: error });
    }
    attempt.dispose = undefined;
    attempt.mounting = false;
    if (recovery) renderBootstrapRecovery(options.element, attempt, recovery, options.deploymentBasePath ?? "/", options.appearance ?? atmoAppearance);
    else if (browserMountAttempts.get(options.element) === attempt) browserMountAttempts.delete(options.element);
    if (result.errors.length > 0) {
      throw new AggregateError([error, ...result.errors], "Browser host initialization and cleanup failed.", { cause: error });
    }
    throw error;
  }
  attempt.mounting = false;
  return Object.freeze({
    dispose(reason = "host-disposed") {
      // The coordinator deduplicates in-flight/successful requests and opens a
      // fresh transaction after cancellation; the host must not cache a veto.
      return disposeHost(reason);
    },
  });
}

export function mountSynCloudOS(options: MountSynCloudOSOptions): Promise<MountedSynCloudOSHost> {
  if (!(options.element instanceof Element)) throw new TypeError("mountSynCloudOS requires a browser Element.");
  validateHostMode(options);
  return mountInternal(resolveHostOptions(options), options.bundles === undefined);
}

export type { SynCloudOSHostContribution } from "./browserHostContributions";

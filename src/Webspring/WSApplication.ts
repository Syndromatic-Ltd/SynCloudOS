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

import type { NSEPreferencePaneClass, PreferencePaneDescriptor } from "../SynCloudOS/Preferences";
import { capturePreferencePaneClass, isPreferencePaneDescriptor } from "../SynCloudOS/Preferences";
import { NSEObject, type SynCloudOSLifecycleDisposalReason } from "../NSE/sdkPackageEntry";
import { nseSmoothSurfaceRadiusTokens } from "../NSE/SmoothSurface";
import {
  ObjectLifetime,
  OwnershipScope,
  assertFrameworkConstructedApplication,
  instantiateInOwnerScope,
  nseDisposeFor,
  ownNSEFactory,
  type Disposable,
  type NSEOwner,
  type OwnedObject,
  type SynchronousDisposable,
} from "../NSE/hostComposition";
import { defaultWebspringFolderAppearance, defaultWebspringFolderSmoothSurface } from "./WebspringFolderAppearance";
import { createWSFolderSplitPresentation } from "./WSFolderSplitView";
import { WSLauncherViewController, type WSLauncherViewControllerClass } from "./WSLauncherViewController";
import { defaultWSLaunchZoom } from "./Webspring.transitions";
import { WSBoardViewController } from "./Contents/Views/WSBoardViewController/WSBoardViewController";
import { captureWSInfo, assertKnownFields, assertPlainRecord, readOwnDataProperty, type WSCapturedInfo } from "./WSInfo";
import { WSSurface, captureWSSurface, defaultWSShelfSurface } from "./WSSurface";
import { captureWSWidgetClass, isWSWidgetDescriptor, type WSWidgetClass, type WSWidgetDescriptor } from "./WSWidget";
import type {
  Presentation,
  ShellMode,
  WebspringBackground,
  WebspringFolderAppearance,
  WebspringFolderAppearanceOptions,
  WebspringFolderPresentationComponent,
  WebspringIconEffectComponent,
  WebspringLaunchZoom,
  WebspringPreferences,
  WebspringQuickSwitchOptions,
} from "./webspringTypes";

/** Return animation tracks available for launcher controllers. */
export const defaultWSReturnTracks = Object.freeze(["material", "icons"] as const);


const defaultWSFolderPresentation = createWSFolderSplitPresentation();
const presentationSlots: readonly Presentation[] = ["desktop", "tablet", "mobile"];
const smoothSurfaceCurves: Record<string, true> = { arc: true, squircle: true, superellipse: true, clothoid: true };
const launchZoomEasings = new Set(["standard", "emphasized", "decelerate", "accelerate"]);

/** The launcher a presentation uses when the application names none, and the crash fallback. */
export const defaultWSLauncherViewController: WSLauncherViewControllerClass = WSBoardViewController;

/** Static constructor contract accepted by `createWebspring` and `constructWSApplication`. */
export interface WSApplicationClass<TApp extends WSApplication = WSApplication> {
  new (): TApp;
  readonly mainViewController?: WSLauncherViewControllerClass;
  readonly viewControllers?: Readonly<Partial<Record<Presentation, WSLauncherViewControllerClass>>>;
  readonly launcherSurface?: WSSurface;
  readonly shelfSurface?: WSSurface;
  readonly folderAppearance?: WebspringFolderAppearanceOptions;
  readonly folderPresentation?: WebspringFolderPresentationComponent;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: WebspringQuickSwitchOptions;
  readonly widgets?: readonly WSWidgetClass[];
  readonly preferencePanes?: readonly NSEPreferencePaneClass[];
  readonly hiddenPreferencePanes?: readonly string[];
}

/**
 * Webspring shell application delegate. Subclass and default-export it from
 * `src/Webspring/Contents/index.tsx`; the framework constructs and owns it.
 */
export class WSApplication extends NSEObject implements NSEOwner, OwnedObject {
  /** Launcher controller used for every presentation unless overridden in `viewControllers`. */
  static mainViewController?: WSLauncherViewControllerClass;
  /** Per-presentation launcher overrides (`desktop`, `tablet`, `mobile`). */
  static viewControllers?: Readonly<Partial<Record<Presentation, WSLauncherViewControllerClass>>>;
  static launcherSurface: WSSurface = WSSurface.cotton();
  static shelfSurface: WSSurface = defaultWSShelfSurface;
  static folderAppearance: WebspringFolderAppearanceOptions = defaultWebspringFolderAppearance;
  /** Replaces the built-in folder split; `createWSFolderSplitPresentation(options)` configures the built-in one. */
  static folderPresentation?: WebspringFolderPresentationComponent;
  static iconEffect?: WebspringIconEffectComponent;
  static quickSwitch?: WebspringQuickSwitchOptions;
  /** Explicit widgets in display order; discovered `src/Widgets/*.widget` follow by order, then id. */
  static widgets?: readonly WSWidgetClass[];
  /** Explicit panes; discovered `src/Preferences/*.prefPane` follow by order, then id. */
  static preferencePanes?: readonly NSEPreferencePaneClass[];
  /** Built-in preference pane IDs to hide. */
  static hiddenPreferencePanes?: readonly string[];

  readonly #lifetime: ObjectLifetime;

  constructor() {
    super();
    this.#lifetime = new ObjectLifetime(this, "WSApplication", new.target.name || "WSApplication", {});
    assertFrameworkConstructedApplication(this.#lifetime, new.target.name);
  }

  /** Aborts when the shell closes; controllers created during construction adopt it. */
  get ownerSignal(): AbortSignal {
    return this.#lifetime.scope.signal;
  }

  get isDisposed(): boolean {
    return this.#lifetime.isDisposed;
  }

  /** Reason the shell application was disposed, or `undefined` while running. */
  get disposalReason(): SynCloudOSLifecycleDisposalReason | undefined {
    return this.#lifetime.reason;
  }

  /** Constructs and owns a disposable synchronously within the shell's lifetime. */
  own<T extends Disposable>(factory: (signal: AbortSignal) => SynchronousDisposable<T>): T {
    return ownNSEFactory(this, factory);
  }

  /** Registers `listener` to run once after the shell application is disposed. */
  onDispose(listener: (reason: SynCloudOSLifecycleDisposalReason) => void): () => void {
    return this.#lifetime.onDispose(listener);
  }

  /** Runs while the shell initialises before mounting the launcher. */
  applicationWillFinishLaunching(): void | Promise<void> {}
  /** Runs after the shell launcher has mounted. */
  applicationDidFinishLaunching(): void | Promise<void> {}
  /** Runs when the shell host is tearing down. */
  applicationWillTerminate(): void | Promise<void> {}
  /** Runs after disposal before owned controllers are torn down. */
  protected didDispose(): void {}

  /** @internal */
  [nseDisposeFor](reason: SynCloudOSLifecycleDisposalReason): void {
    this.#lifetime.dispose(reason, () => { this.didDispose(); });
  }
}

/** True only when `value` is `WSApplication` or a subclass of it. */
export function isWSApplicationClass(value: unknown): value is WSApplicationClass {
  return typeof value === "function" && (value === WSApplication || value.prototype instanceof WSApplication);
}

/** Constructs `ApplicationClass` inside a dedicated ownership scope for the host. */
export function constructWSApplication<TApp extends WSApplication>(
  ApplicationClass: WSApplicationClass<TApp>,
  context?: unknown,
): TApp {
  if (!isWSApplicationClass(ApplicationClass)) {
    throw new TypeError("Webspring application class must extend WSApplication.");
  }
  const scope = new OwnershipScope("WSApplication", ApplicationClass.name || "WSApplication");
  return instantiateInOwnerScope(scope, () => new ApplicationClass(), context);
}

/** Inputs accepted by `createWebspring` to build an immutable shell definition. */
export interface WSCreateWebspringInput {
  readonly info: unknown;
  readonly application?: WSApplicationClass;
  readonly widgets?: readonly (WSWidgetClass | WSWidgetDescriptor)[];
  readonly preferencePanes?: readonly (NSEPreferencePaneClass | PreferencePaneDescriptor)[];
}

/** Immutable runtime definition built from `WSInfo`, a `WSApplication` class and discovered items. */
export interface WSDefinition {
  readonly info: WSCapturedInfo;
  readonly application: WSApplicationClass;
  readonly viewControllers: Readonly<Record<Presentation, WSLauncherViewControllerClass>>;
  readonly modes: Readonly<Record<Presentation, ShellMode>>;
  readonly returnTracks: Readonly<Record<Presentation, readonly ("material" | "icons")[]>>;
  readonly launchZooms: Readonly<Record<Presentation, Readonly<Required<WebspringLaunchZoom>>>>;
  readonly background: Readonly<WebspringBackground>;
  readonly folderAppearance: WebspringFolderAppearance;
  readonly folderPresentation: WebspringFolderPresentationComponent;
  readonly iconEffect?: WebspringIconEffectComponent;
  readonly quickSwitch?: Readonly<WebspringQuickSwitchOptions>;
  readonly widgets: readonly WSWidgetDescriptor[];
  readonly preferences: Readonly<WebspringPreferences>;
}

const capturedDefinitions = new WeakSet<WSDefinition>();

/** True only for definitions returned by `createWebspring`. */
export function isWSDefinition(value: unknown): value is WSDefinition {
  return typeof value === "object" && value !== null && capturedDefinitions.has(value as WSDefinition);
}

/** Returns the launcher controller class configured for `presentation`. */
export function resolveLauncher(definition: WSDefinition, presentation: Presentation): WSLauncherViewControllerClass {
  if (!isWSDefinition(definition)) throw new TypeError("A Webspring definition must be created with createWebspring.");
  return definition.viewControllers[presentation];
}

/** Checks that the shell's `homeRoute` is legal for every configured launcher mode. */
export function assertWSHomeConfiguration(
  definition: WSDefinition,
  resolveRoute: (pathname: string) => { readonly kind: string },
): void {
  const home = resolveRoute(definition.info.homeRoute);
  const modes = presentationSlots.map((slot) => definition.modes[slot]);
  if (modes.includes("launcher") && home.kind !== "webspring") {
    throw new TypeError(`Launcher Webspring homeRoute ${definition.info.homeRoute} must resolve to the shell.`);
  }
  if (!modes.includes("launcher") && home.kind !== "webspring" && home.kind !== "app") {
    throw new TypeError(`Persistent Webspring homeRoute ${definition.info.homeRoute} is not routeable.`);
  }
}

function readStaticData(ctor: Function, key: string, label: string): unknown {
  for (
    let current: unknown = ctor;
    typeof current === "function" && current !== Function.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    const own = Object.getOwnPropertyDescriptor(current, key);
    if (own) {
      if (!("value" in own)) {
        throw new TypeError(`${label} static ${key} must be a data property, not an accessor.`);
      }
      return own.value;
    }
  }
  return undefined;
}

function isReactComponent(component: unknown): boolean {
  if (typeof component === "function") return true;
  if (typeof component !== "object" || component === null) return false;
  const reactType = Object.getOwnPropertyDescriptor(component, "$$typeof");
  return Boolean(reactType && "value" in reactType && (
    reactType.value === Symbol.for("react.memo") || reactType.value === Symbol.for("react.forward_ref")
  ));
}

function captureQuickSwitch(input: unknown): Readonly<WebspringQuickSwitchOptions> | undefined {
  if (input === undefined) return undefined;
  assertPlainRecord(input, "Webspring quickSwitch");
  assertKnownFields(input, "Webspring quickSwitch", ["overflow"]);
  const overflow = readOwnDataProperty(input, "overflow", false, "Webspring quickSwitch");
  if (overflow !== undefined && overflow !== "shrink" && overflow !== "scroll") {
    throw new TypeError("Webspring quickSwitch.overflow must be shrink or scroll.");
  }
  return Object.freeze(overflow === undefined ? {} : { overflow });
}

function captureFolderShape(input: unknown): WebspringFolderAppearance["shape"] {
  const label = "Webspring folderAppearance.shape";
  if (input === undefined) return defaultWebspringFolderAppearance.shape;
  assertPlainRecord(input, label);
  const kind = readOwnDataProperty(input, "kind", false, label);
  if (kind === "circle") {
    assertKnownFields(input, label, ["kind"]);
    return Object.freeze({ kind });
  }
  if (kind !== "roundedRect") throw new TypeError(`${label}.kind must be roundedRect or circle.`);
  assertKnownFields(input, label, ["kind", "smoothSurface"]);
  const surfaceInput = readOwnDataProperty(input, "smoothSurface", false, label);
  const defaults = defaultWebspringFolderSmoothSurface;
  if (surfaceInput === undefined) return Object.freeze({ kind, smoothSurface: defaults });
  const surfaceLabel = `${label}.smoothSurface`;
  assertPlainRecord(surfaceInput, surfaceLabel);
  assertKnownFields(surfaceInput, surfaceLabel, ["radius", "curve", "smoothing"]);
  const readOrDefault = (key: keyof typeof defaults): unknown => {
    const value = readOwnDataProperty(surfaceInput, key, false, surfaceLabel);
    return value === undefined ? defaults[key] : value;
  };
  const radius = readOrDefault("radius");
  const percentage = typeof radius === "string" && /^(?:\d+(?:\.\d+)?|\.\d+)%$/u.test(radius)
    ? Number.parseFloat(radius)
    : undefined;
  if (!(percentage !== undefined && percentage <= 50)
    && !(typeof radius === "number" && Number.isFinite(radius) && radius >= 0)
    && !(typeof radius === "string" && Object.hasOwn(nseSmoothSurfaceRadiusTokens, radius))) {
    throw new TypeError(`${surfaceLabel}.radius must be a percentage up to 50%, a non-negative number of pixels or an NSE radius token.`);
  }
  const curve = readOrDefault("curve");
  if (typeof curve !== "string" || !Object.hasOwn(smoothSurfaceCurves, curve)) {
    throw new TypeError(`${surfaceLabel}.curve must be arc, squircle, superellipse or clothoid.`);
  }
  const smoothing = readOrDefault("smoothing");
  if (typeof smoothing !== "number" || !Number.isFinite(smoothing) || smoothing < 0 || smoothing > 1) {
    throw new TypeError(`${surfaceLabel}.smoothing must be a number from 0 to 1.`);
  }
  return Object.freeze({
    kind,
    smoothSurface: Object.freeze({ radius, curve, smoothing } as typeof defaults),
  });
}

function captureFolderFill(input: unknown): WebspringFolderAppearance["fill"] {
  const label = "Webspring folderAppearance.fill";
  if (input === undefined || input === "inset") return "inset";
  if (typeof input !== "object" || input === null) throw new TypeError(`${label} must be inset or a texture.`);
  assertPlainRecord(input, label);
  if (readOwnDataProperty(input, "kind", false, label) !== "texture") {
    throw new TypeError(`${label} must be inset or a texture.`);
  }
  assertKnownFields(input, label, ["kind", "image", "size", "colour"]);
  const text = (key: string, fallback?: string): string => {
    const value = readOwnDataProperty(input, key, false, label);
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label}.${key} must be a nonempty string.`);
    return value;
  };
  return Object.freeze({
    kind: "texture" as const,
    image: text("image"),
    size: text("size", "cover"),
    colour: text("colour", "transparent"),
  });
}

function captureFolderAppearance(input: unknown): WebspringFolderAppearance {
  if (input === undefined) return defaultWebspringFolderAppearance;
  assertPlainRecord(input, "Webspring folderAppearance");
  assertKnownFields(input, "Webspring folderAppearance", ["shape", "fill"]);
  return Object.freeze({
    shape: captureFolderShape(readOwnDataProperty(input, "shape", false, "Webspring folderAppearance")),
    fill: captureFolderFill(readOwnDataProperty(input, "fill", false, "Webspring folderAppearance")),
  });
}

interface DescriptorWithClass<TClass> {
  readonly id: string;
  readonly order: number;
  readonly targetClass: TClass;
}

function captureMergedDescriptors<TDescriptor, TClass>(options: {
  readonly explicitInput: unknown;
  readonly discoveredInput: unknown;
  readonly isDescriptor: (value: unknown) => value is TDescriptor;
  readonly capture: (value: unknown) => TDescriptor;
  readonly meta: (descriptor: TDescriptor) => DescriptorWithClass<TClass>;
  readonly label: string;
}): readonly TDescriptor[] {
  const toList = (raw: unknown, sourceLabel: string): TDescriptor[] => {
    if (raw === undefined) return [];
    if (!Array.isArray(raw)) throw new TypeError(`${sourceLabel} must be an array.`);
    return raw.map((candidate) => (options.isDescriptor(candidate) ? candidate : options.capture(candidate)));
  };

  const explicit = toList(options.explicitInput, options.label);
  const ids = new Set<string>();
  const explicitClasses = new Set<TClass>();
  const result: TDescriptor[] = [];
  for (const descriptor of explicit) {
    const { id, targetClass } = options.meta(descriptor);
    if (ids.has(id)) throw new TypeError(`${options.label} contain duplicate ID ${id}.`);
    ids.add(id);
    explicitClasses.add(targetClass);
    result.push(descriptor);
  }

  const discovered = toList(options.discoveredInput, `Discovered ${options.label}`)
    .filter((descriptor) => !explicitClasses.has(options.meta(descriptor).targetClass))
    .sort((left, right) => {
      const a = options.meta(left);
      const b = options.meta(right);
      return a.order - b.order || a.id.localeCompare(b.id);
    });

  for (const descriptor of discovered) {
    const { id } = options.meta(descriptor);
    if (ids.has(id)) throw new TypeError(`${options.label} contain duplicate ID ${id}.`);
    ids.add(id);
    result.push(descriptor);
  }
  return Object.freeze(result);
}

function captureHiddenPreferencePanes(raw: unknown): readonly string[] {
  if (raw === undefined) return Object.freeze([]);
  if (!Array.isArray(raw)) throw new TypeError("Webspring hiddenPreferencePanes must be an array.");
  const hide: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !id.trim()) {
      throw new TypeError("Webspring hiddenPreferencePanes must list pane ids as nonempty strings.");
    }
    hide.push(id.trim());
  }
  return Object.freeze(hide);
}

function captureLauncherMetadata(Launcher: unknown, slot: Presentation): {
  readonly LauncherClass: WSLauncherViewControllerClass;
  readonly mode: ShellMode;
  readonly returnTracks: readonly ("material" | "icons")[];
  readonly launchZoom: Readonly<Required<WebspringLaunchZoom>>;
} {
  if (typeof Launcher !== "function" || !(Launcher === WSLauncherViewController || Launcher.prototype instanceof WSLauncherViewController)) {
    throw new TypeError(`Webspring ${slot} launcher must be a WSLauncherViewController class.`);
  }
  const label = `Webspring ${slot} launcher ${Launcher.name || slot}`;

  const rawPresentations = readStaticData(Launcher, "presentations", label);
  const presentations = rawPresentations === undefined ? presentationSlots : rawPresentations;
  if (!Array.isArray(presentations) || presentations.length === 0
    || presentations.some((p) => !presentationSlots.includes(p as Presentation))
    || new Set(presentations).size !== presentations.length) {
    throw new TypeError(`${label} presentations must be a nonempty list of distinct desktop, tablet or mobile values.`);
  }
  if (!presentations.includes(slot)) {
    throw new TypeError(`${label} does not support ${slot}.`);
  }

  const rawMode = readStaticData(Launcher, "mode", label);
  const mode = rawMode === undefined ? "launcher" : rawMode;
  if (mode !== "launcher" && mode !== "persistent") {
    throw new TypeError(`${label} mode must be "launcher" or "persistent".`);
  }

  const rawTracks = readStaticData(Launcher, "returnTracks", label);
  const tracks = rawTracks === undefined ? defaultWSReturnTracks : [...(Array.isArray(rawTracks) ? rawTracks : [])];
  if (!Array.isArray(rawTracks === undefined ? defaultWSReturnTracks : rawTracks)
    || tracks.length === 0
    || tracks.some((track) => track !== "material" && track !== "icons")
    || new Set(tracks).size !== tracks.length) {
    throw new TypeError(`${label} returnTracks must be a nonempty list of distinct material or icons tracks.`);
  }

  const rawZoom = readStaticData(Launcher, "launchZoom", label);
  let zoomObj: Record<string, unknown> = {};
  if (rawZoom !== undefined) {
    assertPlainRecord(rawZoom, `${label} launchZoom`);
    assertKnownFields(rawZoom, `${label} launchZoom`, ["delay", "duration", "easing"]);
    zoomObj = rawZoom;
  }
  const seconds = (key: "delay" | "duration", fallback: number): number => {
    const rawValue = Object.hasOwn(zoomObj, key) ? readOwnDataProperty(zoomObj, key, false, `${label} launchZoom`) : undefined;
    const value = rawValue === undefined ? fallback : rawValue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 5) {
      throw new TypeError(`${label} launchZoom.${key} must be a number of seconds from 0 to 5.`);
    }
    return value;
  };
  const rawEasing = Object.hasOwn(zoomObj, "easing")
    ? readOwnDataProperty(zoomObj, "easing", false, `${label} launchZoom`)
    : undefined;
  const easing = rawEasing === undefined ? defaultWSLaunchZoom.easing : rawEasing;
  if (typeof easing !== "string" || !launchZoomEasings.has(easing)) {
    throw new TypeError(`${label} launchZoom.easing must be standard, emphasized, decelerate or accelerate.`);
  }

  return {
    LauncherClass: Launcher as WSLauncherViewControllerClass,
    mode,
    returnTracks: Object.freeze([...tracks]) as readonly ("material" | "icons")[],
    launchZoom: Object.freeze({
      delay: seconds("delay", defaultWSLaunchZoom.delay),
      duration: seconds("duration", defaultWSLaunchZoom.duration),
      easing: easing as Required<WebspringLaunchZoom>["easing"],
    }),
  };
}

/** Validates `info`, a `WSApplication` subclass and discovered items into a frozen `WSDefinition`. */
export function createWebspring(input: WSCreateWebspringInput): WSDefinition {
  assertPlainRecord(input, "Webspring input");
  assertKnownFields(input, "Webspring input", ["info", "application", "widgets", "preferencePanes"]);

  const info = captureWSInfo(readOwnDataProperty(input, "info", true, "Webspring input"));
  const rawApplication = readOwnDataProperty(input, "application", false, "Webspring input");
  const ApplicationClass = rawApplication === undefined ? WSApplication : rawApplication;
  if (!isWSApplicationClass(ApplicationClass)) {
    throw new TypeError("Webspring application must be a class extending WSApplication.");
  }

  const appLabel = ApplicationClass.name || "WSApplication";
  const launcherSurface = captureWSSurface(
    readStaticData(ApplicationClass, "launcherSurface", appLabel),
    "Webspring background.launcher",
  );
  const shelfSurface = captureWSSurface(
    readStaticData(ApplicationClass, "shelfSurface", appLabel),
    "Webspring background.shelf",
  );
  const background: WebspringBackground = Object.freeze({ launcher: launcherSurface, shelf: shelfSurface });

  const folderAppearance = captureFolderAppearance(readStaticData(ApplicationClass, "folderAppearance", appLabel));
  const folderPresentationInput = readStaticData(ApplicationClass, "folderPresentation", appLabel);
  if (folderPresentationInput !== undefined && !isReactComponent(folderPresentationInput)) {
    throw new TypeError("Webspring folderPresentation must be a React component.");
  }
  const folderPresentation = (folderPresentationInput ?? defaultWSFolderPresentation) as WebspringFolderPresentationComponent;

  const iconEffectInput = readStaticData(ApplicationClass, "iconEffect", appLabel);
  if (iconEffectInput !== undefined && !isReactComponent(iconEffectInput)) {
    throw new TypeError("Webspring iconEffect must be a React component.");
  }

  const quickSwitch = captureQuickSwitch(readStaticData(ApplicationClass, "quickSwitch", appLabel));

  const widgets = captureMergedDescriptors({
    explicitInput: readStaticData(ApplicationClass, "widgets", appLabel),
    discoveredInput: readOwnDataProperty(input, "widgets", false, "Webspring input"),
    isDescriptor: isWSWidgetDescriptor,
    capture: captureWSWidgetClass,
    meta: (descriptor) => ({ id: descriptor.id, order: descriptor.order, targetClass: descriptor.WidgetClass }),
    label: "Webspring widgets",
  });

  const panes = captureMergedDescriptors({
    explicitInput: readStaticData(ApplicationClass, "preferencePanes", appLabel),
    discoveredInput: readOwnDataProperty(input, "preferencePanes", false, "Webspring input"),
    isDescriptor: isPreferencePaneDescriptor,
    capture: capturePreferencePaneClass,
    meta: (descriptor) => ({ id: descriptor.id, order: descriptor.order, targetClass: descriptor.PaneClass }),
    label: "Webspring preferences",
  });
  const hide = captureHiddenPreferencePanes(readStaticData(ApplicationClass, "hiddenPreferencePanes", appLabel));
  const preferences: WebspringPreferences = Object.freeze({ panes, hide });

  const rawMainLauncher = readStaticData(ApplicationClass, "mainViewController", appLabel);
  const rawViewControllers = readStaticData(ApplicationClass, "viewControllers", appLabel);
  let perPresentation: Partial<Record<Presentation, unknown>> = {};
  if (rawViewControllers !== undefined) {
    assertPlainRecord(rawViewControllers, `${appLabel}.viewControllers`);
    assertKnownFields(rawViewControllers, `${appLabel}.viewControllers`, presentationSlots);
    perPresentation = {
      desktop: readOwnDataProperty(rawViewControllers, "desktop", false, `${appLabel}.viewControllers`),
      tablet: readOwnDataProperty(rawViewControllers, "tablet", false, `${appLabel}.viewControllers`),
      mobile: readOwnDataProperty(rawViewControllers, "mobile", false, `${appLabel}.viewControllers`),
    };
  }

  const viewControllers = {} as Record<Presentation, WSLauncherViewControllerClass>;
  const modes = {} as Record<Presentation, ShellMode>;
  const returnTracks = {} as Record<Presentation, readonly ("material" | "icons")[]>;
  const launchZooms = {} as Record<Presentation, Readonly<Required<WebspringLaunchZoom>>>;
  let hasLauncherMode = false;

  for (const slot of presentationSlots) {
    const candidate = perPresentation[slot] ?? rawMainLauncher ?? defaultWSLauncherViewController;
    const captured = captureLauncherMetadata(candidate, slot);
    viewControllers[slot] = captured.LauncherClass;
    modes[slot] = captured.mode;
    returnTracks[slot] = captured.returnTracks;
    launchZooms[slot] = captured.launchZoom;
    if (captured.mode === "launcher") hasLauncherMode = true;
  }

  if (hasLauncherMode && info.homeRoute !== "/") {
    throw new TypeError(`Launcher Webspring homeRoute ${info.homeRoute} must resolve to the shell.`);
  }

  const definition: WSDefinition = Object.freeze({
    info,
    application: ApplicationClass,
    viewControllers: Object.freeze(viewControllers),
    modes: Object.freeze(modes),
    returnTracks: Object.freeze(returnTracks),
    launchZooms: Object.freeze(launchZooms),
    background,
    folderAppearance,
    folderPresentation,
    ...(iconEffectInput === undefined ? {} : { iconEffect: iconEffectInput as WebspringIconEffectComponent }),
    ...(quickSwitch === undefined ? {} : { quickSwitch }),
    widgets,
    preferences,
  });
  capturedDefinitions.add(definition);
  return definition;
}

/** Adds the project's discovered widgets and preference panes to a definition; explicit ones keep their place. */
export function withDiscoveredWebspringItems(
  definition: WSDefinition,
  items: Readonly<{
    preferences: readonly (PreferencePaneDescriptor | NSEPreferencePaneClass)[];
    widgets: readonly (WSWidgetClass | WSWidgetDescriptor)[];
  }>,
): WSDefinition {
  if (!isWSDefinition(definition)) throw new TypeError("A Webspring definition must be created with createWebspring.");
  if (typeof items !== "object" || items === null || !Array.isArray(items.preferences) || !Array.isArray(items.widgets)) {
    throw new TypeError("Discovered Webspring items must list preference panes and widgets.");
  }
  const widgets = captureMergedDescriptors({
    explicitInput: definition.widgets,
    discoveredInput: items.widgets,
    isDescriptor: isWSWidgetDescriptor,
    capture: captureWSWidgetClass,
    meta: (descriptor) => ({ id: descriptor.id, order: descriptor.order, targetClass: descriptor.WidgetClass }),
    label: "Webspring widgets",
  });
  const panes = captureMergedDescriptors({
    explicitInput: definition.preferences.panes,
    discoveredInput: items.preferences,
    isDescriptor: isPreferencePaneDescriptor,
    capture: capturePreferencePaneClass,
    meta: (descriptor) => ({ id: descriptor.id, order: descriptor.order, targetClass: descriptor.PaneClass }),
    label: "Webspring preferences",
  });
  const merged: WSDefinition = Object.freeze({
    ...definition,
    widgets,
    preferences: Object.freeze({ panes, hide: definition.preferences.hide }),
  });
  capturedDefinitions.add(merged);
  return merged;
}

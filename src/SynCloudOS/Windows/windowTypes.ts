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

import type { DocumentLocation, DocumentWindowAssociation } from "../Documents";
import type { SynCloudOSRuntimeId } from "../Runtime/runtimeInstanceTypes";
import type { RuntimeDisposalPrepareContext, RuntimeDisposalPreparation } from "../Runtime/disposalTypes";
import type {
  SynCloudOSAppFrameSmoothSurfaceManifest,
  SynCloudOSAppFrameSmoothSurfacePhysicality,
} from "../AppRegistry/appRegistryTypes";

/** Window chrome anatomy: who paints the titlebar and window controls.
 * `system` renders the NSE system titlebar; `custom` mounts the owning
 * application's `windowChrome` component; `frameless` paints no chrome. */
export type WindowChromeMode = "system" | "custom" | "frameless";

export const chromeModes: ReadonlySet<WindowChromeMode> = new Set(["system", "custom", "frameless"]);

/** Canonical role/chrome compatibility. Borderless windows are genuinely
 * frameless; system-owned specialised roles always use system chrome; only
 * standard document windows may opt into app chrome or no chrome. */
export function canonicalWindowChromeMode(role: WindowRole, supplied?: WindowChromeMode): WindowChromeMode {
  const resolved = supplied ?? (role === "borderless" ? "frameless" : "system");
  if (role === "standard") return resolved;
  if (role === "borderless") {
    if (resolved !== "frameless") throw new InvalidWindowRecordError("Borderless windows require frameless chrome.");
    return resolved;
  }
  if (resolved !== "system") throw new InvalidWindowRecordError(`${role} windows require system chrome.`);
  return resolved;
}

type WindowSmoothSurfaceObject = Exclude<SynCloudOSAppFrameSmoothSurfaceManifest, "off" | false | number>;

/** Default SmoothSurface corner treatment for floating-window surfaces.
 * Tuning constant: adjudicate against system-chrome nine-slice corners and
 * app-owned paper fills before changing. */
export const defaultWindowSmoothSurface: WindowSmoothSurfaceObject = Object.freeze({
  radius: 10,
  curve: "squircle",
  smoothing: 0.6,
  overflow: "hidden",
  physicality: "off",
});

/** Normalises a window smoothSurface manifest value. With a `note` sink
 * (manifest normalisation) invalid values fall back per-field; without one
 * (record assertion / restoration validation) the first invalid value throws. */
export function normaliseWindowSmoothSurface(
  value: unknown,
  note?: (field: string, supplied: unknown, resolved: unknown, reason: string) => void,
): SynCloudOSAppFrameSmoothSurfaceManifest | null {
  const reject = (field: string, supplied: unknown, resolved: unknown, reason: string) => {
    if (note) note(field, supplied, resolved, reason);
    else throw new InvalidWindowRecordError(`Window smoothSurface ${field} is invalid: ${reason}.`);
  };
  if (value === undefined) return defaultWindowSmoothSurface;
  if (value === null || value === "off" || value === false) return value === false ? "off" : value;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      reject("radius", value, defaultWindowSmoothSurface, "radius must be a finite non-negative number");
      return defaultWindowSmoothSurface;
    }
    return value;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    reject("value", value, defaultWindowSmoothSurface, "smoothSurface must be off, a radius number, or a configuration object");
    return defaultWindowSmoothSurface;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    reject("value", value, defaultWindowSmoothSurface, "smoothSurface must be a plain data object");
    return defaultWindowSmoothSurface;
  }
  const allowedKeys = new Set([
    "radius", "curve", "smoothing", "exponent", "preserveSmoothing",
    "topLeft", "topRight", "bottomRight", "bottomLeft", "overflow", "physicality",
  ]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !allowedKeys.has(key)) {
      reject(String(key), undefined, undefined, "unknown smoothSurface field");
      continue;
    }
    const descriptor = descriptors[key]!;
    if (!("value" in descriptor) || !descriptor.enumerable) {
      reject(key, undefined, undefined, "smoothSurface fields must be enumerable data properties");
    }
  }
  const input = Object.fromEntries(Object.entries(descriptors)
    .filter(([key, descriptor]) => allowedKeys.has(key) && "value" in descriptor && descriptor.enumerable)
    .map(([key, descriptor]) => [key, (descriptor as PropertyDescriptor & { value: unknown }).value])) as Record<string, unknown>;
  const output: Exclude<SynCloudOSAppFrameSmoothSurfaceManifest, "off" | false | number> = {};
  if (input.radius !== undefined) {
    if (typeof input.radius === "number" && Number.isFinite(input.radius) && input.radius >= 0) output.radius = input.radius;
    else reject("radius", input.radius, defaultWindowSmoothSurface.radius, "radius must be a finite non-negative number");
  }
  if (input.curve !== undefined) {
    if (input.curve === "arc" || input.curve === "squircle" || input.curve === "superellipse" || input.curve === "clothoid") output.curve = input.curve;
    else reject("curve", input.curve, defaultWindowSmoothSurface.curve, "curve must be arc, squircle, superellipse, or clothoid");
  }
  if (input.smoothing !== undefined) {
    if (typeof input.smoothing === "number" && Number.isFinite(input.smoothing) && input.smoothing >= 0 && input.smoothing <= 1) {
      output.smoothing = input.smoothing;
    } else {
      reject("smoothing", input.smoothing, defaultWindowSmoothSurface.smoothing, "smoothing must be a finite number from 0 through 1");
      if (note && typeof input.smoothing === "number" && Number.isFinite(input.smoothing)) {
        output.smoothing = Math.min(1, Math.max(0, input.smoothing));
      }
    }
  }
  if (input.exponent !== undefined) {
    if (typeof input.exponent === "number" && Number.isFinite(input.exponent) && input.exponent > 0) output.exponent = input.exponent;
    else reject("exponent", input.exponent, undefined, "exponent must be a finite positive number");
  }
  if (input.preserveSmoothing !== undefined) {
    if (typeof input.preserveSmoothing === "boolean") output.preserveSmoothing = input.preserveSmoothing;
    else reject("preserveSmoothing", input.preserveSmoothing, undefined, "preserveSmoothing must be a boolean");
  }
  (["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).forEach((corner) => {
    if (input[corner] === undefined) return;
    if (typeof input[corner] === "number" && Number.isFinite(input[corner]) && input[corner] >= 0) output[corner] = input[corner];
    else reject(corner, input[corner], undefined, "corner radius must be a finite non-negative number");
  });
  if (input.overflow !== undefined) {
    if (input.overflow === "hidden" || input.overflow === "clip" || input.overflow === "visible") output.overflow = input.overflow;
    else reject("overflow", input.overflow, defaultWindowSmoothSurface.overflow, "overflow must be hidden, clip, or visible");
  }
  if (input.physicality !== undefined) {
    const physicality: unknown = input.physicality;
    const canonicalStop = (stop: unknown): { offsetX?: number; offsetY: number; blur?: number; spread?: number; color: string; opacity: number } | null => {
      if (!stop || typeof stop !== "object" || Array.isArray(stop)) return null;
      if (Object.getPrototypeOf(stop) !== Object.prototype && Object.getPrototypeOf(stop) !== null) return null;
      const allowed = new Set(["offsetX", "offsetY", "blur", "spread", "color", "opacity"]);
      const stopDescriptors = Object.getOwnPropertyDescriptors(stop);
      if (Reflect.ownKeys(stop).some((key) => typeof key !== "string" || !allowed.has(key) || !("value" in stopDescriptors[key as string]!) || !stopDescriptors[key as string]!.enumerable)) return null;
      const read = (key: string): unknown => (stopDescriptors[key] as PropertyDescriptor & { value?: unknown } | undefined)?.value;
      const offsetY = read("offsetY");
      const color = read("color");
      const opacity = read("opacity");
      if (typeof offsetY !== "number" || !Number.isFinite(offsetY) || typeof color !== "string" || !color ||
          typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) return null;
      const result: { offsetX?: number; offsetY: number; blur?: number; spread?: number; color: string; opacity: number } = { offsetY, color, opacity };
      for (const key of ["offsetX", "blur", "spread"] as const) {
        const candidate = read(key);
        if (candidate === undefined) continue;
        if (typeof candidate !== "number" || !Number.isFinite(candidate)) return null;
        result[key] = candidate;
      }
      return result;
    };
    if (physicality === "default" || physicality === "off") output.physicality = physicality;
    else if (typeof physicality === "object" && physicality !== null && !Array.isArray(physicality) &&
      (Object.getPrototypeOf(physicality) === Object.prototype || Object.getPrototypeOf(physicality) === null)) {
      const pairDescriptors = Object.getOwnPropertyDescriptors(physicality);
      const pairKeys = Reflect.ownKeys(physicality);
      const shapeValid = pairKeys.every((key) => typeof key === "string" && (key === "top" || key === "bottom") &&
        "value" in pairDescriptors[key]! && pairDescriptors[key]!.enumerable);
      const top = "top" in pairDescriptors ? canonicalStop((pairDescriptors.top as PropertyDescriptor & { value: unknown }).value) : undefined;
      const bottom = "bottom" in pairDescriptors ? canonicalStop((pairDescriptors.bottom as PropertyDescriptor & { value: unknown }).value) : undefined;
      if (shapeValid && top !== null && bottom !== null) output.physicality = { ...(top ? { top } : {}), ...(bottom ? { bottom } : {}) };
      else reject("physicality", physicality, defaultWindowSmoothSurface.physicality, "physicality must use only finite canonical top and bottom stops");
    } else reject("physicality", physicality, defaultWindowSmoothSurface.physicality, "physicality must be default, off, or a valid stop pair");
  }
  return output;
}

export type WindowRole =
  | "standard"
  | "panel"
  | "hud"
  | "modal"
  | "sheet"
  | "popover"
  | "borderless";

export type WindowStyle = "titled" | "closable" | "minimisable" | "resizable" | "zoomable";

export interface WindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type WindowBoundsChangeReason =
  | "programmatic"
  /** The window follows its own content's fitting size (NSPopover.contentSize,
   * NSWindow setContentSize:). Allowed on windows the user cannot resize. */
  | "content-size"
  | "pointer-move"
  | "pointer-resize"
  | "keyboard-move"
  | "keyboard-resize"
  | "restore"
  | "zoom";

export type WindowScheduledBoundsChange =
  | {
      readonly kind: "replace";
      readonly bounds: WindowBounds;
      readonly reason: "pointer-move" | "pointer-resize";
    }
  | {
      readonly kind: "delta";
      readonly delta: WindowBounds;
      readonly reason: "keyboard-move" | "keyboard-resize";
    };

export interface WindowGeometryState {
  readonly normalBounds: WindowBounds;
  readonly zoomed: boolean;
  readonly minimisedFrom: "open" | "zoomed" | null;
}

export interface WindowAnchor {
  readonly id: string;
  readonly rect: WindowBounds;
  readonly edge: "block-start" | "inline-end" | "block-end" | "inline-start";
  readonly alignment: "start" | "center" | "end";
  readonly offset: number;
}

export type WindowSerializableValue =
  | null
  | boolean
  | number
  | string
  | readonly WindowSerializableValue[]
  | { readonly [key: string]: WindowSerializableValue };

export interface WindowContentDescriptor {
  readonly rendererId: string;
  readonly parameters: WindowSerializableValue | null;
}

export interface WindowRepresentedDocument {
  readonly documentId: string;
  readonly displayName: string;
  readonly associationRole: DocumentWindowAssociation["role"];
  readonly location: DocumentLocation | null;
  readonly edited: boolean;
}

export interface WindowToolbarState {
  readonly identifier: string;
  readonly visible: boolean;
  readonly displayMode: "icon-and-label" | "icon-only" | "label-only";
  readonly sizeMode: "regular" | "small";
  readonly selectedItemIdentifier: string | null;
}

export interface WindowRecord {
  readonly id: string;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly workspaceId: string;
  readonly applicationId: string | null;
  readonly applicationSessionId: string | null;
  readonly documentId: string | null;
  readonly documentAssociationRole: DocumentWindowAssociation["role"] | null;
  readonly representedDocument: WindowRepresentedDocument | null;
  readonly toolbar: WindowToolbarState | null;
  readonly role: WindowRole;
  readonly style: readonly WindowStyle[];
  readonly title: string;
  readonly content: WindowContentDescriptor;
  readonly bounds: WindowBounds;
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly maximumSize: { readonly width: number; readonly height: number } | null;
  readonly level: "normal" | "floating" | "modal" | "status";
  readonly parentWindowControllerId: string | null;
  readonly anchor: WindowAnchor | null;
  readonly pinned: boolean;
  readonly state: "closed" | "opening" | "open" | "minimised" | "closing";
  readonly isKey: boolean;
  readonly isMain: boolean;
  readonly zIndex: number;
  readonly mobilePolicy: "fullscreen" | "sheet" | "popover-to-sheet" | "hidden";
  readonly restorationKey: string | null;
  readonly chromeMode: WindowChromeMode;
  readonly smoothSurface: SynCloudOSAppFrameSmoothSurfaceManifest | null;
}

export type CreateWindowRequest = Omit<
  WindowRecord,
  "id" | "runtimeId" | "state" | "isKey" | "isMain" | "zIndex" | "chromeMode" | "smoothSurface"
> & {
  readonly id?: string;
  /** Optional at request time; `WindowManager.create` fills `"system"`. */
  readonly chromeMode?: WindowChromeMode;
  /** Optional at request time; `create` fills `defaultWindowSmoothSurface`. Explicit `null`/`"off"` disables the surface. */
  readonly smoothSurface?: SynCloudOSAppFrameSmoothSurfaceManifest | null;
};

/** The single production record-construction seam used by WindowManager and
 * developer specimens that need to demonstrate its effective semantics. */
export function createCanonicalWindowRecord(
  request: CreateWindowRequest,
  runtimeId: SynCloudOSRuntimeId,
  id: string,
): WindowRecord {
  return freezeWindowRecord({
    ...request,
    id,
    runtimeId,
    state: "closed",
    isKey: false,
    isMain: false,
    zIndex: 0,
    chromeMode: canonicalWindowChromeMode(request.role, request.chromeMode),
    smoothSurface: normaliseWindowSmoothSurface(request.smoothSurface),
  });
}

export interface WindowCloseRequest {
  readonly reason: "control" | "command" | "parent-close" | "application-quit" | "runtime-dispose";
  readonly signal?: AbortSignal;
}

export type WindowCloseResult =
  | { readonly outcome: "closed"; readonly windowControllerId: string; readonly data?: unknown }
  | { readonly outcome: "cancelled"; readonly windowControllerId: string }
  | {
      readonly outcome: "refused";
      readonly windowControllerId: string;
      readonly reason: "not-closable" | "blocked" | "delegate-refused";
    };

export type WindowContentClosePreparation =
  | { readonly status: "cancelled" }
  | { readonly status: "refused"; readonly reason: "blocked" | "delegate-refused" }
  | {
      readonly status: "ready";
      readonly token: unknown;
      readonly commit: () => void;
      readonly rollback: () => void;
    };

export interface WindowContentController {
  readonly mountKey: string;
  readonly responderId: string;
  load(request: { readonly windowControllerId: string; readonly signal: AbortSignal }): Promise<void>;
  prepareClose(request: WindowCloseRequest): Promise<WindowContentClosePreparation>;
  unload(reason: "close-commit" | "load-rollback" | "runtime-dispose"): void;
  dispose(): void;
}

export interface WindowContentFactoryRegistration {
  readonly typeId: string;
  create(request: {
    readonly descriptor: WindowContentDescriptor;
    readonly windowControllerId: string;
  }): WindowContentController;
  restore?(request: {
    readonly descriptor: WindowContentDescriptor;
    readonly state: WindowSerializableValue | null;
    readonly signal: AbortSignal;
  }): Promise<{
    readonly descriptor: WindowContentDescriptor;
    readonly state: WindowSerializableValue | null;
  }>;
}

export interface WindowContentRegistration { dispose(): void }

export type WindowContentState =
  | { readonly status: "unloaded" }
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly mountKey: string; readonly rootResponderId: string }
  | { readonly status: "disposing" }
  | { readonly status: "disposed" };

export interface WindowControllerDelegate {
  shouldClose?(request: WindowCloseRequest): boolean | Promise<boolean>;
  didOpen?(record: WindowRecord): void;
  didClose?(record: WindowRecord): void;
}

export interface WindowIdPort {
  next(
    kind:
      | "window"
      | "window-close-preparation"
      | "application-close-preparation"
      | "document-presentation-close-preparation"
      | "installation",
  ): string;
}

export interface WindowClosePreparedNode {
  readonly windowControllerId: string;
  readonly children: readonly WindowClosePreparedNode[];
  readonly controllerPreparation: Extract<WindowControllerClosePreparation, { readonly status: "ready" }>;
}

declare const windowClosePreparationTokenBrand: unique symbol;
export interface WindowClosePreparationToken {
  readonly [windowClosePreparationTokenBrand]: true;
  readonly tokenId: string;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly reason: WindowCloseRequest["reason"];
  readonly roots: readonly WindowClosePreparedNode[];
  /** Deterministic post-order: topmost descendants first, roots last. */
  readonly preparedWindowControllerIds: readonly string[];
}

export type WindowClosePreparation =
  | {
      readonly status: "cancelled";
      readonly windowControllerId: string;
      readonly reason: "delegate-cancelled" | "aborted";
    }
  | {
      readonly status: "refused";
      readonly windowControllerId: string;
      readonly reason: "not-closable" | "blocked" | "delegate-refused";
    }
  | { readonly status: "ready"; readonly token: WindowClosePreparationToken };

declare const applicationClosePreparationTokenBrand: unique symbol;
export interface ApplicationClosePreparationToken {
  readonly [applicationClosePreparationTokenBrand]: true;
  readonly tokenId: string;
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly applicationId: string;
  readonly resultWindowControllerId: string;
}

export type ApplicationClosePreparation =
  | { readonly status: "cancelled"; readonly windowControllerId: string }
  | { readonly status: "refused"; readonly windowControllerId: string; readonly reason: "not-closable" | "blocked" | "delegate-refused" }
  | { readonly status: "ready"; readonly token: ApplicationClosePreparationToken };

export type WindowOrderPlacement = "front" | "back";
export interface OpenWindowOptions {
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
}
export interface WindowListQuery {
  readonly workspaceId?: string;
  readonly applicationId?: string;
  readonly applicationSessionId?: string;
  readonly documentId?: string;
  readonly role?: WindowRole;
  readonly parentWindowControllerId?: string;
}

export interface WindowManagerSnapshot {
  readonly runtimeId: SynCloudOSRuntimeId;
  readonly generation: number;
  readonly windowControllerIds: readonly string[];
  readonly keyWindowControllerId: string | null;
  readonly mainWindowControllerId: string | null;
  readonly blockedWindowControllerIds: readonly string[];
  readonly dirtyWindowControllerIds: readonly string[];
  readonly blockedApplicationIds: readonly string[];
  /** A parentless system-modal presentation blocks every application stage,
   * even when no application-owned window is currently mounted. */
  readonly applicationStageBlocked: boolean;
}

export interface WindowManagerDiagnostics {
  readonly controllerCount: number;
  readonly openControllerCount: number;
  readonly fullRegistryScans: number;
  readonly queryCandidateVisits: number;
  readonly orderedCandidateVisits: number;
  readonly orderPublications: number;
  readonly listenerCount: number;
  readonly listenerDelta: number;
}

export interface DismissTransientWindowsRequest {
  readonly reason: "outside-pointer" | "escape" | "anchor-removed" | "parent-close";
  readonly except?: string;
}

export interface WindowManagerRuntimeDisposal {
  prepareRuntimeDisposal(context: RuntimeDisposalPrepareContext): Promise<RuntimeDisposalPreparation>;
}

export type WindowControllerClosePreparation =
  | { readonly status: "cancelled"; readonly windowControllerId: string }
  | {
      readonly status: "refused";
      readonly windowControllerId: string;
      readonly reason: "blocked" | "delegate-refused";
    }
  | {
      readonly status: "ready";
      readonly windowControllerId: string;
      readonly content: Extract<WindowContentClosePreparation, { readonly status: "ready" }>;
      readonly commit: () => void;
      readonly rollback: () => void;
    };

export class InvalidWindowRecordError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWindowRecordError";
  }
}

const windowValueLimits = Object.freeze({ maxDepth: 64, maxNodes: 100_000, maxBytes: 4 * 1024 * 1024 });
const canonicalWindowRecords = new WeakSet<object>();
const canonicalWindowValues = new WeakSet<object>();

export function canonicalWindowSerializableValue<T extends WindowSerializableValue>(
  value: T,
  field = "Window value",
): T {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): WindowSerializableValue => {
    nodes += 1;
    if (nodes > windowValueLimits.maxNodes) {
      throw new InvalidWindowRecordError(`${field} exceeds the ${windowValueLimits.maxNodes} node limit.`);
    }
    if (depth > windowValueLimits.maxDepth) {
      throw new InvalidWindowRecordError(`${field} exceeds the ${windowValueLimits.maxDepth} level depth limit.`);
    }
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return candidate;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new InvalidWindowRecordError(`${field} numbers must be finite.`);
      if (Object.is(candidate, -0)) throw new InvalidWindowRecordError(`${field} numbers must not use negative zero.`);
      return candidate;
    }
    if (typeof candidate !== "object") {
      throw new InvalidWindowRecordError(`${field} must contain only JSON data.`);
    }
    if (seen.has(candidate)) throw new InvalidWindowRecordError(`${field} must be acyclic.`);
    seen.add(candidate);
    const reuseCanonical = canonicalWindowValues.has(candidate);
    let result: WindowSerializableValue;
    if (Array.isArray(candidate)) {
      if (candidate.length > windowValueLimits.maxNodes) {
        throw new InvalidWindowRecordError(`${field} array exceeds the element limit.`);
      }
      const entries: WindowSerializableValue[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor) throw new InvalidWindowRecordError(`${field} arrays must not be sparse.`);
        if (!("value" in descriptor) || !descriptor.enumerable) {
          throw new InvalidWindowRecordError(`${field} arrays must use enumerable data descriptors.`);
        }
        entries.push(visit(descriptor.value, depth + 1));
      }
      for (const key of Reflect.ownKeys(candidate)) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= candidate.length) {
          throw new InvalidWindowRecordError(`${field} arrays must contain only indexed JSON elements.`);
        }
      }
      result = reuseCanonical ? candidate : entries;
    } else {
      const prototype = Object.getPrototypeOf(candidate);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidWindowRecordError(`${field} must use plain JSON objects.`);
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Reflect.ownKeys(candidate);
      if (keys.some((key) => typeof key !== "string")) {
        throw new InvalidWindowRecordError(`${field} must not contain symbol properties.`);
      }
      const entries = (keys as string[]).map((key) => {
        const descriptor = descriptors[key]!;
        if (!("value" in descriptor) || !descriptor.enumerable) {
          throw new InvalidWindowRecordError(`${field} must use enumerable data descriptors, not accessors.`);
        }
        return [key, descriptor.value] as const;
      });
      const object: Record<string, WindowSerializableValue> = Object.create(null) as Record<string, WindowSerializableValue>;
      for (const [key, entry] of entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
        Object.defineProperty(object, key, {
          configurable: false,
          enumerable: true,
          writable: false,
          value: visit(entry, depth + 1),
        });
      }
      result = reuseCanonical ? candidate as WindowSerializableValue : object;
    }
    seen.delete(candidate);
    return result;
  };
  const canonical = visit(value, 0);
  const json = JSON.stringify(canonical);
  if (new TextEncoder().encode(json).byteLength > windowValueLimits.maxBytes) {
    throw new InvalidWindowRecordError(`${field} exceeds the ${windowValueLimits.maxBytes} byte limit.`);
  }
  const freeze = (candidate: WindowSerializableValue): WindowSerializableValue => {
    if (candidate && typeof candidate === "object" && !Object.isFrozen(candidate)) {
      if (Array.isArray(candidate)) for (const child of candidate) freeze(child);
      else {
        const object = candidate as { readonly [key: string]: WindowSerializableValue };
        for (const key of Object.keys(object)) freeze(object[key]!);
      }
      Object.freeze(candidate);
    }
    if (candidate && typeof candidate === "object") canonicalWindowValues.add(candidate);
    return candidate;
  };
  return freeze(canonical) as T;
}

export function isWindowSerializableValue(value: unknown): value is WindowSerializableValue {
  try {
    canonicalWindowSerializableValue(value as WindowSerializableValue);
    return true;
  } catch {
    return false;
  }
}

function requireFinite(value: number, field: string, positive = false): void {
  if (!Number.isFinite(value) || (positive && value <= 0)) {
    throw new InvalidWindowRecordError(`${field} must be a ${positive ? "positive " : ""}finite CSS-pixel value.`);
  }
}

export function assertFiniteWindowBounds(bounds: WindowBounds, field = "bounds", positiveSize = true): void {
  for (const [name, value] of Object.entries(bounds)) {
    requireFinite(value, `${field}.${name}`, positiveSize && (name === "width" || name === "height"));
  }
}

function assertCanonicalWindowRecord(record: WindowRecord): void {
  if (!record.id.trim() || !record.workspaceId.trim()) throw new InvalidWindowRecordError("Window and workspace IDs must not be empty.");
  if (record.applicationId === null !== (record.applicationSessionId === null)) {
    throw new InvalidWindowRecordError("Application windows require both application and session identity; system windows require neither.");
  }
  if (record.documentId === null !== (record.documentAssociationRole === null)) {
    throw new InvalidWindowRecordError("Document windows require both document identity and association role.");
  }
  if (record.representedDocument && (
    record.representedDocument.documentId !== record.documentId ||
    record.representedDocument.associationRole !== record.documentAssociationRole
  )) throw new InvalidWindowRecordError("Represented document identity must match the window association.");
  if (new Set(record.style).size !== record.style.length) throw new InvalidWindowRecordError("Window styles must not contain duplicates.");
  assertFiniteWindowBounds(record.bounds);
  requireFinite(record.minimumSize.width, "minimumSize.width", true);
  requireFinite(record.minimumSize.height, "minimumSize.height", true);
  if (record.maximumSize) {
    requireFinite(record.maximumSize.width, "maximumSize.width", true);
    requireFinite(record.maximumSize.height, "maximumSize.height", true);
    if (record.maximumSize.width < record.minimumSize.width || record.maximumSize.height < record.minimumSize.height) {
      throw new InvalidWindowRecordError("Maximum size cannot be smaller than minimum size.");
    }
  }
  if (!record.content.rendererId.trim() || !isWindowSerializableValue(record.content.parameters)) {
    throw new InvalidWindowRecordError("Window content descriptors must be serialisable and name a renderer.");
  }
  if (record.anchor && !isWindowSerializableValue(record.anchor)) throw new InvalidWindowRecordError("Window anchors must be serialisable.");
  if (record.toolbar && !isWindowSerializableValue(record.toolbar)) throw new InvalidWindowRecordError("Window toolbar state must be serialisable.");
  if (record.representedDocument && !isWindowSerializableValue(record.representedDocument)) {
    throw new InvalidWindowRecordError("Represented documents must be serialisable.");
  }
  const hasApplicationOwner = Boolean(record.applicationId && record.applicationSessionId);
  if (record.role === "sheet" && !record.parentWindowControllerId && !hasApplicationOwner) {
    throw new InvalidWindowRecordError("Sheets require a parent window or application-session owner.");
  }
  if (record.role === "popover" && (!record.anchor || (!record.parentWindowControllerId && !hasApplicationOwner))) {
    throw new InvalidWindowRecordError("Popovers require an anchor and a parent window or application-session owner.");
  }
  if (record.role !== "popover" && record.anchor) throw new InvalidWindowRecordError("Only popovers carry anchors.");
  if ((record.role === "panel" || record.role === "hud") && record.level === "normal") {
    throw new InvalidWindowRecordError("Panels and HUDs require a floating, modal, or status level.");
  }
  if (!chromeModes.has(record.chromeMode)) {
    throw new InvalidWindowRecordError("Window chrome mode must be system, custom, or frameless.");
  }
  if (canonicalWindowChromeMode(record.role, record.chromeMode) !== record.chromeMode) {
    throw new InvalidWindowRecordError("Window role and chrome mode are incompatible.");
  }
  const canonicalSmoothSurface = normaliseWindowSmoothSurface(record.smoothSurface);
  const serialisedSmoothSurface = canonicalWindowSerializableValue(
    canonicalSmoothSurface as WindowSerializableValue,
    "Window smoothSurface",
  );
  if (JSON.stringify(serialisedSmoothSurface) !== JSON.stringify(record.smoothSurface)) {
    throw new InvalidWindowRecordError("Window smoothSurface must already be canonical.");
  }
  if (!Number.isSafeInteger(record.zIndex) || record.zIndex < 0) throw new InvalidWindowRecordError("Window z-index must be a non-negative safe integer.");
  try { JSON.stringify(record); } catch { throw new InvalidWindowRecordError("Window records must be JSON serialisable."); }
}

export function assertValidWindowRecord(record: WindowRecord): void {
  assertCanonicalWindowRecord(canonicalWindowSerializableValue(
    record as unknown as WindowSerializableValue,
    "Window record",
  ) as unknown as WindowRecord);
}

export function freezeWindowRecord(record: WindowRecord): WindowRecord {
  if (canonicalWindowRecords.has(record)) return record;
  const serialised = canonicalWindowSerializableValue(
    record as unknown as WindowSerializableValue,
    "Window record",
  ) as unknown as WindowRecord;
  const smoothSurface = normaliseWindowSmoothSurface(serialised.smoothSurface);
  const canonical = JSON.stringify(smoothSurface) === JSON.stringify(serialised.smoothSurface)
    ? serialised
    : canonicalWindowSerializableValue(
        { ...serialised, smoothSurface } as unknown as WindowSerializableValue,
        "Window record",
      ) as unknown as WindowRecord;
  assertCanonicalWindowRecord(canonical);
  canonicalWindowRecords.add(canonical);
  return canonical;
}

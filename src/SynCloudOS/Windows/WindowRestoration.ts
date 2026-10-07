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

import type { DocumentKind, DocumentWindowAssociation } from "../Documents";
import type { ScreenSnapshot } from "./ScreenService";
import {
  assertFiniteWindowBounds,
  assertValidWindowRecord,
  canonicalWindowSerializableValue,
  canonicalWindowChromeMode,
  chromeModes,
  defaultWindowSmoothSurface,
  isWindowSerializableValue,
  normaliseWindowSmoothSurface,
  type WindowAnchor,
  type WindowBounds,
  type WindowChromeMode,
  type WindowContentDescriptor,
  type WindowIdPort,
  type WindowRecord,
  type WindowRepresentedDocument,
  type WindowRole,
  type WindowSerializableValue,
  type WindowStyle,
  type WindowToolbarState,
} from "./windowTypes";
import type { SynCloudOSAppFrameSmoothSurfaceManifest } from "../AppRegistry/appRegistryTypes";

declare const resolvedWindowPersistenceNamespaceBrand: unique symbol;
export type ResolvedWindowPersistenceNamespace = string & {
  readonly [resolvedWindowPersistenceNamespaceBrand]: true;
};

export type WindowRestorationPersistenceKey = "windows.installation-id" | "windows.workspace-v1";

export interface WindowRestorationPersistencePort {
  read(key: WindowRestorationPersistenceKey): unknown | null;
  write(key: WindowRestorationPersistenceKey, value: WindowSerializableValue): void;
}

export interface WindowInstallationIdentityPort {
  getOrCreate(request: {
    readonly namespace: ResolvedWindowPersistenceNamespace;
    readonly persistence: WindowRestorationPersistencePort;
    readonly create: () => string;
  }): string;
}

export interface WindowClockPort { now(): number }

export interface WindowRestorationDependencies {
  readonly namespace: ResolvedWindowPersistenceNamespace;
  readonly persistence: WindowRestorationPersistencePort;
  readonly installationIdentity: WindowInstallationIdentityPort;
  readonly clock: WindowClockPort;
  readonly ids: WindowIdPort;
}

export interface RestorableWindowRecord {
  readonly windowControllerId: string;
  readonly workspaceId: string;
  readonly applicationId: string | null;
  readonly applicationSessionId: string | null;
  readonly documentId: string | null;
  /** Expected semantic kind of the associated live document. Legacy
   * snapshots omit it; new snapshots prevent a same-ID writable document
   * from satisfying a projection-window restoration. */
  readonly documentKind?: DocumentKind | null;
  readonly documentAssociationRole: DocumentWindowAssociation["role"] | null;
  readonly representedDocument: WindowRepresentedDocument | null;
  readonly toolbar: WindowToolbarState | null;
  readonly role: WindowRole;
  readonly style: readonly WindowStyle[];
  readonly title: string;
  readonly content: WindowContentDescriptor;
  readonly contentRestorationState: WindowSerializableValue | null;
  readonly normalBounds: WindowBounds;
  readonly minimumSize: { readonly width: number; readonly height: number };
  readonly maximumSize: { readonly width: number; readonly height: number } | null;
  readonly level: WindowRecord["level"];
  readonly parentWindowControllerId: string | null;
  readonly anchor: WindowAnchor | null;
  readonly pinned: boolean;
  readonly wasMinimised: boolean;
  readonly wasZoomed: boolean;
  readonly zOrder: number;
  readonly mobilePolicy: WindowRecord["mobilePolicy"];
  readonly restorationKey: string;
  /** Additive schema-1 fields: `undefined` means a legacy snapshot and
   * resolves to `system` chrome / the default window smooth surface. */
  readonly chromeMode?: WindowChromeMode;
  readonly smoothSurface?: SynCloudOSAppFrameSmoothSurfaceManifest | null;
}

export interface WindowRestorationSnapshot {
  readonly schemaVersion: 1;
  readonly namespace: ResolvedWindowPersistenceNamespace;
  readonly installationId: string;
  readonly capturedAtEpochMs: number;
  readonly keyWindowControllerId: string | null;
  readonly mainWindowControllerId: string | null;
  readonly windows: readonly RestorableWindowRecord[];
}

export type WindowRestorationFailureReason =
  | "content-unavailable"
  | "content-restore-failed"
  | "content-load-failed"
  | "document-unavailable"
  | "relationship-unavailable"
  | "identity-conflict";

export interface WindowRestorationFailure {
  readonly windowControllerId: string;
  readonly restorationKey: string;
  readonly reason: WindowRestorationFailureReason;
  readonly error: unknown;
}

export interface WindowRestorationReport {
  readonly restoredWindowControllerIds: readonly string[];
  readonly reusedWindowControllerIds: readonly string[];
  readonly failures: readonly WindowRestorationFailure[];
}

export interface WindowPresentation {
  readonly kind: "desktop-window" | "mobile-fullscreen" | "mobile-sheet" | "hidden";
  readonly visible: boolean;
  readonly bounds: WindowBounds;
  readonly safeAreaInsets: ScreenSnapshot["safeAreaInsets"];
  readonly movable: boolean;
  readonly resizable: boolean;
  readonly titleBarVisible: boolean;
}

const roles = new Set<WindowRole>(["standard", "panel", "hud", "modal", "sheet", "popover", "borderless"]);
const styles = new Set<WindowStyle>(["titled", "closable", "minimisable", "resizable", "zoomable"]);
const levels = new Set<WindowRecord["level"]>(["normal", "floating", "modal", "status"]);
const mobilePolicies = new Set<WindowRecord["mobilePolicy"]>(["fullscreen", "sheet", "popover-to-sheet", "hidden"]);
const associationRoles = new Set<DocumentWindowAssociation["role"]>(["primary", "secondary", "inspector"]);
const documentKinds = new Set<DocumentKind>(["standard", "projection"]);

export class InvalidWindowRestorationSnapshotError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWindowRestorationSnapshotError";
  }
}

export function resolveWindowPersistenceNamespace(value?: string): ResolvedWindowPersistenceNamespace {
  const resolved = value === undefined ? "syncloudos" : value;
  if (resolved.length === 0) throw new TypeError("Window persistence namespaces must not be empty.");
  return resolved as ResolvedWindowPersistenceNamespace;
}

export function createWindowInstallationIdentityPort(): WindowInstallationIdentityPort {
  return Object.freeze({
    getOrCreate({ persistence, create }: Parameters<WindowInstallationIdentityPort["getOrCreate"]>[0]) {
      const existing = persistence.read("windows.installation-id");
      if (existing !== null) {
        if (typeof existing !== "string" || existing.length === 0) {
          throw new TypeError("The persisted window installation identity is invalid.");
        }
        return existing;
      }
      const created = create();
      if (!created.trim()) throw new TypeError("Window installation identities must not be empty.");
      persistence.write("windows.installation-id", created);
      return created;
    },
  });
}

export function validateWindowRestorationSnapshot(
  value: unknown,
  expected: {
    readonly namespace: ResolvedWindowPersistenceNamespace;
    readonly installationId: string;
    readonly runtimeId: WindowRecord["runtimeId"];
  },
): WindowRestorationSnapshot {
  let canonical!: WindowSerializableValue;
  try {
    canonical = canonicalWindowSerializableValue(value as WindowSerializableValue, "Window restoration snapshot");
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Window restoration snapshot is invalid.");
  }
  value = canonical;
  if (!isPlainObject(value)) invalid("Window restoration snapshots must be plain objects.");
  if (value.schemaVersion !== 1) invalid("Unsupported window restoration schema version.");
  if (value.namespace !== expected.namespace) invalid("Window restoration namespace does not match this runtime.");
  if (value.installationId !== expected.installationId) invalid("Window restoration installation identity does not match this runtime.");
  if (!Number.isFinite(value.capturedAtEpochMs)) invalid("Window restoration capture time must be finite.");
  if (!nullableNonEmptyString(value.keyWindowControllerId) || !nullableNonEmptyString(value.mainWindowControllerId)) {
    invalid("Window restoration key and main identities must be strings or null.");
  }
  if (!Array.isArray(value.windows)) invalid("Window restoration windows must be an array.");

  const ids = new Set<string>();
  const restorationKeys = new Set<string>();
  for (const candidate of value.windows) {
    assertRestorableWindowRecord(candidate, expected.runtimeId);
    if (ids.has(candidate.windowControllerId)) invalid(`Duplicate restored window ID "${candidate.windowControllerId}".`);
    if (restorationKeys.has(candidate.restorationKey)) invalid(`Duplicate window restoration key "${candidate.restorationKey}".`);
    ids.add(candidate.windowControllerId);
    restorationKeys.add(candidate.restorationKey);
  }
  if (value.keyWindowControllerId !== null && !ids.has(value.keyWindowControllerId)) {
    invalid("The restored key window is absent from the snapshot.");
  }
  if (value.mainWindowControllerId !== null && !ids.has(value.mainWindowControllerId)) {
    invalid("The restored main window is absent from the snapshot.");
  }
  for (const candidate of value.windows) {
    if (candidate.parentWindowControllerId !== null && !ids.has(candidate.parentWindowControllerId)) {
      invalid(`Restored parent window "${candidate.parentWindowControllerId}" is absent.`);
    }
  }
  const recordsById = new Map(value.windows.map((record) => [record.windowControllerId, record]));
  for (const candidate of value.windows) {
    if (!candidate.parentWindowControllerId) continue;
    const parent = recordsById.get(candidate.parentWindowControllerId)!;
    if ((candidate.role === "sheet" || candidate.role === "modal") && !["standard", "modal"].includes(parent.role)) {
      invalid("Restored sheets and parented modals require a standard or modal parent.");
    }
    if ((candidate.role === "panel" || candidate.role === "hud") && parent.role !== "standard") {
      invalid("Restored panels and HUDs require a standard parent.");
    }
  }
  assertAcyclicRelationships(value.windows);
  if (!isWindowSerializableValue(value)) invalid("Window restoration snapshots must contain only serialisable values.");
  return value as unknown as WindowRestorationSnapshot;
}

export function freezeWindowRestorationSnapshot(snapshot: WindowRestorationSnapshot): WindowRestorationSnapshot {
  try {
    return canonicalWindowSerializableValue(
      snapshot as unknown as WindowSerializableValue,
      "Window restoration snapshot",
    ) as unknown as WindowRestorationSnapshot;
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Window restoration snapshot is invalid.");
  }
}

export function resolveWindowPresentation(record: WindowRecord, screen: ScreenSnapshot): WindowPresentation {
  const safeAreaInsets = screen.safeAreaInsets;
  const titleBarVisible = record.role !== "borderless" && record.style.includes("titled");
  if (record.mobilePolicy === "hidden") {
    return Object.freeze({
      kind: "hidden",
      visible: false,
      bounds: record.bounds,
      safeAreaInsets,
      movable: false,
      resizable: false,
      titleBarVisible,
    });
  }
  if (screen.breakpoint !== "compact") {
    const bounds = constrainDesktopPresentation(record, screen.workArea);
    return Object.freeze({
      kind: "desktop-window",
      visible: true,
      bounds,
      safeAreaInsets,
      movable: true,
      resizable: record.style.includes("resizable"),
      titleBarVisible,
    });
  }
  const sheet = record.role === "sheet" || record.role === "popover" || record.mobilePolicy === "sheet" || record.mobilePolicy === "popover-to-sheet";
  if (!sheet) {
    return Object.freeze({
      kind: "mobile-fullscreen",
      visible: true,
      bounds: screen.visualViewport,
      safeAreaInsets,
      movable: false,
      resizable: false,
      titleBarVisible,
    });
  }
  const viewport = screen.visualViewport;
  const width = Math.min(record.bounds.width, viewport.width);
  const height = Math.min(record.bounds.height, viewport.height - 24);
  const bounds = Object.freeze({
    x: viewport.x + Math.max(0, (viewport.width - width) / 2),
    y: viewport.y + viewport.height - height,
    width,
    height,
  });
  return Object.freeze({
    kind: "mobile-sheet",
    visible: true,
    bounds,
    safeAreaInsets,
    movable: false,
    resizable: false,
    titleBarVisible,
  });
}

function constrainDesktopPresentation(record: WindowRecord, workArea: WindowBounds): WindowBounds {
  const requested = record.bounds;
  const width = Math.min(
    record.maximumSize?.width ?? Number.POSITIVE_INFINITY,
    Math.max(record.minimumSize.width, requested.width),
  );
  const height = Math.min(
    record.maximumSize?.height ?? Number.POSITIVE_INFINITY,
    Math.max(record.minimumSize.height, requested.height),
  );
  const x = Math.min(workArea.x + workArea.width - 96, Math.max(workArea.x - width + 96, requested.x));
  const y = Math.min(workArea.y + workArea.height - 31, Math.max(workArea.y, requested.y));
  if (requested.x === x && requested.y === y && requested.width === width && requested.height === height) return requested;
  return Object.freeze({ x, y, width, height });
}

function assertRestorableWindowRecord(value: unknown, runtimeId: WindowRecord["runtimeId"]): asserts value is RestorableWindowRecord {
  if (!isPlainObject(value)) invalid("Every restored window must be a plain object.");
  const requiredStrings = ["windowControllerId", "workspaceId", "title", "restorationKey"] as const;
  for (const field of requiredStrings) {
    if (typeof value[field] !== "string" || value[field].length === 0) invalid(`Restored ${field} must not be empty.`);
  }
  if (!nullableNonEmptyString(value.applicationId) || !nullableNonEmptyString(value.applicationSessionId) ||
      !nullableNonEmptyString(value.documentId) || !nullableNonEmptyString(value.parentWindowControllerId)) {
    invalid("Restored optional identities must be non-empty strings or null.");
  }
  if (value.documentAssociationRole !== null && !associationRoles.has(value.documentAssociationRole as DocumentWindowAssociation["role"])) {
    invalid("Restored document association role is invalid.");
  }
  if (value.documentKind !== undefined && value.documentKind !== null && !documentKinds.has(value.documentKind as DocumentKind)) {
    invalid("Restored document kind is invalid.");
  }
  if (value.documentKind !== undefined && (value.documentId === null) !== (value.documentKind === null)) {
    invalid("Restored document kind must accompany a document identity.");
  }
  if (!roles.has(value.role as WindowRole) || !levels.has(value.level as WindowRecord["level"]) ||
      !mobilePolicies.has(value.mobilePolicy as WindowRecord["mobilePolicy"])) invalid("Restored window enums are invalid.");
  if (!Array.isArray(value.style) || !value.style.every((entry) => styles.has(entry as WindowStyle))) invalid("Restored window styles are invalid.");
  if (value.chromeMode !== undefined && (typeof value.chromeMode !== "string" || !chromeModes.has(value.chromeMode as WindowChromeMode))) {
    invalid("Restored window chrome mode is invalid.");
  }
  try { normaliseWindowSmoothSurface(value.smoothSurface); }
  catch { invalid("Restored window smoothSurface is invalid."); }
  if (typeof value.pinned !== "boolean" || typeof value.wasMinimised !== "boolean" || typeof value.wasZoomed !== "boolean") {
    invalid("Restored window state flags must be boolean.");
  }
  if (!Number.isSafeInteger(value.zOrder) || (value.zOrder as number) < 0) invalid("Restored z-order must be a non-negative safe integer.");
  if (!isWindowSerializableValue(value.contentRestorationState)) invalid("Restored content state must be serialisable.");
  if (!isPlainObject(value.normalBounds)) invalid("Restored normal bounds are invalid.");
  assertFiniteWindowBounds(value.normalBounds as unknown as WindowBounds, "normalBounds");
  try {
    assertValidWindowRecord({
      id: value.windowControllerId as string,
      runtimeId,
      workspaceId: value.workspaceId as string,
      applicationId: value.applicationId as string | null,
      applicationSessionId: value.applicationSessionId as string | null,
      documentId: value.documentId as string | null,
      documentAssociationRole: value.documentAssociationRole as DocumentWindowAssociation["role"] | null,
      representedDocument: value.representedDocument as WindowRepresentedDocument | null,
      toolbar: value.toolbar as WindowToolbarState | null,
      role: value.role as WindowRole,
      style: value.style as readonly WindowStyle[],
      title: value.title as string,
      content: value.content as WindowContentDescriptor,
      bounds: value.normalBounds as unknown as WindowBounds,
      minimumSize: value.minimumSize as { readonly width: number; readonly height: number },
      maximumSize: value.maximumSize as { readonly width: number; readonly height: number } | null,
      level: value.level as WindowRecord["level"],
      parentWindowControllerId: value.parentWindowControllerId as string | null,
      anchor: value.anchor as WindowAnchor | null,
      pinned: value.pinned as boolean,
      state: "closed",
      isKey: false,
      isMain: false,
      zIndex: value.zOrder as number,
      mobilePolicy: value.mobilePolicy as WindowRecord["mobilePolicy"],
      restorationKey: value.restorationKey as string,
      chromeMode: canonicalWindowChromeMode(value.role as WindowRole, value.chromeMode as WindowChromeMode | undefined),
      smoothSurface: normaliseWindowSmoothSurface(value.smoothSurface),
    });
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Restored window record is invalid.");
  }
}

function assertAcyclicRelationships(records: readonly RestorableWindowRecord[]): void {
  const parentById = new Map(records.map((record) => [record.windowControllerId, record.parentWindowControllerId]));
  const complete = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (complete.has(id)) return;
    if (visiting.has(id)) invalid("Window restoration relationships contain a cycle.");
    visiting.add(id);
    const parent = parentById.get(id);
    if (parent) visit(parent);
    visiting.delete(id);
    complete.add(id);
  };
  for (const id of parentById.keys()) visit(id);
}

function nullableNonEmptyString(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function invalid(message: string): never { throw new InvalidWindowRestorationSnapshotError(message); }

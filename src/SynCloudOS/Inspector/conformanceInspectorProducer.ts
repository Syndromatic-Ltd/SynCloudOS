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

import type { SynCloudOSRuntime } from "../SynCloudOS";
import type {
  InspectorAdapterSummary,
  InspectorAppLifecycle,
  InspectorBoundedError,
  InspectorCacheSummary,
  InspectorCapabilityDecision,
  InspectorCommandSummary,
  InspectorDocumentSummary,
  InspectorAccessibilityIssue,
  InspectorAppearanceCoverage,
  InspectorKeyBindingSummary,
  InspectorLifecycleEvent,
  InspectorNavigationEntry,
  InspectorOperation,
  InspectorOverlay,
  InspectorPasteboardSummary,
  InspectorResponderNode,
  InspectorRouteNode,
  InspectorUndoManagerSummary,
  InspectorWindowSummary,
  ConformanceInspectorSectionId,
  ConformanceInspectorSectionStatus,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotOptions,
  ConformanceInspectorSnapshotPort,
} from "./conformanceInspectorTypes";
import { assertConformanceInspectorSnapshot, createConformanceInspectorExport, trustConformanceInspectorSnapshot } from "./conformanceInspectorValidation";

type InspectorLimits = Readonly<{
  lifecycle: number;
  events: number;
  errors: number;
  resources: number;
  data: number;
}>;

interface RawConformanceInspectorSnapshot {
  readonly runtimeId: string;
  readonly capturedAt: number;
  readonly totals: {
    readonly activeOperations: number;
    readonly lifecycleApps: number;
    readonly lifecycleTimeline: number;
    readonly routes: number;
    readonly browserQueue: number;
    readonly capabilities: number;
    readonly responderGraph: number;
    readonly commands: number;
    readonly keyBindings: number;
    readonly undoManagers: number;
    readonly documents: number;
    readonly windows: number;
    readonly panels: number;
    readonly overlays: number;
    readonly caches: number;
    readonly accessibility: number;
    readonly appearanceCoverage: number;
    readonly performance: number;
    readonly errors: number;
  };
  readonly runtime: {
    readonly state: string;
    readonly booted: boolean;
    readonly disposed: boolean;
    readonly activeOperations: readonly { readonly id: string; readonly kind: string; readonly phase: string; readonly status: string }[];
    readonly ownedResources: readonly { readonly id: string; readonly kind: string; readonly count: number }[];
  };
  readonly lifecycle: {
    readonly apps: readonly { readonly id: string; readonly state: string }[];
    readonly timeline: readonly { readonly id: string; readonly type: string; readonly appId: string | null; readonly at: number }[];
  };
  readonly navigation: {
    readonly routes: readonly { readonly id: string; readonly kind: string; readonly workspaceId: string }[];
    readonly browserQueue: readonly { readonly id: string; readonly at: number; readonly kind: string }[];
  };
  readonly adapters: readonly InspectorAdapterSummary[];
  readonly capabilities: readonly { readonly id: string; readonly capability: string; readonly status: "allowed" | "denied" }[];
  readonly activeResponder: { readonly id: string; readonly role: string; readonly parentId: string | null } | null;
  readonly responderGraph: readonly { readonly id: string; readonly role: string; readonly parentId: string | null }[];
  readonly commands: readonly { readonly id: string; readonly enabled: boolean; readonly owner: string }[];
  readonly keyBindings: readonly { readonly commandId: string; readonly chord: string; readonly scope: string }[];
  readonly undoManagers: readonly { readonly id: string; readonly owner: string; readonly canUndo: boolean; readonly canRedo: boolean }[];
  readonly documents: readonly {
    readonly id: string;
    readonly typeId: string;
    readonly state: string;
    readonly dirty: boolean;
    readonly recovery: "none" | "available";
    readonly dirtyRevision: number;
    readonly recoveryVersion: number | null;
  }[];
  readonly windows: readonly { readonly id: string; readonly role: string; readonly state: string; readonly key: boolean; readonly zIndex: number }[];
  readonly panels: readonly { readonly id: string; readonly role: string; readonly state: string; readonly key: boolean; readonly zIndex: number }[];
  readonly overlays: readonly { readonly id: string; readonly kind: string; readonly state: string }[];
  readonly pasteboards: readonly { readonly name: string; readonly types: readonly string[]; readonly changeCount: number }[];
  readonly dragSession: { readonly id: string; readonly phase: string; readonly operation: string } | null;
  readonly colourPanel: { readonly open: boolean; readonly pickerId: string | null; readonly targetOwner: string | null };
  readonly caches: readonly { readonly id: string; readonly entries: number; readonly bytes: number }[];
  readonly appearance: {
    readonly requested: string;
    readonly resolved: string;
    readonly galleryCoverage: readonly { readonly slot: string; readonly status: "covered" | "unresolved" | "provenance-violation" }[];
  };
  readonly accessibility: readonly { readonly code: string; readonly severity: "info" | "warning" | "error" }[];
  readonly performance: readonly { readonly id: string; readonly value: number; readonly budget: number }[];
  readonly errors: readonly { readonly id: string; readonly category: string; readonly code: string; readonly at: number }[];
}

interface ConformanceInspectorSource {
  read(limits: InspectorLimits): RawConformanceInspectorSnapshot;
}

/**
 * The runtime may own mutable managers, but the snapshot assembler must not.
 * These narrow, read-only ports are the only new graph inputs the assembler
 * receives. Each port copies scalar metadata into frozen records before it
 * crosses the producer boundary.
 */
interface RuntimeConformanceInspectorPorts {
  readonly documents: { read(): RawConformanceInspectorSnapshot["documents"] };
  readonly presentation: {
    read(): Readonly<{
      windows: RawConformanceInspectorSnapshot["windows"];
      panels: RawConformanceInspectorSnapshot["panels"];
      overlays: RawConformanceInspectorSnapshot["overlays"];
    }>;
  };
  readonly resources: {
    read(): Readonly<{
      ownedResources: RawConformanceInspectorSnapshot["runtime"]["ownedResources"];
      performance: RawConformanceInspectorSnapshot["performance"];
    }>;
  };
  readonly appearance: { read(): RawConformanceInspectorSnapshot["appearance"] };
  readonly accessibility: { read(): RawConformanceInspectorSnapshot["accessibility"] };
}

const defaultLimits: InspectorLimits = Object.freeze({
  lifecycle: 200,
  events: 100,
  errors: 50,
  resources: 100,
  data: 20,
});

const maximumLimits: InspectorLimits = Object.freeze({
  lifecycle: 200,
  events: 100,
  errors: 50,
  resources: 100,
  data: 20,
});

function resolveLimits(options: ConformanceInspectorSnapshotOptions): InspectorLimits {
  const limits = options.limits;
  const limit = (key: keyof InspectorLimits) => {
    const value = limits?.[key];
    return typeof value === "number" && Number.isInteger(value)
      ? Math.max(0, Math.min(value, maximumLimits[key]))
      : defaultLimits[key];
  };
  return Object.freeze({
    lifecycle: limit("lifecycle"),
    events: limit("events"),
    errors: limit("errors"),
    resources: limit("resources"),
    data: limit("data"),
  });
}

function tail<T>(values: readonly T[], limit: number): readonly T[] {
  return limit === 0 ? [] : values.slice(-limit);
}

function head<T>(values: readonly T[], limit: number): readonly T[] {
  return limit === 0 ? [] : values.slice(0, limit);
}

function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return Object.freeze(value);
}

function abortError(): Error {
  const error = new Error("Conformance inspector refresh was aborted.");
  error.name = "AbortError";
  return error;
}

function assertActive(signal: AbortSignal | undefined, runtimeSignal: AbortSignal): void {
  if (signal?.aborted || runtimeSignal.aborted) throw abortError();
}

/**
 * Small synchronous SHA-256 utility for inspector capture namespaces. Capture
 * creation must not rely on Node crypto or ambient browser crypto authority.
 */
const initialHash: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const roundConstants = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function encodeUtf8(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);
      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + trailing - 0xdc00;
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12), 0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(
        0xf0 | (codePoint >>> 18),
        0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function rightRotate(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(value: string): string {
  const source = encodeUtf8(value);
  const bitLength = source.length * 8;
  if (!Number.isSafeInteger(bitLength) || bitLength > 0x1fffffffffffff) {
    throw new RangeError("SHA-256 input is too large.");
  }

  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(source);
  padded[source.length] = 0x80;
  const highBits = Math.floor(bitLength / 0x1_0000_0000);
  const lowBits = bitLength >>> 0;
  padded[paddedLength - 8] = highBits >>> 24;
  padded[paddedLength - 7] = highBits >>> 16;
  padded[paddedLength - 6] = highBits >>> 8;
  padded[paddedLength - 5] = highBits;
  padded[paddedLength - 4] = lowBits >>> 24;
  padded[paddedLength - 3] = lowBits >>> 16;
  padded[paddedLength - 2] = lowBits >>> 8;
  padded[paddedLength - 1] = lowBits;

  let [hash0, hash1, hash2, hash3, hash4, hash5, hash6, hash7] = initialHash;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + (index * 4);
      words[index] = (padded[byteOffset] << 24) | (padded[byteOffset + 1] << 16) |
        (padded[byteOffset + 2] << 8) | padded[byteOffset + 3];
    }
    for (let index = 16; index < 64; index += 1) {
      const lower = rightRotate(words[index - 15], 7) ^ rightRotate(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const upper = rightRotate(words[index - 2], 17) ^ rightRotate(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + lower + words[index - 7] + upper) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = [hash0, hash1, hash2, hash3, hash4, hash5, hash6, hash7];
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temporary1 = (h + sigma1 + choose + roundConstants[index] + words[index]) >>> 0;
      const sigma0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }

    hash0 = (hash0 + a) >>> 0;
    hash1 = (hash1 + b) >>> 0;
    hash2 = (hash2 + c) >>> 0;
    hash3 = (hash3 + d) >>> 0;
    hash4 = (hash4 + e) >>> 0;
    hash5 = (hash5 + f) >>> 0;
    hash6 = (hash6 + g) >>> 0;
    hash7 = (hash7 + h) >>> 0;
  }

  return [hash0, hash1, hash2, hash3, hash4, hash5, hash6, hash7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
}

export function deriveConformanceInspectorCaptureNamespace(nonce: string, sequence: number): string {
  if (nonce.length === 0 || nonce.length > 256) throw new TypeError("Conformance inspector capture nonce is invalid.");
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError("Conformance inspector capture sequence is invalid.");
  // The domain and length-prefixes make the complete nonce-plus-sequence
  // input unambiguous while keeping neither component parseable from output.
  const source = `syncloudos.conformance-inspector.capture.v1\u0000${nonce.length}\u0000${nonce}\u0000${sequence}`;
  return sha256Hex(source).slice(0, 32);
}

function createPseudonymiser(captureSalt: string) {
  const references = new Map<string, string>();
  return Object.freeze({
    get count(): number {
      return references.size;
    },
    reference(value: string | null): string | null {
      if (value === null) return null;
      const existing = references.get(value);
      if (existing) return existing;
      const next = `ref-${captureSalt}-${references.size + 1}`;
      references.set(value, next);
      return next;
    },
  });
}

function safeCategory(value: string, fallback: string): string {
  return value.length > 0 && value.length <= 64 && /^[A-Za-z0-9_.:+-]+$/.test(value) ? value : fallback;
}

function safeAppearance(value: string): string {
  return value === "auto" || value === "light" || value === "dark" ? value : "custom";
}

function createRuntimeConformanceInspectorPorts(runtime: SynCloudOSRuntime): RuntimeConformanceInspectorPorts {
  const documents = Object.freeze({
    read: () => Object.freeze(runtime.documents.openDocuments.map((document) => Object.freeze({
      id: document.id,
      typeId: document.type.id,
      state: document.state,
      dirty: document.hasUnsavedChanges,
      recovery: document.hasRecoverableAutosave ? "available" as const : "none" as const,
      dirtyRevision: document.dirtyRevision,
      recoveryVersion: document.recoveryRecord?.recoveryVersion ?? null,
    }))),
  });
  const presentation = Object.freeze({
    read: () => {
      const snapshot = runtime.windows.snapshot();
      const windows = Object.freeze(runtime.windows.list().map(({ record }, zIndex) => Object.freeze({
        id: record.id,
        role: record.role,
        state: record.state,
        key: record.id === snapshot.keyWindowControllerId,
        zIndex,
      })));
      const panels = Object.freeze(windows.filter(({ role }) => role === "panel" || role === "hud"));
      const overlays = Object.freeze(windows
        .filter(({ role }) => role === "modal" || role === "sheet" || role === "popover")
        .map(({ id, role, state }) => Object.freeze({ id, kind: role, state })));
      return Object.freeze({ windows, panels, overlays });
    },
  });
  const resources = Object.freeze({
    read: () => {
      const images = runtime.images.diagnostics();
      const animations = runtime.animations.diagnostics();
      const sounds = runtime.audio.diagnostics();
      const webContent = runtime.webContent.diagnostics();
      const textLayout = runtime.textLayout.diagnostics();
      const ownedResources = Object.freeze([
        { id: "images.decoded", kind: "image", count: images.decodedEntryCount },
        { id: "animations.active", kind: "animation", count: animations.activeCount },
        { id: "sounds.handles", kind: "sound", count: sounds.handleCount },
        { id: "web-content.sessions", kind: "web-content", count: webContent.sessionCount },
        { id: "text-layout.measurements", kind: "text-layout", count: textLayout.activeMeasurementNodeCount },
      ].map((row) => Object.freeze(row)));
      const performance = Object.freeze([
        { id: "images.activeOperations", value: images.activeOperationCount, budget: 100 },
        { id: "animations.active", value: animations.activeCount, budget: 100 },
        { id: "sounds.pendingLoads", value: sounds.pendingLoadCount, budget: 100 },
        { id: "web-content.pending", value: webContent.pendingOperationCount, budget: 100 },
        { id: "text-layout.active", value: textLayout.activeOperationCount, budget: 100 },
      ].map((row) => Object.freeze(row)));
      return Object.freeze({ ownedResources, performance });
    },
  });
  const appearance = Object.freeze({
    read: () => Object.freeze({
      requested: runtime.appearance.get(),
      resolved: runtime.appearance.resolved(),
      galleryCoverage: Object.freeze(runtime.inspector.getConformanceAppearanceFacts().map((fact) => Object.freeze({ ...fact }))),
    }),
  });
  const accessibility = Object.freeze({
    read: () => Object.freeze(runtime.inspector.getConformanceAccessibilityFindings().map((finding) => Object.freeze({ ...finding }))),
  });
  return Object.freeze({ documents, presentation, resources, appearance, accessibility });
}

function createRuntimeConformanceInspectorSource(runtime: SynCloudOSRuntime): ConformanceInspectorSource {
  const ports = createRuntimeConformanceInspectorPorts(runtime);
  return Object.freeze({
    read(limits: InspectorLimits): RawConformanceInspectorSnapshot {
      const state = runtime.store.cloneSnapshot();
      const appRows = [...runtime.apps.getAllApps()].sort((left, right) => left.id.localeCompare(right.id));
      const responderInspection = runtime.responders.inspect();
      const focusedResponderId = runtime.focus.inspect().focusedResponderId;
      const activeResponder = focusedResponderId
        ? responderInspection.registrations.find(({ id }) => id === focusedResponderId) ?? null
        : null;
      const presentation = ports.presentation.read();
      const documentRows = ports.documents.read();
      const resourceInspection = ports.resources.read();
      const appearanceInspection = ports.appearance.read();
      const accessibilityInspection = ports.accessibility.read();
      const pendingOperations = runtime.operations.inspectPending();
      const eventHistory = runtime.events.getHistory();
      const allLifecycleRows = [
        ...state.lifecycleEvents.map((event, index) => ({
          id: `${event.appId}:${event.at}:${index}`,
          type: event.to,
          appId: event.appId,
          at: event.at,
        })),
        ...eventHistory
          .filter((event) => event.type === "lifecycle.emit" || event.type.startsWith("app.lifecycle."))
          .map((event) => ({ id: event.id, type: event.type, appId: null, at: event.at })),
      ];
      const lifecycleRows = tail(allLifecycleRows, limits.lifecycle);
      const cacheInspection = runtime.caches.inspect();
      const cacheRows = head(cacheInspection, limits.resources);
      const commandInspection = runtime.commands.inspect();
      const keyBindingInspection = runtime.keyBindings.inspect();
      const colourPanel = runtime.colourPanel.getSnapshot();
      const dragSession = runtime.drag.snapshot().active;
      const routeRows = appRows.map((app) => ({ id: app.id, kind: app.type, workspaceId: "webspring" }));
      const browserQueueRows = eventHistory
        .filter((event) => event.type === "route.open")
        .map((event) => ({ id: event.id, at: event.at, kind: "route.open" }));
      const capabilityRows = appRows.map((app) => {
        const capability = app.type === "system" ? "diagnostics.view" : "app.open.public";
        const decision = runtime.policy.evaluate({
          action: "route.open",
          app,
          origin: "developerConsole",
          source: "SynCloudOS.ConformanceInspector",
          requiredCapabilities: [capability],
        });
        return { id: app.id, capability, status: decision.allowed ? "allowed" as const : "denied" as const };
      });
      const responderRows = [...responderInspection.registrations]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id, kind, parentId }) => ({ id, role: kind, parentId }));
      const commandRows = [...commandInspection.registrations]
        .sort((left, right) => left.commandId.localeCompare(right.commandId))
        .map(({ commandId, responderId }) => ({ id: commandId, enabled: true, owner: responderId }));
      const keyBindingRows = keyBindingInspection.overrides.map(({ commandId, binding }) => ({
        commandId,
        chord: binding ? `${binding.modifiers.join("+")}+${binding.key}` : "disabled",
        scope: binding?.scope ?? "global",
      }));
      const undoRows = runtime.undo.inspect().map((manager) => ({
        id: `${manager.owner.kind}:${manager.owner.id}`,
        owner: `${manager.owner.kind}:${manager.owner.id}`,
        canUndo: manager.canUndo,
        canRedo: manager.canRedo,
      }));
      const adapterStatus = (value: unknown): InspectorAdapterSummary["status"] => value ? "available" : "unavailable";
      const pasteboardSummary = (name: string, board: typeof runtime.pasteboards.system) => ({
        name,
        types: Object.freeze([...new Set(board.snapshot().map(({ type }) => type))].sort()),
        changeCount: board.changeCount,
      });

      return deepFreeze({
        runtimeId: String(runtime.runtimeId),
        capturedAt: runtime.environment.now(),
        totals: {
          activeOperations: pendingOperations.length,
          lifecycleApps: Object.keys(state.lifecycle).length,
          lifecycleTimeline: allLifecycleRows.length,
          routes: routeRows.length,
          browserQueue: browserQueueRows.length,
          capabilities: capabilityRows.length,
          responderGraph: responderRows.length,
          commands: commandRows.length,
          keyBindings: keyBindingRows.length,
          undoManagers: undoRows.length,
          documents: documentRows.length,
          windows: presentation.windows.length,
          panels: presentation.panels.length,
          overlays: presentation.overlays.length,
          caches: cacheInspection.length,
          accessibility: accessibilityInspection.length,
          appearanceCoverage: appearanceInspection.galleryCoverage.length,
          performance: resourceInspection.performance.length,
          errors: state.errors.length,
        },
        runtime: {
          state: runtime.disposalState,
          booted: state.booted,
          disposed: runtime.disposalState === "disposed",
          activeOperations: head(pendingOperations, limits.data).map((operation) => ({
            id: operation.operationId,
            kind: operation.kind,
            phase: operation.phase,
            status: operation.status ?? "pending",
          })),
          ownedResources: head([
            { id: "windows", kind: "window", count: presentation.windows.length },
            { id: "documents", kind: "document", count: documentRows.length },
            { id: "caches", kind: "cache", count: cacheRows.length },
            ...resourceInspection.ownedResources,
          ], limits.resources),
        },
        lifecycle: {
          apps: head(Object.entries(state.lifecycle)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([id, lifecycleState]) => ({ id, state: lifecycleState })), limits.data),
          timeline: lifecycleRows,
        },
        navigation: {
          routes: head(routeRows, limits.data),
          browserQueue: head(browserQueueRows, limits.data),
        },
        adapters: [
          { id: "browser", kind: "browser", status: "available" },
          { id: "clipboard", kind: "pasteboard", status: adapterStatus(runtime.environment.clipboard) },
          { id: "pointer", kind: "pointer", status: adapterStatus(runtime.environment.pointer) },
          { id: "images", kind: "image", status: adapterStatus(runtime.environment.images) },
          { id: "animation", kind: "animation", status: adapterStatus(runtime.environment.animation) },
          { id: "sound", kind: "audio", status: adapterStatus(runtime.environment.audio) },
          { id: "web-content", kind: "web-content", status: adapterStatus(runtime.environment.webContent) },
        ],
        capabilities: head(capabilityRows, limits.data),
        activeResponder: activeResponder
          ? { id: activeResponder.id, role: activeResponder.kind, parentId: activeResponder.parentId }
          : null,
        responderGraph: head(responderRows, limits.data),
        commands: head(commandRows, limits.data),
        keyBindings: head(keyBindingRows, limits.data),
        undoManagers: head(undoRows, limits.data),
        documents: head(documentRows, limits.data),
        windows: head(presentation.windows, limits.data),
        panels: head(presentation.panels, limits.data),
        overlays: head(presentation.overlays, limits.data),
        pasteboards: [
          pasteboardSummary("system", runtime.pasteboards.system),
          pasteboardSummary("drag", runtime.pasteboards.drag),
          pasteboardSummary("find", runtime.pasteboards.find),
        ],
        dragSession: dragSession ? { id: dragSession.id, phase: dragSession.phase, operation: dragSession.operation } : null,
        colourPanel: {
          open: colourPanel.open,
          pickerId: colourPanel.activePickerId,
          targetOwner: colourPanel.activeTargetId,
        },
        caches: cacheRows.map((cache) => ({ id: cache.id, entries: cache.entries, bytes: cache.weight })),
        appearance: {
          ...appearanceInspection,
          // Keep live owner aggregation complete; only the published snapshot
          // view is bounded by the caller's data limit.
          galleryCoverage: head(appearanceInspection.galleryCoverage, limits.data),
        },
        accessibility: head(accessibilityInspection, limits.data),
        performance: resourceInspection.performance,
        errors: tail(state.errors, limits.errors).map((error) => ({
          id: error.id,
          category: error.category ?? "runtime",
          code: error.code,
          at: error.at,
        })),
      });
    },
  });
}

function buildConformanceSnapshot(raw: RawConformanceInspectorSnapshot, sequence: number, captureSalt: string): ConformanceInspectorSnapshot {
  const pseudonyms = createPseudonymiser(captureSalt);
  const reference = (value: string): string => pseudonyms.reference(value)!;
  const runtimeId = reference(raw.runtimeId);
  const section = (
    id: ConformanceInspectorSectionId,
    total: number | null,
    returned: number,
    redacted = 0,
    available = true,
  ): ConformanceInspectorSectionStatus => Object.freeze({
    id,
    status: !available ? "unavailable" : total !== null && total > returned ? "truncated" : "complete",
    total,
    returned,
    redacted,
  });

  const lifecycleApps: readonly InspectorAppLifecycle[] = raw.lifecycle.apps.map(({ id, state }) => ({
    id: reference(id),
    state: safeCategory(state, "unknown"),
  }));
  const timeline: readonly InspectorLifecycleEvent[] = raw.lifecycle.timeline.map(({ id, type, appId, at }) => ({
    id: reference(id),
    type: safeCategory(type, "lifecycle"),
    appId: appId === null ? null : reference(appId),
    at,
  }));
  const routes: readonly InspectorRouteNode[] = raw.navigation.routes.map(({ id, kind, workspaceId }) => ({
    id: reference(id),
    kind: safeCategory(kind, "route"),
    workspaceId: safeCategory(workspaceId, "workspace"),
  }));
  const browserQueue: readonly InspectorNavigationEntry[] = raw.navigation.browserQueue.map(({ id, at, kind }) => ({
    id: reference(id),
    at,
    kind: safeCategory(kind, "route"),
  }));
  const activeOperations: readonly InspectorOperation[] = raw.runtime.activeOperations.map(({ id, kind, phase, status }) => ({
    id: reference(id),
    kind: safeCategory(kind, "operation"),
    phase: safeCategory(phase, "unknown"),
    status: safeCategory(status, "pending"),
  }));
  const capabilities: readonly InspectorCapabilityDecision[] = raw.capabilities.map(({ id, capability, status }) => ({
    id: reference(id),
    capability: safeCategory(capability, "capability"),
    status,
  }));
  const activeResponder: InspectorResponderNode | null = raw.activeResponder
    ? { id: reference(raw.activeResponder.id), role: safeCategory(raw.activeResponder.role, "responder"), parentId: raw.activeResponder.parentId === null ? null : reference(raw.activeResponder.parentId) }
    : null;
  const responderGraph: readonly InspectorResponderNode[] = raw.responderGraph.map(({ id, role, parentId }) => ({
    id: reference(id),
    role: safeCategory(role, "responder"),
    parentId: parentId === null ? null : reference(parentId),
  }));
  const commands: readonly InspectorCommandSummary[] = raw.commands.map(({ id, enabled, owner }) => ({
    id: reference(id),
    enabled,
    owner: reference(owner),
  }));
  const keyBindings: readonly InspectorKeyBindingSummary[] = raw.keyBindings.map(({ commandId, chord, scope }) => ({
    commandId: reference(commandId),
    chord: safeCategory(chord, "bound"),
    scope: safeCategory(scope, "global"),
  }));
  const undoManagers: readonly InspectorUndoManagerSummary[] = raw.undoManagers.map(({ id, owner, canUndo, canRedo }) => ({
    id: reference(id),
    owner: reference(owner),
    canUndo,
    canRedo,
  }));
  const documents: readonly InspectorDocumentSummary[] = raw.documents.map((document) => ({
    id: reference(document.id),
    typeId: reference(document.typeId),
    state: safeCategory(document.state, "unknown"),
    dirty: document.dirty,
    recovery: document.recovery,
    dirtyRevision: Math.max(0, document.dirtyRevision),
    recoveryVersion: document.recoveryVersion === null ? null : Math.max(0, document.recoveryVersion),
  }));
  const windowSummary = ({ id, role, state, key, zIndex }: RawConformanceInspectorSnapshot["windows"][number]): InspectorWindowSummary => ({
    id: reference(id),
    role: safeCategory(role, "window"),
    state: safeCategory(state, "unknown"),
    key,
    zIndex,
  });
  const windows: readonly InspectorWindowSummary[] = raw.windows.map(windowSummary);
  const panels: readonly InspectorWindowSummary[] = raw.panels.map(windowSummary);
  const overlays: readonly InspectorOverlay[] = raw.overlays.map(({ id, kind, state }) => ({
    id: reference(id),
    kind: safeCategory(kind, "overlay"),
    state: safeCategory(state, "unknown"),
  }));
  const pasteboards: readonly InspectorPasteboardSummary[] = raw.pasteboards.map(({ name, types, changeCount }) => ({
    name: safeCategory(name, "board"),
    types: types.map((type) => reference(type)),
    changeCount,
  }));
  const dragSession = raw.dragSession
    ? { id: reference(raw.dragSession.id), phase: safeCategory(raw.dragSession.phase, "unknown"), operation: safeCategory(raw.dragSession.operation, "none") }
    : null;
  const colourPanel = {
    open: raw.colourPanel.open,
    pickerId: raw.colourPanel.pickerId === null ? null : reference(raw.colourPanel.pickerId),
    targetOwner: raw.colourPanel.targetOwner === null ? null : reference(raw.colourPanel.targetOwner),
  };
  const caches: readonly InspectorCacheSummary[] = raw.caches.map(({ id, entries, bytes }) => ({ id: reference(id), entries, bytes }));
  const galleryCoverage: readonly InspectorAppearanceCoverage[] = raw.appearance.galleryCoverage.map(({ slot, status }) => ({
    slot: safeCategory(slot, "asset"),
    status,
  }));
  const accessibility: readonly InspectorAccessibilityIssue[] = raw.accessibility.map(({ code, severity }) => ({
    code: safeCategory(code, "accessibility"),
    severity,
  }));
  const errors: readonly InspectorBoundedError[] = raw.errors.map(({ id, category, code, at }) => ({
    id: reference(id),
    category: reference(category),
    code: reference(code),
    at,
  }));

  const sections = [
    section("runtime.activeOperations", raw.totals.activeOperations, activeOperations.length, activeOperations.length),
    section("runtime.ownedResources", raw.runtime.ownedResources.length, raw.runtime.ownedResources.length),
    section("lifecycle.apps", raw.totals.lifecycleApps, lifecycleApps.length, lifecycleApps.length),
    section("lifecycle.timeline", raw.totals.lifecycleTimeline, timeline.length, timeline.length * 2),
    section("navigation.routes", raw.totals.routes, routes.length, routes.length),
    section("navigation.browserQueue", raw.totals.browserQueue, browserQueue.length, browserQueue.length),
    section("adapters", raw.adapters.length, raw.adapters.length),
    section("capabilities", raw.totals.capabilities, capabilities.length, capabilities.length),
    section("responderGraph", raw.totals.responderGraph, responderGraph.length, responderGraph.reduce((count, row) => count + (row.parentId === null ? 1 : 2), 0)),
    section("commands", raw.totals.commands, commands.length, commands.length * 2),
    section("keyBindings", raw.totals.keyBindings, keyBindings.length, keyBindings.length),
    section("undoManagers", raw.totals.undoManagers, undoManagers.length, undoManagers.length * 2),
    section("documents", raw.totals.documents, documents.length, documents.length * 2),
    section("windows", raw.totals.windows, windows.length, windows.length),
    section("panels", raw.totals.panels, panels.length, panels.length),
    section("overlays", raw.totals.overlays, overlays.length, overlays.length),
    section("pasteboards", raw.pasteboards.length, pasteboards.length, pasteboards.reduce((count, row) => count + row.types.length, 0)),
    section("dragSession", raw.dragSession ? 1 : 0, dragSession ? 1 : 0, dragSession ? 1 : 0),
    section(
      "colourPanel",
      (raw.colourPanel.pickerId ? 1 : 0) + (raw.colourPanel.targetOwner ? 1 : 0),
      (colourPanel.pickerId ? 1 : 0) + (colourPanel.targetOwner ? 1 : 0),
      (colourPanel.pickerId ? 1 : 0) + (colourPanel.targetOwner ? 1 : 0),
    ),
    section("caches", raw.totals.caches, caches.length, caches.length),
    section("appearance", raw.totals.appearanceCoverage + 1, galleryCoverage.length + 1, galleryCoverage.length),
    section("accessibility", raw.totals.accessibility, accessibility.length),
    section("performance", raw.totals.performance, raw.performance.length),
    section("errors", raw.totals.errors, errors.length, errors.length * 3),
  ] as const;
  const metadata = {
    complete: sections.every(({ status }) => status === "complete"),
    returned: sections.reduce((count, row) => count + row.returned, 0),
    redacted: pseudonyms.count,
    sections,
  };

  const snapshot: ConformanceInspectorSnapshot = {
    runtimeId,
    sequence,
    capturedAt: new Date(raw.capturedAt).toISOString(),
    metadata,
    runtime: {
      state: safeCategory(raw.runtime.state, "unknown"),
      booted: raw.runtime.booted,
      disposed: raw.runtime.disposed,
      activeOperations,
      ownedResources: raw.runtime.ownedResources.map(({ id, kind, count }) => ({ id: safeCategory(id, "resource"), kind: safeCategory(kind, "resource"), count })),
    },
    lifecycle: { apps: lifecycleApps, timeline },
    navigation: {
      routes,
      workspaces: [{ id: "webspring", active: true }],
      browserQueue,
    },
    adapters: raw.adapters,
    capabilities,
    activeResponder,
    responderGraph,
    commands,
    keyBindings,
    undoManagers,
    documents,
    windows,
    panels,
    overlays,
    pasteboards,
    dragSession,
    colourPanel,
    caches,
    appearance: {
      selection: {
        requested: safeAppearance(raw.appearance.requested),
        resolved: safeAppearance(raw.appearance.resolved),
      },
      galleryCoverage,
      unresolvedAssetSlots: galleryCoverage
        .filter(({ status }) => status === "unresolved")
        .map(({ slot }) => slot),
      provenanceViolations: galleryCoverage
        .filter(({ status }) => status === "provenance-violation")
        .map(({ slot }) => slot),
    },
    accessibility,
    performance: raw.performance.map(({ id, value, budget }) => ({
      id: safeCategory(id, "performance"),
      value: Math.max(0, value),
      budget: Math.max(0, budget),
    })),
    errors,
  };
  return trustConformanceInspectorSnapshot(deepFreeze(snapshot));
}

/** Builds the public snapshot port from one internal source. The aggregator
 * below only receives immutable plain producer data; it cannot call a
 * registry, manager, store, policy mutator, or browser global. */
export function createRuntimeConformanceInspectorProducer(runtime: SynCloudOSRuntime): ConformanceInspectorSnapshotPort {
  const source = createRuntimeConformanceInspectorSource(runtime);
  let sequence = 0;
  const getConformanceSnapshot = (options: ConformanceInspectorSnapshotOptions = {}) => {
    assertActive(options.signal, runtime.signal);
    const limits = resolveLimits(options);
    const captureSequence = ++sequence;
    const snapshot = buildConformanceSnapshot(
      source.read(limits),
      captureSequence,
      deriveConformanceInspectorCaptureNamespace(runtime.environment.randomUUID(), captureSequence),
    );
    assertConformanceInspectorSnapshot(snapshot);
    return snapshot;
  };
  const refreshConformanceSnapshot = async (options: ConformanceInspectorSnapshotOptions = {}) => {
    assertActive(options.signal, runtime.signal);
    await Promise.resolve();
    assertActive(options.signal, runtime.signal);
    return getConformanceSnapshot(options);
  };
  return Object.freeze({
    getConformanceSnapshot,
    refreshConformanceSnapshot,
    exportConformanceSnapshot: createConformanceInspectorExport,
  });
}



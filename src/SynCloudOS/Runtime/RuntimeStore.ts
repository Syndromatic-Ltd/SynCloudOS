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

import type { RuntimeListener, RuntimeMutator, RuntimeSnapshot } from "./runtimeTypes";
import type {
  SynCloudOSRuntimeId,
  SynCloudOSRuntimeStore as SynCloudOSRuntimeStoreContract,
} from "./runtimeInstanceTypes";
import { getInitialLocaleServicesSnapshot } from "../LocaleServices/localeRegistry";

const runtimeDraftState = Symbol("SynCloudOS.runtimeDraftState");

type RuntimeDraftObject = object;

interface RuntimeDraftState<T extends RuntimeDraftObject = RuntimeDraftObject> {
  base: T;
  copy: T;
  modified: boolean;
  drafts: Map<PropertyKey, RuntimeDraftObject>;
  assigned: Map<PropertyKey, boolean>;
}
function isRuntimeDraftable(value: unknown): value is RuntimeDraftObject {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function shallowCopyRuntimeValue<T extends RuntimeDraftObject>(value: T): T {
  return (Array.isArray(value) ? value.slice() : { ...(value as Record<PropertyKey, unknown>) }) as T;
}

function getRuntimeDraftState(value: unknown): RuntimeDraftState | null {
  if (!value || typeof value !== "object") return null;
  return (value as { [runtimeDraftState]?: RuntimeDraftState })[runtimeDraftState] ?? null;
}

function unwrapRuntimeDraftValue<T>(value: T): T {
  const state = getRuntimeDraftState(value);
  if (state) return finishRuntimeDraft(value as RuntimeDraftObject) as T;

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const unwrapped = unwrapRuntimeDraftValue(item);
      if (!Object.is(unwrapped, item)) changed = true;
      return unwrapped;
    });
    return (changed ? next : value) as T;
  }

  if (isRuntimeDraftable(value)) {
    let changed = false;
    const next: Record<PropertyKey, unknown> = {};
    Reflect.ownKeys(value).forEach((key) => {
      const item = (value as Record<PropertyKey, unknown>)[key];
      const unwrapped = unwrapRuntimeDraftValue(item);
      if (!Object.is(unwrapped, item)) changed = true;
      next[key] = unwrapped;
    });
    return (changed ? next : value) as T;
  }

  return value;
}

function createRuntimeDraft<T extends RuntimeDraftObject>(base: T): T {
  const state: RuntimeDraftState<T> = {
    base,
    copy: shallowCopyRuntimeValue(base),
    modified: false,
    drafts: new Map(),
    assigned: new Map()
  };

  return new Proxy(state.copy, {
    get(target, property, receiver) {
      if (property === runtimeDraftState) return state;
      const value = Reflect.get(target, property, receiver);
      if (!isRuntimeDraftable(value)) return value;

      const existing = state.drafts.get(property);
      if (existing) return existing;

      const draft = createRuntimeDraft(value);
      state.drafts.set(property, draft);
      return draft;
    },
    set(target, property, value, receiver) {
      state.modified = true;
      state.assigned.set(property, true);
      state.drafts.delete(property);
      return Reflect.set(target, property, unwrapRuntimeDraftValue(value), receiver);
    },
    deleteProperty(target, property) {
      state.modified = true;
      state.assigned.set(property, false);
      state.drafts.delete(property);
      return Reflect.deleteProperty(target, property);
    }
  }) as T;
}

function finishRuntimeDraft<T extends RuntimeDraftObject>(draft: T): T {
  const state = getRuntimeDraftState(draft);
  if (!state) return draft;

  let changed = state.modified;

  state.drafts.forEach((childDraft, property) => {
    if (state.assigned.get(property) === false) return;

    const child = finishRuntimeDraft(childDraft);
    const baseChild = (state.base as Record<PropertyKey, unknown>)[property];
    if (!Object.is(child, baseChild)) {
      changed = true;
      (state.copy as Record<PropertyKey, unknown>)[property] = child;
    }
  });

  return (changed ? state.copy : state.base) as T;
}

/** Returns `snapshot` itself when the mutator performed no writes. Any
 * assignment or deletion, even of an equal value, yields a new root. */
function produceRuntimeSnapshot(snapshot: RuntimeSnapshot, mutator: RuntimeMutator): RuntimeSnapshot {
  const draft = createRuntimeDraft(snapshot as unknown as RuntimeDraftObject);
  mutator(draft as unknown as RuntimeSnapshot);
  return finishRuntimeDraft(draft) as unknown as RuntimeSnapshot;
}

function cloneRuntimeValue<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  const state = getRuntimeDraftState(value);
  const source = state ? finishRuntimeDraft(value as RuntimeDraftObject) : value;

  if (!isRuntimeDraftable(source)) return source as T;
  const cached = seen.get(source);
  if (cached) return cached as T;

  const clone = shallowCopyRuntimeValue(source);
  seen.set(source, clone);

  Reflect.ownKeys(clone).forEach((key) => {
    (clone as Record<PropertyKey, unknown>)[key] = cloneRuntimeValue(
      (clone as Record<PropertyKey, unknown>)[key],
      seen
    );
  });

  return clone as T;
}

function createInitialRuntimeSnapshot(runtimeId: string, seed: Partial<RuntimeSnapshot> = {}): RuntimeSnapshot {
  return {
  runtimeId,
  rawApps: {},
  appInfo: {},
  lifecycle: {},
  managers: {},
  lifecycleEvents: [],
  services: {},
  statechart: {
    currentState: "booting",
    previousState: null,
    history: [],
    lastTransitionAt: null,
    isTransitioning: false
  },
  errors: [],
  notifications: [],
  application: {
    activeAppId: null,
    previousAppId: null,
    openAppIds: [],
    launchingAppId: null,
    suspendedAppIds: [],
    failedAppIds: [],
    lastLifecycleEvent: null,
    currentAppId: null,
    pendingAppId: null,
    lastActiveAppId: null,
    routePath: "/",
    multiSwitch: {
      id: null,
      status: "idle",
      fromAppId: null,
      toAppId: null,
      fromRoute: null,
      toRoute: null,
      source: null,
      startedAt: null,
      completedAt: null
    }
  },
  webspring: {
    hoveredAppId: null,
    openFolderId: null,
    selectedAppId: null,
    focusedAppId: null,
    launchingAppId: null,
    launchTransitionId: null,
    presentationSettlementId: null,
    launchPhase: "idle",
    returningAppId: null,
    returnTransitionId: null,
    activeIndicatorId: null,
    selectorAngle: 180,
    selectorPosition: null,
    lowerShelfMode: "news",
    previewAppId: null,
    hoverLabelAppId: null,
    isBooted: false,
    isAnimating: false,
    isAppContainerOpen: false,
    focusIndex: -1,
    layout: {
      preference: {
        version: 5,
        order: [],
        folders: {},
        board: { version: 1, pageSize: 20, dockSize: 4 },
        updatedAt: null,
        source: "seed"
      },
      folderConfiguration: { editable: false, initial: [] },
      isEditing: false,
      draggingItemId: null,
      dropTargetId: null,
      keyboardAppId: null,
      launchSuppressedUntil: null,
      lastCommittedAt: null
    },
    lastRefreshAt: 0
  },
  responsive: {
    mode: "desktop",
    width: 1440,
    height: 900,
    prefersReducedMotion: false
  },
  localeServices: getInitialLocaleServicesSnapshot(),
  loginServices: {
    isAuthorised: false,
    status: "locked",
    synId: null,
    accessClass: null,
    displayName: null,
    sessionId: null,
    storage: null,
    authorisedAt: null,
    expiresAt: null,
    lastCheckedAt: null,
    lastFailureReason: null,
    configuration: {
      passwordConfigured: false,
      teamPasswordConfigured: false,
      externalPasswordConfigured: false,
      synIdRequired: false
    }
  },
  lifecycleOperations: [],
  booted: false,
  ...seed,
  };
}

const initialSnapshot = createInitialRuntimeSnapshot("runtime:legacy-compatibility");

export class SynCloudOSRuntimeStore implements SynCloudOSRuntimeStoreContract {
  readonly runtimeId: SynCloudOSRuntimeId;
  private snapshot: RuntimeSnapshot;
  private listeners = new Set<RuntimeListener>();
  private batchDepth = 0;
  private batchDraft: RuntimeSnapshot | null = null;
  private batchChanged = false;
  private disposed = false;

  constructor(runtimeId: SynCloudOSRuntimeId, seed: Partial<RuntimeSnapshot> = {}) {
    this.runtimeId = runtimeId;
    this.snapshot = createInitialRuntimeSnapshot(runtimeId, seed);
  }

  getSnapshot = () => this.batchDraft ?? this.snapshot;

  cloneSnapshot = () => cloneRuntimeSnapshot(this.getSnapshot());

  createCheckpoint = () => this.cloneSnapshot();

  subscribe = (listener: RuntimeListener) => {
    if (this.disposed) return () => false;
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  listenerCount = () => this.listeners.size;

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  mutate = (mutator: RuntimeMutator) => {
    if (this.disposed) return;
    if (this.batchDepth > 0) {
      if (!this.batchDraft) this.batchDraft = createRuntimeDraft(this.snapshot as unknown as RuntimeDraftObject) as unknown as RuntimeSnapshot;
      mutator(this.batchDraft);
      this.batchChanged = true;
      return;
    }

    const next = produceRuntimeSnapshot(this.snapshot, mutator);
    // A mutator that wrote nothing is not a publication: the snapshot keeps
    // its identity and no listener runs.
    if (next === this.snapshot) return;
    this.snapshot = next;
    this.emit();
  };

  replaceSnapshot = (snapshot: RuntimeSnapshot) => {
    if (this.disposed) return;
    if (this.batchDepth > 0) {
      this.batchDraft = createRuntimeDraft(cloneRuntimeSnapshot(snapshot) as unknown as RuntimeDraftObject) as unknown as RuntimeSnapshot;
      this.batchChanged = true;
      return;
    }

    this.snapshot = cloneRuntimeSnapshot(snapshot);
    this.emit();
  };

  batch = <T,>(callback: () => T): T => {
    const outerBatch = this.batchDepth === 0;
    if (outerBatch) {
      this.batchDraft = createRuntimeDraft(this.snapshot as unknown as RuntimeDraftObject) as unknown as RuntimeSnapshot;
      this.batchChanged = false;
    }

    this.batchDepth += 1;
    try {
      const result = callback();
      this.batchDepth -= 1;

      if (outerBatch) {
        const draft = this.batchDraft;
        const changed = this.batchChanged;
        this.batchDraft = null;
        this.batchChanged = false;
        if (changed && draft) {
          const next = finishRuntimeDraft(draft as unknown as RuntimeDraftObject) as unknown as RuntimeSnapshot;
          if (next !== this.snapshot) {
            this.snapshot = next;
            this.emit();
          }
        }
      }

      return result;
    } catch (error) {
      this.batchDepth -= 1;
      if (outerBatch) {
        this.batchDraft = null;
        this.batchChanged = false;
      }
      throw error;
    }
  };

  restore = (snapshot: RuntimeSnapshot) => this.replaceSnapshot(snapshot);

  dispose() {
    this.disposed = true;
    this.listeners.clear();
    this.batchDraft = null;
    this.batchDepth = 0;
    this.batchChanged = false;
  }
}

export function createRuntimeStore(
  runtimeId: SynCloudOSRuntimeId,
  seed: Partial<RuntimeSnapshot> = {},
): SynCloudOSRuntimeStoreContract {
  return new SynCloudOSRuntimeStore(runtimeId, seed);
}

export function cloneRuntimeSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  return cloneRuntimeValue(snapshot);
}

export function shallowEqualRuntimeSelection<T>(left: T, right: T) {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false;
  }

  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = Reflect.ownKeys(leftRecord);
  const rightKeys = Reflect.ownKeys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key) && Object.is(leftRecord[key], rightRecord[key]));
}

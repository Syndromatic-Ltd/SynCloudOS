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

import { vi } from "vitest";
import {
  ScreenService,
  WindowContentRegistry,
  WindowManager,
  resolveWindowPersistenceNamespace,
  type CreateWindowRequest,
  type WindowContentController,
  type WindowContentDescriptor,
  type WindowContentFactoryRegistration,
  type WindowIdPort,
  type WindowManagerDependencies,
  type WindowRestorationPersistencePort,
} from "../../src/SynCloudOS/Windows";
import type { SynCloudOSRuntimeEnvironment } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createTestRuntime, createTestRuntimeEnvironment } from "../runtime/helpers";
import { noteType } from "./noteDocumentType";

export function standardWindow(
  id: string,
  overrides: Partial<CreateWindowRequest> = {},
): CreateWindowRequest {
  return {
    id,
    workspaceId: "workspace-main",
    applicationId: "com.syndromatic.Notes",
    applicationSessionId: "session-notes",
    documentId: null,
    documentAssociationRole: null,
    representedDocument: null,
    toolbar: null,
    role: "standard",
    style: ["titled", "closable", "minimisable", "resizable", "zoomable"],
    title: id,
    content: { rendererId: "test-window", parameters: { id } },
    bounds: { x: 80, y: 60, width: 720, height: 520 },
    minimumSize: { width: 240, height: 160 },
    maximumSize: null,
    level: "normal",
    parentWindowControllerId: null,
    anchor: null,
    pinned: false,
    mobilePolicy: "fullscreen",
    restorationKey: `test.${id}`,
    ...overrides,
  };
}

export function panelWindow(id: string, overrides: Partial<CreateWindowRequest> = {}): CreateWindowRequest {
  return standardWindow(id, {
    role: "panel",
    style: ["titled", "closable", "resizable"],
    level: "floating",
    mobilePolicy: "sheet",
    ...overrides,
  });
}

export function sheetWindow(
  id: string,
  parentWindowControllerId: string,
  overrides: Partial<CreateWindowRequest> = {},
): CreateWindowRequest {
  return standardWindow(id, {
    role: "sheet",
    style: ["titled", "closable"],
    level: "modal",
    parentWindowControllerId,
    mobilePolicy: "sheet",
    ...overrides,
  });
}

export function modalWindow(
  id: string,
  parentWindowControllerId: string | null = null,
  overrides: Partial<CreateWindowRequest> = {},
): CreateWindowRequest {
  return standardWindow(id, {
    role: "modal",
    style: ["titled", "closable"],
    level: "modal",
    parentWindowControllerId,
    mobilePolicy: "sheet",
    ...overrides,
  });
}

export function popoverWindow(
  id: string,
  parentWindowControllerId: string,
  anchorId = "toolbar-share",
  overrides: Partial<CreateWindowRequest> = {},
): CreateWindowRequest {
  return standardWindow(id, {
    role: "popover",
    style: ["closable"],
    level: "floating",
    parentWindowControllerId,
    anchor: {
      id: anchorId,
      rect: { x: 200, y: 40, width: 44, height: 44 },
      edge: "block-end",
      alignment: "center",
      offset: 8,
    },
    mobilePolicy: "popover-to-sheet",
    ...overrides,
  });
}

function defaultContentController(
  descriptor: WindowContentDescriptor,
  windowControllerId: string,
): WindowContentController {
  return {
    mountKey: `test-window:${windowControllerId}`,
    responderId: `control:${windowControllerId}:content`,
    load: vi.fn(async () => undefined),
    prepareClose: vi.fn(async () => ({
      status: "ready" as const,
      token: `content-close:${windowControllerId}`,
      commit: vi.fn(),
      rollback: vi.fn(),
    })),
    unload: vi.fn(),
    dispose: vi.fn(),
  };
}

export function createWindowTestDependencies(options: {
  readonly id?: string;
  readonly environment?: SynCloudOSRuntimeEnvironment;
  readonly contentFactory?: (descriptor: WindowContentDescriptor, windowControllerId: string) => WindowContentController;
  readonly contentRestore?: WindowContentFactoryRegistration["restore"];
  readonly namespace?: string;
  readonly installationId?: string | null;
  readonly persistence?: WindowRestorationPersistencePort;
  readonly now?: () => number;
  readonly idFactory?: (kind: Parameters<WindowIdPort["next"]>[0]) => string;
  readonly observeError?: WindowManagerDependencies["observeError"];
} = {}): WindowManagerDependencies & {
  readonly runtime: ReturnType<typeof createTestRuntime>;
  readonly manager: WindowManager;
  createDocument(documentId: string): Promise<void>;
  cleanup(): Promise<void>;
} {
  const environment = options.environment ?? createTestRuntimeEnvironment();
  const runtime = createTestRuntime({ id: options.id, environment, applicationDocuments: { initialAdapters: [] } });
  runtime.documents.registerType(noteType);
  const screen = new ScreenService(environment);
  const content = new WindowContentRegistry();
  content.register({
    typeId: "test-window",
    create: ({ descriptor, windowControllerId }) => (
      options.contentFactory?.(descriptor, windowControllerId) ?? defaultContentController(descriptor, windowControllerId)
    ),
    ...(options.contentRestore ? { restore: options.contentRestore } : {}),
  });
  let sequence = 0;
  const ids: WindowIdPort = { next: (kind) => options.idFactory?.(kind) ?? `${kind}:${++sequence}` };
  const values = new Map<string, unknown>();
  const persistence = options.persistence ?? {
    read: (key: "windows.installation-id" | "windows.workspace-v1") => values.get(key) ?? null,
    write: (key: "windows.installation-id" | "windows.workspace-v1", value: import("../../src/SynCloudOS/Windows").WindowSerializableValue) => {
      values.set(key, value);
    },
  };
  const dependencies: WindowManagerDependencies = {
    runtimeId: runtime.runtimeId,
    operations: runtime.operations,
    commands: runtime.commands,
    responders: runtime.responders,
    focus: runtime.focus,
    keyBindings: runtime.keyBindings,
    undo: runtime.undo,
    documents: runtime.documents,
    screen,
    content,
    ids,
    restoration: {
      namespace: resolveWindowPersistenceNamespace(options.namespace ?? "tests.windows"),
      persistence,
      installationIdentity: {
        getOrCreate({ persistence: target, create }) {
          const existing = target.read("windows.installation-id");
          if (existing !== null) {
            if (typeof existing !== "string" || existing.length === 0) throw new TypeError("Invalid test installation identity.");
            return existing;
          }
          const installationId = options.installationId === null
            ? create()
            : options.installationId ?? "installation-test";
          target.write("windows.installation-id", installationId);
          return installationId;
        },
      },
      clock: { now: options.now ?? (() => 0) },
      ids,
    },
    requestFrame: environment.requestAnimationFrame,
    cancelFrame: environment.cancelAnimationFrame,
    observeError: options.observeError,
  };
  const manager = new WindowManager(dependencies);
  return {
    ...dependencies,
    runtime,
    manager,
    async createDocument(documentId: string) {
      await runtime.documents.newDocument({ documentId, typeId: noteType.id, applicationId: "com.syndromatic.Notes" });
    },
    async cleanup() {
      manager.dispose();
      await runtime.dispose("window-manager-test");
    },
  };
}

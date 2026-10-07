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

// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createSynWareContextValue } from "../../src/SynCloudOS/AppSDK/createSynWareContextValue";
import type { DocumentType } from "../../src/SynCloudOS/Documents";
import { InMemoryDocumentAdapter } from "../../src/SynCloudOS/Documents/Adapters";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import {
  createTestRuntime,
  createTestRuntimeEnvironment,
  mountTestSynWareRuntime,
  registerTestSynWare,
} from "./helpers";

interface ProjectionFacadeModel {
  readonly version: 1;
  readonly text: string;
}

const projectionFacadeType: DocumentType<ProjectionFacadeModel> = Object.freeze({
  id: "tests.projection-facade-document",
  displayName: "Projection facade document",
  schemaVersion: 1,
  extensions: Object.freeze([".projection-facade-test"]),
  mimeTypes: Object.freeze(["application/x-syncloudos-projection-facade-test"]),
  creatingApplicationId: "projection-owner",
  openingApplicationIds: Object.freeze(["projection-owner"]),
  capabilities: Object.freeze({ versions: true, conflicts: true }),
  autosave: "disabled",
  create: () => Object.freeze({ version: 1, text: "Untitled" }),
  read: (value) => structuredClone(value),
  write: (value) => structuredClone(value),
  validate: (value): value is ProjectionFacadeModel => Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
    (value as Partial<ProjectionFacadeModel>).version === 1 &&
    typeof (value as Partial<ProjectionFacadeModel>).text === "string",
  ),
});

const activeRuntimes: SynCloudOSRuntime[] = [];
const activeMounts: ReturnType<typeof mountTestSynWareRuntime>[] = [];

afterEach(async () => {
  for (const mounted of activeMounts.splice(0)) mounted.dispose("test complete");
  for (const runtime of activeRuntimes.splice(0)) await runtime.dispose("test complete");
});

function createProjectionFacadeFixture() {
  const environment = createTestRuntimeEnvironment();
  const runtime = createTestRuntime({
    id: "runtime:projection-facade",
    environment,
    applicationDocuments: {
      initialTypes: [projectionFacadeType],
      initialAdapters: [new InMemoryDocumentAdapter(environment)],
    },
  });
  activeRuntimes.push(runtime);
  registerTestSynWare(runtime, {
    schemaVersion: 1,
    id: "projection-owner",
    version: "1.0.0",
    title: "Projection Owner",
    routes: [{ path: "/projection-owner", primary: true }],
    windowDefaults: {
      title: "Projection Owner",
      width: 640,
      height: 480,
      minimumWidth: 400,
      minimumHeight: 300,
      resizable: true,
    },
    documentTypes: [{ id: projectionFacadeType.id, displayName: projectionFacadeType.displayName }],
  });
  const mount = mountTestSynWareRuntime(runtime, "projection-owner");
  activeMounts.push(mount);
  return createSynWareContextValue(mount.runtime).documents.workspaceDocuments;
}

describe("projection facade", () => {
  it("mints app-owned read-only projections", async () => {
    const workspaceDocuments = createProjectionFacadeFixture();
    const snapshot = await workspaceDocuments.newProjectionDocument<ProjectionFacadeModel>({
      documentId: "facade-projection",
      typeId: projectionFacadeType.id,
      initialModel: { version: 1, text: "Published" },
    });
    expect(snapshot).toMatchObject({
      id: "facade-projection",
      applicationId: "projection-owner",
      documentKind: "projection",
      readOnly: true,
      dirtyRevision: 0,
    });
  });

  it("rejects caller-supplied ownership, location and kind fields", async () => {
    const workspaceDocuments = createProjectionFacadeFixture();
    const base = {
      documentId: "facade-spoof",
      typeId: projectionFacadeType.id,
      initialModel: { version: 1, text: "Published" },
    };
    await expect(workspaceDocuments.newProjectionDocument({
      ...base, applicationId: "someone-else",
    } as never)).rejects.toThrow(/another application/);
    await expect(workspaceDocuments.newProjectionDocument({
      ...base, location: { kind: "memory", namespace: "x", key: "y" },
    } as never)).rejects.toThrow(/save location/);
    await expect(workspaceDocuments.newProjectionDocument({
      ...base, documentKind: "projection",
    } as never)).rejects.toThrow(/kernel-minted/);
  });

  it("rejects unknown fields and a missing model", async () => {
    const workspaceDocuments = createProjectionFacadeFixture();
    await expect(workspaceDocuments.newProjectionDocument({
      documentId: "facade-unknown",
      typeId: projectionFacadeType.id,
      initialModel: { version: 1, text: "Published" },
      smuggled: true,
    } as never)).rejects.toThrow(/must not carry "smuggled"/);
    await expect(workspaceDocuments.newProjectionDocument({
      documentId: "facade-nomodel",
      typeId: projectionFacadeType.id,
    } as never)).rejects.toThrow(/initialModel/);
  });

  it("rejects projection mutations through the facade", async () => {
    const workspaceDocuments = createProjectionFacadeFixture();
    const snapshot = await workspaceDocuments.newProjectionDocument<ProjectionFacadeModel>({
      documentId: "facade-immutable",
      typeId: projectionFacadeType.id,
      initialModel: { version: 1, text: "Published" },
    });
    expect(() => workspaceDocuments.updateDocument<ProjectionFacadeModel>(
      snapshot.id,
      (model) => ({ ...model, text: "edited" }),
      { actionName: "Type" },
    )).toThrow(/read-only projection/);
    expect(() => workspaceDocuments.synchroniseDocument<ProjectionFacadeModel>(
      snapshot.id,
      (model) => ({ ...model, text: "synced" }),
    )).toThrow(/read-only projection/);
    await expect(workspaceDocuments.saveDocument(snapshot.id)).rejects.toThrow(/read-only projection/);
  });
});

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

import { describe, expect, it } from "vitest";
import { createConformanceInspectorSnapshot } from "../../src/SynCloudOS/Inspector/createConformanceInspectorSnapshot";
import { deriveConformanceInspectorCaptureNamespace, sha256Hex } from "../../src/SynCloudOS/Inspector/conformanceInspectorProducer";
import { isConformanceInspectorReference, isConformanceInspectorSnapshot } from "../../src/SynCloudOS/Inspector/conformanceInspectorValidation";
import type { ConformanceInspectorSnapshot, ConformanceInspectorSnapshotPort } from "../../src/SynCloudOS/Inspector/conformanceInspectorTypes";
import { createTestManifest, createTestRuntime, createTestRuntimeEnvironment } from "./helpers";
import { noteType } from "../fixtures/noteDocumentType";
import { standardWindow } from "../fixtures/windowTestDependencies";

const compileOnlySnapshot = null as unknown as ConformanceInspectorSnapshot;
const compileOnlyPort = {
  getConformanceSnapshot: () => compileOnlySnapshot,
  refreshConformanceSnapshot: async () => compileOnlySnapshot,
  exportConformanceSnapshot: () => ({ fileName: "syncloudos-conformance-snapshot.json" as const, content: "{}", bytes: 2 }),
} satisfies ConformanceInspectorSnapshotPort;
// @ts-expect-error A producer must implement every typed read-only operation;
// partial duck-typed sources cannot become an inspector port.
const incompleteCompileOnlyPort: ConformanceInspectorSnapshotPort = { getConformanceSnapshot: () => compileOnlySnapshot };
void compileOnlyPort;
void incompleteCompileOnlyPort;

describe("Conformance inspector snapshot", () => {
  it("correlates the complete runtime graph without private content", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-inspector" });
    runtime.responders.register({
      id: "journal-editor",
      kind: "control",
      parentId: "workspace",
      scopeId: "journal",
    });
    runtime.focus.requestFocus("journal-editor");
    runtime.errors.capture({
      code: "TEST_SECRET",
      title: "Sensitive fixture",
      message: "secret body",
      source: "tests",
    });
    runtime.events.publish("clipboard.changed", { value: "clipboard secret" });

    const snapshot = createConformanceInspectorSnapshot(runtime);

    expect(snapshot.runtimeId).toMatch(/^ref-/);
    expect(snapshot.activeResponder).toMatchObject({ id: expect.stringMatching(/^ref-/) });
    expect(snapshot.lifecycle.timeline.length).toBeLessThanOrEqual(200);
    expect(snapshot.adapters.every(({ status }) => status !== "unknown")).toBe(true);
    expect(snapshot.appearance.unresolvedAssetSlots).toEqual([]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("secret body");
    expect(JSON.stringify(snapshot)).not.toContain("clipboard secret");
  });

  it("bounds unordered data deterministically and does not retain snapshot references", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-bounds" });
    for (let index = 0; index < 240; index += 1) {
      runtime.events.publish("lifecycle.emit", { appId: `app-${index}`, value: `private-${index}` });
    }

    const first = createConformanceInspectorSnapshot(runtime, { limits: { lifecycle: 5 } });
    const second = createConformanceInspectorSnapshot(runtime, { limits: { lifecycle: 5 } });

    expect(first.lifecycle.timeline).toHaveLength(5);
    expect(second.sequence).toBe(first.sequence + 1);
    expect(second.lifecycle.timeline.map(({ type, appId, at }) => ({ type, appId, at }))).toEqual(
      first.lifecycle.timeline.map(({ type, appId, at }) => ({ type, appId, at })),
    );
    expect(second.lifecycle.timeline.map(({ id }) => id)).not.toEqual(first.lifecycle.timeline.map(({ id }) => id));
    expect(first).not.toBe(second);
    expect(JSON.stringify(first)).not.toContain("private-239");
  });

  it("bounds published appearance evidence and reports an incomplete aggregate truthfully", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-appearance-bound" });
    const releaseFacts = Array.from({ length: 22 }, (_, index) => runtime.inspector.registerConformanceAppearanceFact({
      slot: `gallery.bound.${String(index).padStart(2, "0")}`,
      status: index === 1 ? "unresolved" : index === 2 ? "provenance-violation" : "covered",
    }));
    const expectedSlots = Array.from({ length: 20 }, (_, index) => `gallery.bound.${String(index).padStart(2, "0")}`);

    try {
      const fullLimit = createConformanceInspectorSnapshot(runtime);
      const smallerLimit = createConformanceInspectorSnapshot(runtime, { limits: { data: 2 } });
      const zeroLimit = createConformanceInspectorSnapshot(runtime, { limits: { data: 0 } });

      expect(fullLimit.appearance.galleryCoverage.map(({ slot }) => slot)).toEqual(expectedSlots);
      expect(fullLimit.appearance.unresolvedAssetSlots).toEqual(["gallery.bound.01"]);
      expect(fullLimit.appearance.provenanceViolations).toEqual(["gallery.bound.02"]);
      expect(fullLimit.metadata.sections).toContainEqual(expect.objectContaining({
        id: "appearance", status: "truncated", total: 23, returned: 21, redacted: 20,
      }));
      expect(fullLimit.metadata.complete).toBe(false);

      expect(smallerLimit.appearance.galleryCoverage.map(({ slot }) => slot)).toEqual(expectedSlots.slice(0, 2));
      expect(smallerLimit.appearance.unresolvedAssetSlots).toEqual(["gallery.bound.01"]);
      expect(smallerLimit.appearance.provenanceViolations).toEqual([]);
      expect(smallerLimit.metadata.sections).toContainEqual(expect.objectContaining({
        id: "appearance", status: "truncated", total: 23, returned: 3, redacted: 2,
      }));

      expect(zeroLimit.appearance.galleryCoverage).toEqual([]);
      expect(zeroLimit.appearance.unresolvedAssetSlots).toEqual([]);
      expect(zeroLimit.appearance.provenanceViolations).toEqual([]);
      expect(zeroLimit.metadata.sections).toContainEqual(expect.objectContaining({
        id: "appearance", status: "truncated", total: 23, returned: 1, redacted: 0,
      }));
    } finally {
      releaseFacts.forEach((release) => release());
    }
  });

  it("uses opaque per-capture pseudonyms while retaining within-snapshot identity joins", () => {
    const environment = createTestRuntimeEnvironment();
    environment.randomUUID.mockReturnValue("repeating-inspector-capture-nonce");
    const runtime = createTestRuntime({ id: "runtime:conformance-salted-references", environment });
    runtime.apps.register(createTestManifest({ id: "same-private-identity" }));

    const first = createConformanceInspectorSnapshot(runtime);
    const second = createConformanceInspectorSnapshot(runtime);
    const third = createConformanceInspectorSnapshot(runtime);
    const firstRoute = first.navigation.routes.find(({ kind }) => kind === "internal");
    const firstCapability = first.capabilities.find(({ capability }) => capability === "app.open.public");
    const secondRoute = second.navigation.routes.find(({ kind }) => kind === "internal");

    expect(firstRoute?.id).toMatch(/^ref-[a-f0-9]{32}-[1-9][0-9]*$/);
    expect(firstCapability?.id).toBe(firstRoute?.id);
    expect(secondRoute?.id).not.toBe(firstRoute?.id);
    expect(second.runtimeId).not.toBe(first.runtimeId);
    expect(third.runtimeId).not.toBe(second.runtimeId);
    const captureNamespace = (reference: string) => reference.split("-")[1];
    expect(captureNamespace(first.runtimeId)).toBe(captureNamespace(firstRoute!.id));
    expect(captureNamespace(second.runtimeId)).toBe(captureNamespace(secondRoute!.id));
    expect(captureNamespace(second.runtimeId)).not.toBe(captureNamespace(first.runtimeId));
    expect(captureNamespace(third.runtimeId)).not.toBe(captureNamespace(second.runtimeId));
    expect(isConformanceInspectorSnapshot(first)).toBe(true);
    expect(isConformanceInspectorSnapshot(second)).toBe(true);
    expect(JSON.parse(runtime.inspector.exportConformanceSnapshot(first).content).runtimeId).toBe(first.runtimeId);
    expect(JSON.parse(runtime.inspector.exportConformanceSnapshot(second).content).runtimeId).toBe(second.runtimeId);
  });

  it("derives collision-resistant opaque capture namespaces and rejects legacy wire references", () => {
    const nonce = "00000000-0000-4000-8000-2b432b48b8ba";
    const first = deriveConformanceInspectorCaptureNamespace(nonce, 978);
    const second = deriveConformanceInspectorCaptureNamespace(nonce, 62022);

    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(second).toMatch(/^[a-f0-9]{32}$/);
    expect(first).not.toBe(second);
    expect(deriveConformanceInspectorCaptureNamespace(nonce, 978)).toBe(first);
    expect(isConformanceInspectorReference(`ref-${first}-1`)).toBe(true);
    expect(isConformanceInspectorReference("ref-790525824-1")).toBe(false);
    expect(isConformanceInspectorReference(`ref-${"a".repeat(31)}-1`)).toBe(false);
  });

  it("uses the live PolicyKit decision when no legacy override is present", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-policy" });
    runtime.apps.register(createTestManifest({
      id: "requires-login",
      policy: { requiresLogin: true },
    }));

    const snapshot = createConformanceInspectorSnapshot(runtime);

    expect(snapshot.capabilities).toContainEqual(expect.objectContaining({
      capability: "app.open.public",
      status: "denied",
    }));
  });

  it("reads typed document, presentation, and resource ports", async () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-live-graph" });
    runtime.documents.registerType(noteType);
    const document = await runtime.documents.newDocument({ documentId: "inspector-note", typeId: noteType.id });
    document.update((model) => ({ ...model, body: "Dirty but never exported" }), { actionName: "Type" });
    const content = { rendererId: "application", parameters: { appId: "inspector" } } as const;
    const panel = runtime.windows.create(standardWindow("inspector-panel", {
      role: "panel",
      level: "floating",
      mobilePolicy: "sheet",
      content,
    }));
    await runtime.windows.open(panel.id);
    const parent = runtime.windows.create(standardWindow("inspector-parent", { content }));
    await runtime.windows.open(parent.id);
    const sheet = runtime.windows.create(standardWindow("inspector-sheet", {
      role: "sheet",
      parentWindowControllerId: parent.id,
      level: "modal",
      mobilePolicy: "sheet",
      content,
    }));
    await runtime.windows.open(sheet.id);
    const snapshot = createConformanceInspectorSnapshot(runtime);

    expect(snapshot.documents).toContainEqual(expect.objectContaining({
      state: "dirty",
      dirty: true,
      recovery: "none",
      dirtyRevision: expect.any(Number),
    }));
    expect(snapshot.panels).toContainEqual(expect.objectContaining({ role: "panel", state: "open" }));
    expect(snapshot.overlays).toContainEqual(expect.objectContaining({ kind: "sheet", state: "open" }));
    expect(snapshot.runtime.ownedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "images.decoded", kind: "image" }),
      expect.objectContaining({ id: "documents", kind: "document", count: 1 }),
    ]));
    expect(snapshot.metadata.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "documents", status: "complete", total: 1 }),
      expect.objectContaining({ id: "panels", status: "complete", total: 1 }),
      expect.objectContaining({ id: "overlays", status: "complete", total: 1 }),
    ]));
  });

  it("pseudonymises bounded colour-panel identities and reports output limits", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-redaction" });
    const secret = `private-picker-${"x".repeat(320)}`;
    runtime.colourPanel.registerPicker({ id: secret, label: secret, order: 1, supportedSpaces: ["srgb"] });
    runtime.colourPanel.activateTarget({
      id: `private-target-${"y".repeat(320)}`,
      responderId: "private-responder",
      read: () => "#123456",
      preview: () => undefined,
      commit: () => undefined,
      cancel: () => undefined,
    });
    runtime.colourPanel.open();
    runtime.apps.register(createTestManifest({ id: "metadata-app" }));

    const snapshot = createConformanceInspectorSnapshot(runtime, { limits: { data: 0 } });

    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(snapshot.colourPanel.pickerId).toMatch(/^ref-/);
    expect(snapshot.colourPanel.targetOwner).toMatch(/^ref-/);
    expect(snapshot.metadata.sections).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "lifecycle.apps", status: "truncated", returned: 0 }),
      expect.objectContaining({ id: "colourPanel", redacted: 2 }),
    ]));
    expect(snapshot.metadata.complete).toBe(false);
  });

  it("cancels stale refreshes and rejects unsafe snapshot exports", async () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-refresh" });
    const { inspector } = runtime;
    const controller = new AbortController();
    const refresh = inspector.refreshConformanceSnapshot({ signal: controller.signal });
    controller.abort();

    await expect(refresh).rejects.toMatchObject({ name: "AbortError" });

    const safeSnapshot = createConformanceInspectorSnapshot(runtime);
    expect(() => inspector.exportConformanceSnapshot({
      ...safeSnapshot,
      colourPanel: { ...safeSnapshot.colourPanel, pickerId: "private-export-secret" },
    })).toThrow(/redact|inspect|snapshot/i);
  });

  it("rejects attacker-shaped exports with raw identities in every inspected section", () => {
    const runtime = createTestRuntime({ id: "runtime:conformance-export-boundary" });
    const safeSnapshot = createConformanceInspectorSnapshot(runtime);
    const secret = "auth-token:customer-123";
    const attackerSnapshot: ConformanceInspectorSnapshot = {
      ...safeSnapshot,
      navigation: {
        ...safeSnapshot.navigation,
        routes: [{ id: secret, kind: secret, workspaceId: secret }],
      },
      responderGraph: [{ id: secret, role: secret, parentId: secret }],
      commands: [{ id: secret, enabled: true, owner: secret }],
      documents: [{ id: secret, typeId: secret, state: "dirty", dirty: true, recovery: "none", dirtyRevision: 1, recoveryVersion: null }],
      windows: [{ id: secret, role: secret, state: "open", key: true, zIndex: 0 }],
      panels: [{ id: secret, role: secret, state: "open", key: true, zIndex: 0 }],
      overlays: [{ id: secret, kind: secret, state: "open" }],
      errors: [{ id: secret, category: secret, code: secret, at: 0 }],
    };

    expect(isConformanceInspectorSnapshot(attackerSnapshot)).toBe(false);
    expect(() => runtime.inspector.exportConformanceSnapshot(attackerSnapshot)).toThrow(/redact|inspect|snapshot/i);
    const exported = runtime.inspector.exportConformanceSnapshot(safeSnapshot);
    expect(exported.content).not.toContain(secret);
  });
});

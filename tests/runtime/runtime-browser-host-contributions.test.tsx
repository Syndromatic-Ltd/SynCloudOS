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

import { describe, expect, it, vi } from "vitest";
import {
  createSynCloudOSHostContribution,
  createSynCloudOSHostInstallContext,
  prepareSynCloudOSHostContributions,
} from "../../src/SynCloudOS/HostContributions/hostContribution";
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import { createTestRuntime, unlockRuntime } from "./helpers";
import { noteType } from "../fixtures/noteDocumentType";

describe("runtime browser host contribution context", () => {
  it("projects scoped capabilities without exposing runtime authorities", async () => {
    const runtime = createTestRuntime({ id: "runtime:host-context" });
    try {
      const contribution = createSynCloudOSHostContribution("host", "tests/host", () => ({}));
      const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
      const handle = createSynCloudOSHostInstallContext(prepared!, runtime);

      expect(Object.keys(handle.context)).not.toEqual(expect.arrayContaining(["runtime", "documentStore", "windows", "commands", "transfer"]));
      expect(Object.keys(handle.context)).toEqual(expect.arrayContaining(["services", "documents", "seed", "events", "policy"]));
      expect(Object.keys(handle.context)).not.toContain("webspring");
      expect((handle.context as Record<string, unknown>).runtime).toBeUndefined();

      await handle.cleanup();
    } finally {
      await runtime.dispose();
    }
  });

  it("fences capability calls after host installation is aborted", async () => {
    const runtime = createTestRuntime({ id: "runtime:host-abort" });
    const controller = new AbortController();
    try {
      const contribution = createSynCloudOSHostContribution("host", "tests/host", () => ({}));
      const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
      const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {}, controller.signal);
      controller.abort();

      expect(() => handle.context.resources.lookup("missing")).toThrow(/aborted/iu);
      await expect(handle.runBootNotifications()).rejects.toThrow(/aborted/iu);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps service descriptors separate from app clients and cleans descriptors", async () => {
    const runtime = createTestRuntime({ id: "runtime:host-service-ports" });
    try {
      const contribution = createSynCloudOSHostContribution("host", "tests/host-services", () => ({}));
      const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
      const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {});

      handle.context.services.registerDescriptor({
        id: "tests.host-service",
        displayName: "Host Service",
        description: "A service descriptor supplied by a host contribution.",
        availability: "available",
      });
      handle.context.services.registerClient({
        id: "tests.host-service",
        version: "1.0.0",
        createAppClient: () => Object.freeze({ ready: true }),
      });

      expect(runtime.services.getService("tests.host-service")).toMatchObject({
        id: "tests.host-service",
        displayName: "Host Service",
      });
      expect(handle.context.services.has("tests.host-service")).toBe(true);
      await handle.cleanup();
      expect(runtime.services.getService("tests.host-service")).toBeNull();
    } finally {
      await runtime.dispose();
    }
  });

  it("mints scoped DocumentStore adapters and unregisters them with the contribution", async () => {
    const runtime = createTestRuntime({ id: "runtime:host-document-store-adapter" });
    unlockRuntime(runtime);
    const typeRegistration = runtime.documents.registerType(noteType);
    try {
      const contribution = createSynCloudOSHostContribution("host", "tests/host-documents", () => ({}));
      const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
      const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {});

      handle.context.documents.registerDocumentStoreAdapter({
        id: "tests-journal-document-store",
        documentIdPrefix: "framework:journal:",
      });

      await expect(runtime.documents.newDocument({
        documentId: "host-journal-one",
        typeId: noteType.id,
        location: { kind: "document-store", documentId: "framework:journal:one" },
      })).resolves.toMatchObject({ id: "host-journal-one" });
      await expect(runtime.documents.newDocument({
        documentId: "host-syncal-denied",
        typeId: noteType.id,
        location: { kind: "document-store", documentId: "framework:syncal:calendar" },
      })).rejects.toThrow(/No document adapter supports/iu);

      await handle.cleanup();
      await expect(runtime.documents.newDocument({
        documentId: "host-journal-after-cleanup",
        typeId: noteType.id,
        location: { kind: "document-store", documentId: "framework:journal:after-cleanup" },
      })).rejects.toThrow(/No document adapter supports/iu);
    } finally {
      typeRegistration.dispose();
      await runtime.dispose();
    }
  });

  it("scopes trusted seed authority and reverses contribution role grants", async () => {
    const runtime = createTestRuntime({ id: "runtime:host-seed-authority" });
    try {
      const contribution = createSynCloudOSHostContribution("host", "tests/host-seed", () => ({
        trustedDocumentKinds: [{ kind: "tests.seed", version: 1, displayName: "Seed" }],
      }));
      const [prepared] = await prepareSynCloudOSHostContributions([contribution], runtime.environment);
      const handle = createSynCloudOSHostInstallContext(prepared!, runtime, {});

      handle.context.policy.registerRoleCapabilities({
        roles: ["employee"],
        capabilities: ["tests.seed.write", "tests.seed.write"],
      });
      expect(runtime.policy.getRoleCapabilities("employee")).toContain("tests.seed.write");
      expect(handle.context.policy.currentSubject().role).not.toBe("system");

      const seeded = await handle.context.seed.saveDraft({ kind: "tests.seed", title: "Seeded", body: "content" });
      expect(await handle.context.seed.getDraft(seeded.id)).toMatchObject({ title: "Seeded", body: "content" });
      await expect(handle.context.seed.saveDraft({ kind: "tests.foreign", body: "denied" }))
        .rejects.toMatchObject({ name: "SecurityError" });

      const forgedSubject: SynCloudOSPolicySubject = {
        user: {
          id: "forged.host-seed",
          displayName: "Forged Host Seed",
          role: "system",
          isAuthenticated: true,
          isAnonymous: false,
        },
        role: "system",
        capabilities: ["*"],
        isAuthenticated: true,
      };
      const forged = runtime.policy.authorise({
        action: "runtime.mutate",
        origin: "runtime",
        source: "tests/host-seed",
        subject: forgedSubject,
        requiredCapabilities: ["runtime.configure"],
      });
      expect(forged.allowed).toBe(false);
      expect(forged.subjectRole).toBe("public");

      await handle.cleanup();
      expect(runtime.policy.getRoleCapabilities("employee")).not.toContain("tests.seed.write");
    } finally {
      await runtime.dispose();
    }
  });
});

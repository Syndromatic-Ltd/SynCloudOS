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
import type { SynCloudOSPolicySubject } from "../../src/SynCloudOS/PolicyKit/policyTypes";
import { createTestBundle, createTestRuntime, mountTestSynWareRuntime } from "./helpers";

function forgedEmployeeSubject(): SynCloudOSPolicySubject {
  return {
    user: {
      id: "forged.employee",
      displayName: "Forged Employee",
      role: "employee",
      isAuthenticated: true,
      isAnonymous: false,
    },
    role: "employee",
    capabilities: ["*", "transfer.cross-application"],
    isAuthenticated: true,
    loginSession: {
      isAuthorised: true,
      status: "unlocked",
      synId: "forged@syndromatic.com",
      accessClass: "team",
      displayName: "Forged Employee",
    },
  };
}

describe("mounted application policy authority", () => {
  it("resolves transfer policy from host identity and reports truthful matches", async () => {
    const runtime = createTestRuntime();

    const anonymous = runtime.policy.authorise({
      action: "transfer.cross-application",
      origin: "runtime",
      source: "approval-repair.test",
      requiredCapabilities: ["transfer.cross-application"],
    });
    expect(anonymous.allowed).toBe(false);
    expect(anonymous.matchedCapabilities).toEqual([]);
    expect(anonymous.missingCapabilities).toEqual(["transfer.cross-application"]);

    const forged = runtime.policy.authorise({
      action: "transfer.cross-application",
      origin: "runtime",
      source: "approval-repair.test",
      subject: forgedEmployeeSubject(),
      requiredCapabilities: ["transfer.cross-application"],
    });
    expect(forged.allowed).toBe(false);
    expect(forged.matchedCapabilities).toEqual([]);
    expect(forged.missingCapabilities).toEqual(["transfer.cross-application"]);

    runtime.store.mutate((draft) => {
      draft.loginServices.isAuthorised = true;
      draft.loginServices.status = "unlocked";
      draft.loginServices.synId = "host@syndromatic.com";
      draft.loginServices.accessClass = "team";
      draft.loginServices.displayName = "Host Employee";
    });

    const granted = runtime.policy.authorise({
      action: "transfer.cross-application",
      origin: "runtime",
      source: "approval-repair.test",
      requiredCapabilities: ["transfer.cross-application"],
    });
    expect(granted.allowed).toBe(true);
    expect(granted.matchedCapabilities).toEqual(["transfer.cross-application"]);
    expect(granted.missingCapabilities).toEqual([]);

    const sameApplication = runtime.policy.authorise({
      action: "transfer.same-application",
      origin: "runtime",
      source: "approval-repair.test",
      requiredCapabilities: ["transfer.same-application"],
    });
    expect(sameApplication.allowed).toBe(true);

    const missingRole = runtime.policy.authorise({
      action: "transfer.cross-application",
      origin: "runtime",
      source: "approval-repair.test",
      requiredRoles: ["founder"],
    });
    expect(missingRole.allowed).toBe(false);
    expect(missingRole.matchedRoles).toEqual([]);
    expect(missingRole.missingRoles).toEqual(["founder"]);

    const missingAccessClass = runtime.policy.authorise({
      action: "transfer.cross-application",
      origin: "runtime",
      source: "approval-repair.test",
      requiredAccessClasses: ["external"],
    });
    expect(missingAccessClass.allowed).toBe(false);
    expect(missingAccessClass.matchedAccessClasses).toEqual([]);
    expect(missingAccessClass.missingAccessClasses).toEqual(["external"]);

    await runtime.dispose("approval-repair.test");
  });

  it("does not give a mounted app a caller-defined document-kind migration API", async () => {
    const migration = vi.fn(() => {
      throw new Error("untrusted migration executed");
    });
    const runtime = createTestRuntime({
      initialBundles: [createTestBundle({ bundleIdentifier: "com.example.untrusted-docs", route: "/untrusted-docs" })],
      trustedDocumentKinds: [{
        kind: "syncal.event",
        version: 1,
        displayName: "Trusted SynCal Event",
      }],
    });
    const mounted = mountTestSynWareRuntime(runtime, "com.example.untrusted-docs");
    const documentStore = mounted.runtime.documentStore as unknown as {
      registerKind?: (metadata: unknown) => unknown;
    };

    expect(documentStore.registerKind).toBeUndefined();
    expect(runtime.documentStore.getKind("syncal.event")).toMatchObject({
      kind: "syncal.event",
      displayName: "Trusted SynCal Event",
    });
    expect(() => documentStore.registerKind?.({
      kind: "syncal.unclaimed",
      version: 99,
      displayName: "Untrusted",
      migrations: [{ fromVersion: 1, toVersion: 99, migrate: migration }],
    })).not.toThrow();
    expect(runtime.documentStore.getKind("syncal.unclaimed")).toBeNull();
    expect(migration).not.toHaveBeenCalled();

    await runtime.dispose("approval-repair.test");
  });

  it("projects mounted command callbacks and admits only one accessor-free snapshot", async () => {
    const runtime = createTestRuntime({
      initialBundles: [
        createTestBundle({ bundleIdentifier: "com.example.command-attacker", route: "/command-attacker" }),
        createTestBundle({ bundleIdentifier: "com.example.command-victim", route: "/command-victim" }),
      ],
    });
    const mounted = mountTestSynWareRuntime(runtime, "com.example.command-attacker");
    const observed: Record<string, unknown> = {};
    const execute = vi.fn((context: any) => {
      observed.hasKernelRuntime = "environment" in context.runtime || "dispose" in context.runtime;
      observed.hasKernelInspector = "inspector" in context.runtime;
      observed.hasKernelUndo = context.undoManager !== null;
      observed.hasVictimTarget = typeof context.runtime.application?.closeSelf === "function";
      return { safe: context.runtime.app.bundleIdentifier };
    });
    const validate = vi.fn((context: any) => {
      observed.queryHasKernelRuntime = "environment" in context.runtime;
      return { enabled: true };
    });
    const title = vi.fn((context: any) => {
      observed.titleHasKernelRuntime = "environment" in context.runtime;
      return { key: "command.attacker", fallback: "Attacker" };
    });
    const registration = mounted.runtime.commands.register({
      id: "com.example.command-attacker.escape",
      responderId: "application:com.example.command-attacker",
      title,
      payload: { description: "No payload", parse: (value: unknown) => value === undefined ? { ok: true as const, value: undefined } : { ok: false as const, issues: ["No payload"] } },
      defaultKeyBindings: [],
      scope: "application",
      undo: { kind: "none" },
      validate,
      execute,
    });
    await expect(mounted.runtime.commands.validate("com.example.command-attacker.escape")).resolves.toMatchObject({ enabled: true });
    await expect(mounted.runtime.commands.dispatch("com.example.command-attacker.escape")).resolves.toMatchObject({ status: "executed", value: { safe: "com.example.command-attacker" } });
    expect(observed).toMatchObject({
      hasKernelRuntime: false,
      hasKernelInspector: false,
      hasKernelUndo: false,
      queryHasKernelRuntime: false,
      titleHasKernelRuntime: false,
    });
    expect(runtime.lifecycle.getState("com.example.command-victim")).not.toBe("closed");

    let getterReads = 0;
    const getterDeclaration = {
      id: "com.example.command-attacker.getter",
      responderId: "application:com.example.command-attacker",
      title: { key: "getter", fallback: "Getter" },
      payload: { description: "No payload", parse: () => ({ ok: true as const, value: undefined }) },
      defaultKeyBindings: [],
      scope: "application" as const,
      undo: { kind: "none" as const },
      execute: () => undefined,
    };
    Object.defineProperty(getterDeclaration, "id", { enumerable: true, get: () => `com.example.command-attacker.getter.${getterReads++}` });
    expect(() => mounted.runtime.commands.register(getterDeclaration as never)).toThrow(/accessor-free|accessor|plain/i);
    expect(runtime.commands.getDeclarations().some((declaration) => declaration.id.startsWith("com.example.command-attacker.getter"))).toBe(false);
    expect(getterReads).toBe(0);

    registration.dispose();
    await runtime.dispose("approval-repair.test");
  });

  it("does not restore focus from a revoked handle across a same-ID remount", async () => {
    const runtime = createTestRuntime({ initialBundles: [createTestBundle({ bundleIdentifier: "com.example.focus-owner", route: "/focus-owner" })] });
    const appResponderId = "application:com.example.focus-owner";
    const childResponderId = "focus-owner:child";
    const mounted = mountTestSynWareRuntime(runtime, "com.example.focus-owner", appResponderId);
    runtime.responders.register({ id: childResponderId, kind: "control", parentId: appResponderId, scopeId: appResponderId });

    runtime.focus.requestFocus(appResponderId);
    const retained = mounted.runtime.focus.openScope({
      id: "focus-owner:retained",
      kind: "popover",
      parentResponderId: appResponderId,
      modal: false,
      trapFocus: false,
      restoreResponderId: appResponderId,
    });
    runtime.focus.requestFocus(childResponderId);
    mounted.dispose();
    expect(() => retained.close()).not.toThrow();
    expect(() => retained.dispose()).not.toThrow();
    expect(runtime.focus.getFocusedResponderId()).toBe(childResponderId);

    const replacement = mountTestSynWareRuntime(runtime, "com.example.focus-owner", appResponderId);
    runtime.focus.requestFocus(childResponderId);
    expect(() => retained.close()).not.toThrow();
    expect(runtime.focus.getFocusedResponderId()).toBe(childResponderId);

    const liveScope = replacement.runtime.focus.openScope({
      id: "focus-owner:live",
      kind: "popover",
      parentResponderId: appResponderId,
      modal: false,
      trapFocus: false,
      restoreResponderId: appResponderId,
    });
    const nestedScope = replacement.runtime.focus.openScope({
      id: "focus-owner:nested",
      kind: "popover",
      parentScopeId: liveScope.id,
      parentResponderId: childResponderId,
      modal: false,
      trapFocus: false,
      restoreResponderId: appResponderId,
    });
    runtime.focus.requestFocus(childResponderId);
    expect(nestedScope.close().status).toBe("closed");
    expect(runtime.focus.getFocusedResponderId()).toBe(appResponderId);
    expect(liveScope.close().status).toBe("closed");
    expect(runtime.focus.getFocusedResponderId()).toBe(appResponderId);

    replacement.dispose();
    await runtime.dispose("approval-repair.test");
  });
});

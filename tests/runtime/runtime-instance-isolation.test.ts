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
import { createTestBundle } from "./helpers";
import { asPolicySubject, createTestRuntime, createTestRuntimeEnvironment, unlockRuntime } from "./helpers";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";

const systemSubject = {
  user: {
    id: "system.runtime-isolation",
    displayName: "Runtime isolation test",
    role: "system" as const,
    isAuthenticated: true,
    isAnonymous: false,
  },
  role: "system" as const,
  capabilities: ["*"],
  isAuthenticated: true,
};

// Document authority is host-issued per runtime; a grant from one runtime's
// PolicyKit means nothing to another's.
const systemDocumentContext = (runtime: SynCloudOSRuntime) => ({
  ...asPolicySubject(runtime.policy, systemSubject),
  origin: "test",
  source: "runtime-instance-isolation.test",
});

describe("runtime instance isolation", () => {
  it("does not share state, events, bundles, services, or policy decisions", () => {
    const first = createTestRuntime({ id: "runtime:first" });
    const second = createTestRuntime({ id: "runtime:second" });
    const firstEvents: string[] = [];
    const secondEvents: string[] = [];
    first.events.subscribe("*", (event) => firstEvents.push(event.type));
    second.events.subscribe("*", (event) => secondEvents.push(event.type));

    first.apps.registerBundle(createTestBundle({ id: "first-only", route: "/first-only" }));
    first.services.register({
      id: "first-service",
      version: "1.0.0",
      capabilities: [],
    });
    first.policy.registerPolicy("deny-first-only", (request, decision) =>
      request.app?.id === "first-only" ? { ...decision, allowed: false, decision: "deny" } : decision,
    );

    expect(first.apps.getApp("first-only")).toBeDefined();
    expect(second.apps.getApp("first-only")).toBeNull();
    expect(second.services.get("first-service")).toBeNull();
    expect(firstEvents.length).toBeGreaterThan(0);
    expect(secondEvents).toEqual([]);
    expect(first.store.getSnapshot().runtimeId).toBe("runtime:first");
    expect(second.store.getSnapshot().runtimeId).toBe("runtime:second");
    expect(first.events.getHistory().every((event) => event.runtimeId === "runtime:first")).toBe(true);
  });

  it("keeps deliberately shared storage namespaced per runtime", () => {
    const storage = new Map<string, string>();
    const shared = {
      get length() { return storage.size; },
      clear() { storage.clear(); },
      getItem(key: string) { return storage.get(key) ?? null; },
      key(index: number) { return Array.from(storage.keys())[index] ?? null; },
      removeItem(key: string) { storage.delete(key); },
      setItem(key: string, value: string) { storage.set(key, value); },
    } as Storage;
    const first = createTestRuntime({ id: "runtime:storage:first", environment: { ...createTestRuntimeEnvironment(), localStorage: shared } });
    const second = createTestRuntime({ id: "runtime:storage:second", environment: { ...createTestRuntimeEnvironment(), localStorage: shared } });

    first.persistence.setPreference("theme", "dark");
    expect(second.persistence.getPreference("theme", "light")).toBe("light");
    expect(first.persistence.getPreference("theme", "light")).toBe("dark");
  });

  it("owns windows, documents, notifications, locale, Webspring, and state transitions", async () => {
    const first = createTestRuntime({ id: "runtime:controllers:first" });
    const second = createTestRuntime({ id: "runtime:controllers:second" });
    const bundle = createTestBundle({ id: "controller-app", route: "/controller-app", presentation: "windowedView" });
    first.apps.registerBundle(bundle);

    const window = await first.windows.openApplicationWindow("controller-app");
    const document = await first.documentStore.saveDraft({ kind: "note", title: "First" }, systemDocumentContext(first)) as { runtimeId: string; title: string };
    const notification = await first.notifications.post({ kind: "system", title: "First", message: "Only here" }) as { runtimeId: string };
    first.locale.setLocale("fr-FR");
    first.webspring.selectApp("controller-app");
    unlockRuntime(first);
    first.statechart.gotoState("active.application", { appId: "controller-app" });

    expect(window?.record).toMatchObject({ runtimeId: first.runtimeId, applicationId: "controller-app" });
    expect(document).toMatchObject({ runtimeId: first.runtimeId, title: "First" });
    expect(notification.runtimeId).toBe(first.runtimeId);
    expect(first.locale.getActiveLocale()).toBe("fr-FR");
    expect(first.webspring.getSnapshot().selectedAppId).toBe("controller-app");
    expect(first.statechart.getCurrentState()).toBe("active.application");
    expect(second.windows.list()).toEqual([]);
    expect(await second.documentStore.listDrafts(undefined, systemDocumentContext(second))).toEqual([]);
    expect(await second.notifications.getHistory()).toEqual([]);
    expect(second.locale.getActiveLocale()).toBe("en-GB");
    expect(second.webspring.getSnapshot().selectedAppId).toBeNull();
    expect(first.events.getHistory().every((event) => event.runtimeId === first.runtimeId)).toBe(true);
  });
});

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

import React from "react";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import type { SynCloudOSRuntime } from "../../src/SynCloudOS/Runtime/runtimeInstanceTypes";
import { createSynCloudOSHostContribution } from "../../src/SynCloudOS/HostContributions/hostContribution";
import { mountSynCloudOS, type MountedSynCloudOSHost, type MountSynCloudOSOptions } from "../../src/SynCloudOSReact/browserRuntime";
import { defineWebspring } from "../../src/Webspring/public";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });
// Keep the real runtime, ErrorManager, SystemAlert, React root and teardown.
// Successful mounts do not need the site's application rendering for these tests.
vi.mock("../../src/App", () => ({ App: () => <button data-testid="mounted-browser-host">Mounted host</button> }));

const shell = defineWebspring({
  manifest: {
    schemaVersion: 1,
    id: "com.example.bootstrap-shell",
    version: "1.0.0",
    title: "Bootstrap shell",
    webspringShell: {
      views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "site", tablet: "site", mobile: "site" },
      homeRoute: "/",
      branding: { name: { key: "site.name", fallback: "Bootstrap shell" } },
    },
  },
  components: { site: () => null },
});

const elements = new Set<HTMLElement>();
const hosts: MountedSynCloudOSHost[] = [];

function element() {
  const result = document.createElement("div");
  document.body.append(result);
  elements.add(result);
  return result;
}

function latestRuntime(): SynCloudOSRuntime {
  const result = vi.mocked(createSynCloudOS).mock.results.at(-1);
  if (result?.type !== "return") throw new Error("The browser host did not create a runtime.");
  return result.value;
}

function observeRecoveryNavigation() {
  const assign = vi.fn((destination: string | URL) => window.history.replaceState(null, "", destination));
  const contribution = createSynCloudOSHostContribution("observe-navigation", "tests/observe-navigation", () => ({
    install() {
      const browser = latestRuntime().environment.browser;
      const browserWindow = browser.getWindow()!;
      // jsdom's Location.assign is non-configurable. Substitute only the
      // environment's navigation view, keeping the real DOM/window services.
      const location = { ...browserWindow.location, assign };
      vi.spyOn(browser, "getWindow").mockReturnValue(new Proxy(browserWindow, {
        get(target, key) {
          if (key === "location") return location;
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }));
    },
  }));
  return { assign, contribution };
}

async function fail(target: HTMLElement, options: Partial<MountSynCloudOSOptions> = {}) {
  let failure: unknown;
  await act(async () => {
    await mountSynCloudOS({ element: target, shell, ...options }).catch(error => { failure = error; });
  });
  expect(failure).toBeDefined();
  return { failure: failure as Error, runtime: latestRuntime() };
}

async function succeed(target: HTMLElement) {
  let host!: MountedSynCloudOSHost;
  await act(async () => { host = await mountSynCloudOS({ element: target, shell }); });
  hosts.push(host);
  return { host, runtime: latestRuntime() };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(async () => {
  window.history.replaceState(null, "", "/");
  // Retry also releases a failed attempt's private recovery root. Use the
  // public mount/dispose contract rather than reaching into private state.
  for (const target of elements) {
    if (target.querySelector('[role="alertdialog"]')) await succeed(target);
  }
  for (const host of hosts.splice(0)) await act(async () => { await host.dispose("test-cleanup"); });
  for (const target of elements) target.remove();
  elements.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("browser bootstrap recovery", () => {
  it("shows the ErrorManager route error after teardown and preserves the failed initial-route result", async () => {
    window.history.replaceState(null, "", "/__syncloudos/nse-gallery");
    const target = element();
    const { failure, runtime } = await fail(target);

    expect(failure.message).toContain("Initial route /__syncloudos/nse-gallery did not complete");
    expect(failure.cause).toMatchObject({ status: "failed", error: { code: "route-not-found" } });
    expect(runtime.disposalState).toBe("disposed");
    expect(runtime.globalWatchdog.isInstalled()).toBe(false);
    expect(runtime.errors.getLatest()).toMatchObject({ code: "ROUTE_NOT_FOUND", route: "/__syncloudos/nse-gallery" });
    const alert = target.querySelector('[role="alertdialog"]');
    expect(alert?.textContent).toContain("Webspring could not find that route.");
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).toBeNull();

    await act(async () => { (alert!.querySelector("button") as HTMLButtonElement).click(); });
    expect(alert?.textContent).toContain("/__syncloudos/nse-gallery");
    const buttons = Array.from(alert!.querySelectorAll("button"));
    buttons.at(-1)!.focus();
    await act(async () => { buttons.at(-1)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("keeps a real module-import cause and its existing app-launch classification", async () => {
    window.history.replaceState(null, "", "/broken");
    const importFailure = new Error("The application module could not be imported.");
    const target = element();
    const { failure, runtime } = await fail(target, { bundles: [{
      manifest: {
        schemaVersion: 1, id: "broken", version: "1.0.0", title: "Broken app",
        runtime: { policy: { public: true, requiresLogin: false } },
        routes: [{ path: "/broken", primary: true }],
      },
      modulePath: "tests/broken/Contents/index.tsx",
      loadModule: async () => { throw importFailure; },
    }] });

    expect(failure.cause).toMatchObject({ error: { cause: { cause: importFailure } } });
    expect(runtime.disposalState).toBe("disposed");
    const launchErrors = runtime.errors.getHistory().filter(error => error.code === "APP_LAUNCH_FAILED");
    expect(launchErrors).toHaveLength(1);
    expect(launchErrors[0]?.technicalMessage).toContain(importFailure.message);
    const alert = target.querySelector('[role="alertdialog"]');
    expect(alert?.textContent).toContain(launchErrors[0]!.title);
    await act(async () => { (alert!.querySelector("button") as HTMLButtonElement).click(); });
    expect(alert?.textContent).toContain(importFailure.message);
  });

  it("captures an installation failure without replacing its original rejection", async () => {
    const original = new Error("Host installation failed.");
    const contribution = createSynCloudOSHostContribution("broken-install", "tests/broken-install", () => ({
      install: () => { throw original; },
    }));
    const target = element();
    const { failure, runtime } = await fail(target, { contributions: [contribution] });
    expect(failure).toBe(original);
    expect(runtime.disposalState).toBe("disposed");
    expect(runtime.errors.getLatest()?.code).toBe("UNKNOWN_RUNTIME_ERROR");
    expect(target.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it("keeps an aborted installation silent while preserving its rejection and teardown", async () => {
    const original = new DOMException("Installation cancelled.", "AbortError");
    const contribution = createSynCloudOSHostContribution("cancel-install", "tests/cancel-install", () => ({
      install: () => { throw original; },
    }));
    const target = element();
    const { failure, runtime } = await fail(target, { contributions: [contribution] });
    expect(failure).toBe(original);
    expect(runtime.disposalState).toBe("disposed");
    expect(runtime.errors.getHistory()).toEqual([]);
    expect(target.childElementCount).toBe(0);
  });

  it("releases the recovery surface on retry and leaves normal disposal authoritative", async () => {
    const focusTarget = element();
    const returnFocus = document.createElement("button");
    focusTarget.append(returnFocus);
    returnFocus.focus();
    const restoreFocus = vi.spyOn(returnFocus, "focus");
    window.history.replaceState(null, "", "/missing");
    const target = element();
    const failed = await fail(target);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const recovery = target.querySelector('[role="alertdialog"]');
    expect(recovery).not.toBeNull();
    window.history.replaceState(null, "", "/");
    const { host, runtime } = await succeed(target);
    expect(runtime).not.toBe(failed.runtime);
    expect(recovery?.isConnected).toBe(false);
    expect(restoreFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(target.querySelector('[role="alertdialog"]')).toBeNull();
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).not.toBeNull();
    expect(failed.runtime.globalWatchdog.isInstalled()).toBe(false);
    await act(async () => { expect((await host.dispose()).status).toBe("disposed"); });
    expect(target.childElementCount).toBe(0);
  });

  it("lets the real SystemAlert return home after bootstrap disposal microtasks settle", async () => {
    window.history.replaceState(null, "", "/studio");
    const target = element();
    const { assign, contribution } = observeRecoveryNavigation();
    const { runtime } = await fail(target, { contributions: [contribution] });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(runtime.disposalState).toBe("disposed");
    expect(runtime.errors.getLatest()?.code).toBe("ROUTE_NOT_FOUND");
    const action = Array.from(target.querySelectorAll("button")).find(button => button.textContent === "Return to Webspring");
    expect(action).toBeDefined();
    await act(async () => { action!.click(); });
    expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    expect(window.location.pathname).toBe("/");
  });

  it("keeps recovery and successor ownership when an older normal host disposes again", async () => {
    const target = element();
    const original = await succeed(target);
    window.history.replaceState(null, "", "/studio");
    const { assign, contribution } = observeRecoveryNavigation();
    await fail(target, { contributions: [contribution] });
    await act(async () => {
      await original.host.dispose("late-normal-disposal");
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    const action = Array.from(target.querySelectorAll("button")).find(button => button.textContent === "Return to Webspring");
    await act(async () => { action!.click(); });
    expect(assign).toHaveBeenCalledExactlyOnceWith("/");
    const successor = await succeed(target);
    const content = target.querySelector('[data-testid="mounted-browser-host"]');
    await act(async () => { await original.host.dispose("late-normal-disposal-again"); });
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).toBe(content);
    await succeed(target);
    // Losing the successor's owner would construct another runtime without
    // committing its disposal first, even though its DOM still looked intact.
    expect(successor.runtime.disposalState).toBe("disposed");
  });

  it("does not let a stale installation failure replace a newer mount", async () => {
    const started = Promise.withResolvers<void>();
    const installation = Promise.withResolvers<void>();
    const original = new Error("The older installation failed late.");
    const contribution = createSynCloudOSHostContribution("slow-install", "tests/slow-install", () => ({
      install: async () => { started.resolve(); await installation.promise; },
    }));
    const target = element();
    const older = mountSynCloudOS({ element: target, shell, contributions: [contribution] }).catch(error => error);
    await started.promise;
    const olderRuntime = latestRuntime();
    await succeed(target);
    const newerContent = target.querySelector('[data-testid="mounted-browser-host"]');
    await act(async () => { installation.reject(original); expect(await older).toBe(original); });
    expect(olderRuntime.disposalState).toBe("disposed");
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).toBe(newerContent);
    expect(target.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("does not create a runtime when an older preparation finishes after a newer mount", async () => {
    const started = Promise.withResolvers<void>();
    const preparation = Promise.withResolvers<void>();
    const install = vi.fn();
    const contribution = createSynCloudOSHostContribution("slow-prepare", "tests/slow-prepare", async () => {
      started.resolve();
      await preparation.promise;
      return { install };
    });
    const target = element();
    const older = mountSynCloudOS({ element: target, shell, contributions: [contribution] }).catch(error => error);
    await started.promise;
    await succeed(target);
    const created = vi.mocked(createSynCloudOS).mock.calls.length;
    const content = target.querySelector('[data-testid="mounted-browser-host"]');
    await act(async () => { preparation.resolve(); expect(await older).toMatchObject({ name: "AbortError" }); });
    expect(vi.mocked(createSynCloudOS).mock.calls).toHaveLength(created);
    expect(install).not.toHaveBeenCalled();
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).toBe(content);
  });

  it("joins unfinished predecessor teardown across two overlapping retries", async () => {
    const target = element();
    await succeed(target);
    const originalRuntime = latestRuntime();
    const preparing = Promise.withResolvers<void>();
    const preparation = Promise.withResolvers<{ status: "ready"; commit: () => void }>();
    originalRuntime.registerDisposalParticipant({
      id: "test:slow-close",
      prepare() { preparing.resolve(); return preparation.promise; },
    });
    const middle = mountSynCloudOS({ element: target, shell }).catch(error => error);
    await preparing.promise;
    const newest = mountSynCloudOS({ element: target, shell }).then(host => { hosts.push(host); return host; });
    // Attach observation before releasing teardown so even an early failure
    // cannot become an unhandled promise during the test.
    const outcome = newest.then(host => ({ host }), error => ({ error }));
    let result!: Awaited<typeof outcome>;
    // Yield one event-loop turn while predecessor preparation remains held.
    // No replacement runtime may be constructed before that owner retires.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const prematurelyCreated = vi.mocked(createSynCloudOS).mock.calls.length;
    await act(async () => {
      preparation.resolve({ status: "ready", commit: () => undefined });
      expect(await middle).toMatchObject({ name: "AbortError" });
      result = await outcome;
    });
    expect(prematurelyCreated).toBe(1);
    expect(result).toHaveProperty("host");
    expect(originalRuntime.disposalState).toBe("disposed");
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).not.toBeNull();
    expect(target.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("respects an existing runtime's disposal veto when the element is mounted again", async () => {
    const target = element();
    const { runtime } = await succeed(target);
    const content = target.querySelector('[data-testid="mounted-browser-host"]');
    const registration = runtime.registerDisposalParticipant({
      id: "test:keep-existing-host", prepare: () => ({ status: "cancelled", reason: "Keep the existing host." }),
    });
    try {
      let failure: unknown;
      await act(async () => { await mountSynCloudOS({ element: target, shell }).catch(error => { failure = error; }); });
      expect(failure).toMatchObject({ name: "AbortError" });
      expect(runtime.signal.aborted).toBe(false);
      expect(runtime.disposalState).toBe("running");
      expect(target.querySelector('[data-testid="mounted-browser-host"]')).toBe(content);
      expect(target.querySelector('[role="alertdialog"]')).toBeNull();
    } finally { registration.unregister(); }
  });

  it("waits for direct disposal's contribution cleanup before constructing a retry runtime", async () => {
    const cleaning = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const contribution = createSynCloudOSHostContribution("slow-cleanup", "tests/slow-cleanup", () => ({
      install: () => async () => { cleaning.resolve(); await cleanup.promise; },
    }));
    const target = element();
    let original!: MountedSynCloudOSHost;
    await act(async () => { original = await mountSynCloudOS({ element: target, shell, contributions: [contribution] }); });
    hosts.push(original);
    const originalRuntime = latestRuntime();
    const disposal = originalRuntime.dispose("direct-close");
    await act(async () => { await cleaning.promise; });
    const retry = mountSynCloudOS({ element: target, shell }).then(host => { hosts.push(host); return host; });
    const outcome = retry.then(host => ({ host }), error => ({ error }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const prematurelyCreated = vi.mocked(createSynCloudOS).mock.calls.length;
    let result!: Awaited<typeof outcome>;
    await act(async () => {
      cleanup.resolve();
      expect((await disposal).status).toBe("disposed");
      result = await outcome;
    });
    expect(prematurelyCreated).toBe(1);
    expect(result).toHaveProperty("host");
    expect(target.querySelector('[data-testid="mounted-browser-host"]')).not.toBeNull();
  });
});

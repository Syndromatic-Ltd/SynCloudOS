// @vitest-environment jsdom
import * as React from "react";
import { act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createSynWare } from "../../src/SynCloudOS/AppSDK/createSynWare";
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK/manifest";
import { normalizeSynCloudOSAppPresentation } from "../../src/SynCloudOS/AppRegistry/appRegistryTypes";
import { createSynCloudOS } from "../../src/SynCloudOS/Runtime/createSynCloudOS";
import { mountSynCloudOS, type MountedSynCloudOSHost, type MountSynCloudOSOptions } from "../../src/SynCloudOSReact/browserRuntime";
import { createTestRuntime, registerTestSynWare } from "./helpers";

vi.mock("../../src/SynCloudOS/Runtime/createSynCloudOS", { spy: true });

const id = "com.example.stage-presentation";
const mounts: MountedSynCloudOSHost[] = [];
const elements: HTMLElement[] = [];
afterEach(async () => {
  for (const host of mounts.splice(0)) await act(async () => { await host.dispose("test-cleanup"); });
  for (const element of elements.splice(0)) element.remove();
  vi.clearAllMocks(); window.history.replaceState(null, "", "/");
});

const manifest = (presentation?: string) => ({ schemaVersion: 1, bundleIdentifier: id, version: "1.0.0", displayName: "Stage presentation",
  routes: [{ path: "/stage-presentation", primary: true }],
  runtime: { ...(presentation ? { presentation } : {}), policy: { public: true, requiresLogin: false } } });

it("presents an application on the stage unless it asks for a window", () => {
  expect(normalizeSynCloudOSAppPresentation(undefined)).toBe("stage");
  const runtime = createTestRuntime();
  expect(registerTestSynWare(runtime, manifest() as never).presentation).toBe("stage");
  expect(validateSynWareManifest(manifest("window")).ok).toBe(true);
  expect(validateSynWareManifest(manifest("stage")).ok).toBe(true);
});

it.each([["appView", "stage"], ["windowedView", "window"]])("rejects the retired %s presentation, naming %s", (presentation, replacement) => {
  const result = validateSynWareManifest(manifest(presentation));
  expect(result.ok).toBe(false);
  const issue = (result.ok ? [] : result.errors).find((error) => error.path === "/runtime/presentation");
  expect(issue?.message).toContain(`"${presentation}" is now "${replacement}".`);
  expect(issue?.message).toMatch(/"stage"/);
  expect(issue?.message).toMatch(/"window"/);
});

async function mountPrimary(frame: "fullscreen" | "declared") {
  const element = document.createElement("div"); document.body.append(element); elements.push(element);
  const bundle = createSynWare({ manifest: manifest("window") as never, root: () => React.createElement("p", { "data-testid": "primary" }, "Primary") });
  let host!: MountedSynCloudOSHost;
  await act(async () => {
    host = await mountSynCloudOS({ element, bundles: [bundle], application: { bundleIdentifier: id, frame }, authentication: "disabled" } as unknown as MountSynCloudOSOptions);
  });
  mounts.push(host);
  return { element, runtime: vi.mocked(createSynCloudOS).mock.results.at(-1)!.value };
}

it("puts a window primary on the stage in a full-screen host, and in its window when the frame is declared", async () => {
  const fullscreen = await mountPrimary("fullscreen");
  expect(fullscreen.runtime.apps.getApp(id)?.presentation).toBe("stage");
  expect(fullscreen.element.querySelector("[data-syncloudos-application-host]")).not.toBeNull();
  await act(async () => { await mounts.pop()!.dispose("test-cleanup"); });

  const declared = await mountPrimary("declared");
  expect(declared.runtime.apps.getApp(id)?.presentation).toBe("window");
  expect(declared.runtime.windows.list({ applicationId: id })).toHaveLength(1);
  expect(declared.element.querySelector("[data-syncloudos-application-host]")).toBeNull();
  expect(document.querySelector('[data-testid="primary"]')).not.toBeNull();
});

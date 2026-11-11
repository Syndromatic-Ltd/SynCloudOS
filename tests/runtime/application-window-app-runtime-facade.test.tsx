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

import { cleanup, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { WindowPresentation } from "../../src/SynCloudOS/Windows";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { useSCOS } from "../../src/SynCloudOS/AppSDK";
import { HostSiteBrandingProvider } from "../../src/SynCloudOSReact";
import { createApplicationWindowContentRendererRegistry } from "../../src/Webspring/WindowLayer";
import { standardWindow } from "../fixtures/windowTestDependencies";
import { createTestBundle, createTestRuntime } from "./helpers";

afterEach(cleanup);

describe("ApplicationWindowContent scoped app runtime", () => {
  it("does not expose kernel controls through mounted props or the useSCOS client", async () => {
    const runtime = createTestRuntime();
    let receivedProps: Record<string, unknown> | null = null;
    let appClient: Record<string, unknown> | null = null;
    let missingDocument: unknown = undefined;
    runtime.apps.registerBundle(createTestBundle(
      { bundleIdentifier: "com.example.test-app", route: "/test" },
      {
        loadModule: async () => ({
          default: (props: Record<string, unknown>) => {
            receivedProps = props;
            const app = useSCOS();
            appClient = app as unknown as Record<string, unknown>;
            missingDocument = app.documents.workspaceDocuments.getDocument("document:missing");
            return <p>Scoped window application</p>;
          },
        }),
      },
    ));
    runtime.responders.register({ id: "application:com.example.test-app", kind: "application", parentId: "workspace", scopeId: "application:com.example.test-app" });
    const window = runtime.windows.create(standardWindow("window:test-app", {
      applicationId: "com.example.test-app",
      applicationSessionId: "com.example.test-app",
      content: { rendererId: "application", parameters: { appId: "com.example.test-app" } },
      restorationKey: "application-window-runtime-facade.test-app",
    }));
    await runtime.windows.open(window.id);
    await runtime.bundles.loadBundle("com.example.test-app");
    const registry = createApplicationWindowContentRendererRegistry(runtime, { "com.example.test-app": runtime.apps.getApp("com.example.test-app")! });
    const content = registry.render("application:com.example.test-app", {
      mountKey: "application:com.example.test-app",
      presentation: {} as WindowPresentation,
      window: window.record,
    });

    const branding = { name: "Window test host", logoAlt: "", logoUrl: null, lightLogoUrl: null, darkLogoUrl: null, compactLogoUrl: null };
    render(<SynCloudOSProvider runtime={runtime}><HostSiteBrandingProvider value={branding}>{content}</HostSiteBrandingProvider></SynCloudOSProvider>);

    await screen.findByText("Scoped window application");
    expect(receivedProps).not.toHaveProperty("runtime");
    for (const forbiddenKernelSurface of [
      "runtime", "environment", "store", "policy", "apps", "transfers", "dispose",
    ]) {
      expect(appClient?.[forbiddenKernelSurface]).toBeUndefined();
    }
    expect(appClient?.documents).not.toBe(runtime.documents);
    expect(missingDocument).toBeNull();
    expect(Reflect.get(appClient?.documents as object, "documentStore")).toBeUndefined();
    expect(appClient?.images).not.toBe(runtime.images);
    expect(appClient?.audio).not.toBe(runtime.audio);
    expect(Reflect.get(appClient?.documents as object, "dispose")).toBeUndefined();
    expect(Reflect.get(appClient?.locale as object, "hydrate")).toBeUndefined();
    expect(Reflect.get(appClient?.locale as object, "registerBundleLocaleResources")).toBeUndefined();
    expect(Reflect.get(appClient?.locale as object, "registerTranslations")).toBeUndefined();
    expect(Reflect.get(appClient?.locale as object, "t")).toEqual(expect.any(Function));
  });
});

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

import { expect, it } from "vitest";
import { validateSynWareManifest } from "../../src/SynCloudOS/AppSDK";

it("accepts disabled runtime intent and the preload authoring key", () => {
  expect(validateSynWareManifest({
    schemaVersion: 1, id: "fixture.preparing", version: "1.0.0", title: "Preparing",
    runtime: { disabled: true, disabledReason: "Being prepared." },
    lifecycle: { preload: true },
  }).ok).toBe(true);
});

it.each([true, false])("rejects the legacy lifecycle launch key with value %s", (launch) => {
  const result = validateSynWareManifest({
    schemaVersion: 1, id: "fixture.legacy", version: "1.0.0", title: "Legacy",
    lifecycle: { launch },
  });
  expect(result.errors).toContainEqual(expect.objectContaining({ path: "/lifecycle/launch", code: "unknown-key" }));
});

it.each([
  { runtime: { disabled: "true" }, path: "/runtime/disabled" },
  { runtime: { disabledReason: false }, path: "/runtime/disabledReason" },
  { lifecycle: { preload: "true" }, path: "/lifecycle/preload" },
])("rejects a mistyped declaration at $path", ({ path, ...declaration }) => {
  const result = validateSynWareManifest({
    schemaVersion: 1, id: "fixture.invalid", version: "1.0.0", title: "Invalid", ...declaration,
  });
  expect(result.errors).toContainEqual(expect.objectContaining({ path, code: "type" }));
});

it("accepts a complete versioned manifest", () => {
  expect(validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.example",
    version: "1.0.0",
    title: "Example",
    presentations: ["desktop", "mobile"],
    webspring: { order: 10, icon: "./Resources/AppIcon.png" },
  }).ok).toBe(true);
});

it("accepts a closed Webspring shell declaration without replacing app placement", () => {
  expect(validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.webspring",
    version: "1.0.0",
    title: "Webspring",
    webspring: { visible: true, order: 1 },
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/",
      branding: {
        name: { key: "site.name", fallback: "Example" },
        logo: { resource: "./Resources/SiteLogo.svg", alternativeText: { key: "site.logoAlt" } },
        lightLogo: { resource: "./Resources/SiteLogoLight.svg", alternativeText: { key: "site.logoAlt" } },
        darkLogo: { resource: "./Resources/SiteLogoDark.svg", alternativeText: { key: "site.logoAlt" } },
        compactLogo: { resource: "./Resources/SiteMark.svg", alternativeText: { key: "site.logoAlt" } },
      },
    },
  }).ok).toBe(true);
});

it.each(["//outside.example", "https://outside.example", "/folder\\child", "/folder//child"])(
  "rejects non-local Webspring home route %s",
  (homeRoute) => {
    const result = validateSynWareManifest({
      schemaVersion: 1,
      id: "com.syndromatic.webspring.invalid-route",
      version: "1.0.0",
      title: "Webspring invalid route",
      webspringShell: {
        views: [{ id: "website", presentations: ["desktop"], mode: "launcher" }],
        defaults: { desktop: "website", tablet: "website", mobile: "website" },
        homeRoute,
        branding: { name: { key: "site.name" } },
      },
    });

    expect(result).toMatchObject({ ok: false });
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "/webspringShell/homeRoute" }));
  },
);

it("rejects unknown Webspring shell fields", () => {
  const result = validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.webspring.unknown",
    version: "1.0.0",
    title: "Webspring unknown field",
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop"], mode: "launcher", component: "./WebsiteView" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/",
      branding: { name: { key: "site.name" } },
    },
  });

  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/webspringShell/views/0/component", code: "unknown-key" }),
  );
});

function webspringFolderManifest(folders: unknown) {
  return {
    schemaVersion: 1,
    id: "com.syndromatic.webspring.folders",
    version: "1.0.0",
    title: "Webspring folders",
    webspringShell: {
      views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
      defaults: { desktop: "website", tablet: "website", mobile: "website" },
      homeRoute: "/",
      branding: { name: { key: "site.name" } },
      folders,
    },
  };
}

it("accepts Webspring folder declarations", () => {
  expect(validateSynWareManifest(webspringFolderManifest({
    editable: true,
    initial: [{ id: "folder.experiments", title: { key: "folders.experiments", fallback: "Experiments" }, order: 40, apps: ["one", "two"] }],
  })).ok).toBe(true);
});

it.each([
  ["a folder ID outside the folder namespace", { id: "experiments", title: { key: "f" }, order: 1, apps: ["one"] }, "/webspringShell/folders/initial/0/id"],
  ["a folder without apps", { id: "folder.empty", title: { key: "f" }, order: 1, apps: [] }, "/webspringShell/folders/initial/0/apps"],
  ["a folder listing an app twice", { id: "folder.twice", title: { key: "f" }, order: 1, apps: ["one", "one"] }, "/webspringShell/folders/initial/0/apps"],
  ["a fractional folder order", { id: "folder.half", title: { key: "f" }, order: 1.5, apps: ["one"] }, "/webspringShell/folders/initial/0/order"],
  ["an unknown folder field", { id: "folder.extra", title: { key: "f" }, order: 1, apps: ["one"], icon: "x" }, "/webspringShell/folders/initial/0/icon"],
])("rejects %s", (_label, folder, path) => {
  const result = validateSynWareManifest(webspringFolderManifest({ editable: false, initial: [folder] }));

  expect(result).toMatchObject({ ok: false });
  expect(result.errors).toContainEqual(expect.objectContaining({ path }));
});

it("requires both Webspring folder fields", () => {
  const result = validateSynWareManifest(webspringFolderManifest({ initial: [] }));

  expect(result).toMatchObject({ ok: false });
  expect(result.errors.map((error) => error.path)).toContainEqual(expect.stringMatching(/^\/webspringShell\/folders/u));
});

it.each(["./Resources/../escape.svg", "./Resources/icons/../../escape.svg"])(
  "rejects escaping Webspring branding resource %s",
  (resource) => {
    const result = validateSynWareManifest({
      schemaVersion: 1,
      id: "com.syndromatic.webspring.escape",
      version: "1.0.0",
      title: "Webspring escaping resource",
      webspringShell: {
        views: [{ id: "website", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
        defaults: { desktop: "website", tablet: "website", mobile: "website" },
        homeRoute: "/",
        branding: {
          name: { key: "site.name" },
          logo: { resource, alternativeText: { key: "site.logoAlt" } },
        },
      },
    });

    expect(result.errors).toContainEqual(expect.objectContaining({ path: "/webspringShell/branding/logo/resource" }));
  },
);

it("rejects an unknown legacy manifest key", () => {
  const result = validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.invalid",
    version: "1.0.0",
    title: "Invalid",
    legacyShell: {},
  });

  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/legacyShell", code: "unknown-key" }),
  );
});

it("rejects unknown nested public-object fields", () => {
  const result = validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.invalid-nested",
    version: "1.0.0",
    title: "Invalid nested field",
    webspring: { order: 10, legacyOrder: 9 },
  });

  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/webspring/legacyOrder", code: "unknown-key" }),
  );
});

it("rejects non-enumerable fields at the public manifest boundary", () => {
  const manifest: Record<string, unknown> = {
    schemaVersion: 1,
    id: "com.syndromatic.hidden-field",
    version: "1.0.0",
    title: "Hidden field",
  };
  Object.defineProperty(manifest, "legacyPayload", {
    configurable: true,
    enumerable: false,
    value: "must not cross the boundary",
  });

  const result = validateSynWareManifest(manifest);

  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/legacyPayload", code: "unknown-key" }),
  );
});

it("accepts the complete supported runtime access-class vocabulary", () => {
  expect(validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.access-classes",
    version: "1.0.0",
    title: "Access classes",
    runtime: {
      policy: { requiredAccessClasses: ["team", "external"] },
    },
  }).ok).toBe(true);
});

it("rejects a runtime access class outside the authoritative type vocabulary", () => {
  const result = validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.invalid-access-class",
    version: "1.0.0",
    title: "Invalid access class",
    runtime: {
      policy: { requiredAccessClasses: ["partner"] },
    },
  });

  expect(result).toMatchObject({ ok: false });
  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/runtime/policy/requiredAccessClasses/0", code: "conflict" }),
  );
});

it("rejects deprecated Onyx as a production app appearance", () => {
  const result = validateSynWareManifest({
    schemaVersion: 1,
    id: "com.syndromatic.deprecated-appearance",
    version: "1.0.0",
    title: "Deprecated appearance",
    appearances: [{ id: "invalid-appearance", variant: "custom-test" }],
  });

  expect(result).toMatchObject({ ok: false });
  expect(result.errors).toContainEqual(
    expect.objectContaining({ path: "/appearances/0/variant", code: "conflict" }),
  );
});

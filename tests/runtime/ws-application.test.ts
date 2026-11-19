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

import { describe, expect, it, vi } from "vitest";
import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { nseDisposeFor } from "../../src/NSE/applicationHostInterop";
import { NSEPreferencePane } from "../../src/SynCloudOS/Preferences";
import { assertWSFolders, captureWSInfo, type WSInfo } from "../../src/Webspring/WSInfo";
import {
  WSApplication,
  assertWSHomeConfiguration,
  constructWSApplication,
  createWebspring,
  defaultWSLauncherViewController,
  isWSApplicationClass,
  isWSDefinition,
  resolveLauncher,
} from "../../src/Webspring/WSApplication";
import { WSSurface } from "../../src/Webspring/WSSurface";
import { WSWidget } from "../../src/Webspring/WSWidget";

const minimalInfo: WSInfo = {
  bundleIdentifier: "com.example.site",
  displayName: "Example",
  version: "1.0.0",
};

function paneClass(id: string, order: number, title = id) {
  return class extends NSEPreferencePane {
    static override id = id;
    static override title = title;
    static override order = order;
    override renderView() { return null; }
  };
}

function widgetClass(id: string, order: number, title = id) {
  return class extends WSWidget<readonly string[]> {
    static override id = id;
    static override title = title;
    static override order = order;
    static override whenEmpty = "hide" as const;
    override load() { return [] as readonly string[]; }
    override renderView() { return null; }
  };
}

describe("WSInfo", () => {
  it("captures WSInfo with defaults", () => {
    const captured = captureWSInfo({
      bundleIdentifier: "com.example.site",
      displayName: "Example",
      version: "1.0.0",
    });

    expect(captured.schemaVersion).toBe(1);
    expect(captured.homeRoute).toBe("/");
    expect(captured.branding).toEqual({ name: { key: "site.name", fallback: "Example" } });
    expect(captured.folders).toEqual({ editable: false, initial: [] });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(Object.isFrozen(captured.branding)).toBe(true);
    expect(Object.isFrozen(captured.folders)).toBe(true);
    expect(Object.isFrozen(captured.folders.initial)).toBe(true);
  });

  it("preserves explicit branding, homeRoute, folders and webApp", () => {
    const info: WSInfo = {
      schemaVersion: 1,
      bundleIdentifier: "com.syndromatic.webspring",
      displayName: "Syndromatic",
      version: "4.0.0",
      homeRoute: "/welcome",
      branding: {
        name: { key: "site.name", fallback: "Syndromatic" },
        logo: { resource: "./Resources/Lockup.png", alternativeText: { key: "site.logoAlt", fallback: "Syndromatic" } },
        lightLogo: { resource: "./Resources/LockupLight.png", alternativeText: { key: "site.logoAlt" } },
        darkLogo: { resource: "./Resources/LockupDark.png", alternativeText: { key: "site.logoAlt" } },
        compactLogo: { resource: "./Resources/Mark.png", alternativeText: { key: "site.logoAlt", fallback: "Mark" } },
        homeIcon: { resource: "./Resources/Home.svg", alternativeText: { key: "site.home", fallback: "Home" } },
      },
      folders: {
        editable: true,
        initial: [
          {
            id: "folder.experiments",
            title: { key: "folders.experiments", fallback: "Experiments" },
            order: 3,
            apps: ["com.syndromatic.animationfx"],
          },
        ],
      },
      webApp: {
        scope: "/",
        startURL: "/",
        shortName: "Syndromatic",
        themeColour: "#929eae",
        backgroundColour: "#929eae",
        icons: [],
      },
    };

    const captured = captureWSInfo(info);
    expect(captured.homeRoute).toBe("/welcome");
    expect(captured.branding).toEqual(info.branding);
    expect(captured.folders).toEqual(info.folders);
    expect(captured.webApp).toEqual(info.webApp);
  });

  it("rejects unknown fields, accessors and malformed values", () => {
    expect(() => captureWSInfo({ ...minimalInfo, webspringShell: {} })).toThrow(/unknown fields.*webspringShell/i);
    expect(() => captureWSInfo({ ...minimalInfo, views: [] })).toThrow(/unknown fields.*views/i);
    expect(() => captureWSInfo({ ...minimalInfo, defaults: {} })).toThrow(/unknown fields.*defaults/i);
    expect(() => captureWSInfo({ ...minimalInfo, schemaVersion: 2 })).toThrow(/schemaVersion/i);
    expect(() => captureWSInfo({ ...minimalInfo, bundleIdentifier: "bad" })).toThrow(/bundleIdentifier/i);
    expect(() => captureWSInfo({ ...minimalInfo, version: "one" })).toThrow(/version/i);
    expect(() => captureWSInfo({ ...minimalInfo, displayName: "" })).toThrow(/displayName/i);
    expect(() => captureWSInfo({ ...minimalInfo, homeRoute: "//evil" })).toThrow(/homeRoute/i);

    const read = vi.fn(() => "Example");
    const accessorInfo = Object.defineProperty({ bundleIdentifier: "com.example.site", version: "1.0.0" }, "displayName", {
      enumerable: true,
      get: read,
    });
    expect(() => captureWSInfo(accessorInfo)).toThrow(/accessor/i);
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects bad folders", () => {
    expect(() => captureWSInfo({
      ...minimalInfo,
      folders: {
        editable: true,
        initial: [{ id: "tools", title: { key: "tools" }, order: 1, apps: ["com.example.notes"] }],
      },
    })).toThrow(/folder\./i);

    expect(() => captureWSInfo({
      ...minimalInfo,
      folders: {
        editable: true,
        initial: [{ id: "folder.tools", title: { key: "tools" }, order: 1, apps: ["folder.tools"] }],
      },
    })).toThrow(/collide|folder\.tools/i);

    expect(() => captureWSInfo({
      ...minimalInfo,
      folders: {
        editable: true,
        initial: [{ id: "com.example.notes", title: { key: "tools" }, order: 1, apps: ["com.example.notes"] }],
      },
    })).toThrow(/folder\.|collide/i);

    expect(() => captureWSInfo({
      ...minimalInfo,
      folders: {
        editable: true,
        initial: [
          { id: "folder.tools", title: { key: "a" }, order: 1, apps: ["com.example.one"] },
          { id: "folder.tools", title: { key: "b" }, order: 2, apps: ["com.example.two"] },
        ],
      },
    })).toThrow("Webspring manifest contains duplicate folder ID folder.tools.");

    expect(() => captureWSInfo({
      ...minimalInfo,
      folders: {
        editable: true,
        initial: [
          { id: "folder.tools", title: { key: "a" }, order: 1, apps: ["com.example.one", "com.example.two"] },
          { id: "folder.games", title: { key: "b" }, order: 2, apps: ["com.example.two"] },
        ],
      },
    })).toThrow("Webspring app com.example.two is listed in folders folder.tools and folder.games.");

    expect(() => assertWSFolders(
      {
        editable: true,
        initial: [{ id: "folder.tools", title: { key: "a" }, order: 1, apps: ["com.example.one"] }],
      },
      ["COM.EXAMPLE.ONE", "folder.tools"],
    )).toThrow(/collide|folder\.tools/i);
  });
});

describe("WSApplication", () => {
  it("only the framework constructs WSApplication", () => {
    let wsMessage = "";
    let nseMessage = "";
    try { new (class extends WSApplication {})(); } catch (error) { wsMessage = (error as Error).message; }
    try { new (class extends NSEApplication {})(); } catch (error) { nseMessage = (error as Error).message; }
    expect(wsMessage).toContain("created by the framework");
    expect(wsMessage).toBe(nseMessage);

    class NamedWSApp extends WSApplication {}
    class NamedNSEApp extends NSEApplication {}
    let namedWsMessage = "";
    let namedNseMessage = "";
    try { new NamedWSApp(); } catch (error) { namedWsMessage = (error as Error).message; }
    try { new NamedNSEApp(); } catch (error) { namedNseMessage = (error as Error).message; }
    expect(namedWsMessage.replace("NamedWSApp", "App")).toBe(namedNseMessage.replace("NamedNSEApp", "App"));
    expect(namedWsMessage).toContain("NamedWSApp is created by the framework; export it as the default export of the application module instead of calling new.");
  });

  it("creates an owned WSApplication instance via framework construction and disposes cleanly", () => {
    let disposedResource = false;
    const onDispose = vi.fn();

    class SiteApp extends WSApplication {
      readonly resource = this.own(() => ({ dispose() { disposedResource = true; } }));
    }

    expect(isWSApplicationClass(WSApplication)).toBe(true);
    expect(isWSApplicationClass(SiteApp)).toBe(true);
    expect(isWSApplicationClass(class Other {})).toBe(false);
    expect(isWSApplicationClass({})).toBe(false);

    const instance = constructWSApplication(SiteApp);
    instance.onDispose(onDispose);
    expect(instance).toBeInstanceOf(WSApplication);
    expect(instance.ownerSignal.aborted).toBe(false);
    expect(instance.isDisposed).toBe(false);

    instance[nseDisposeFor]("explicit");
    expect(instance.isDisposed).toBe(true);
    expect(instance.ownerSignal.aborted).toBe(true);
    expect(disposedResource).toBe(true);
    expect(onDispose).toHaveBeenCalledWith("explicit");
  });

  it("captures statics and defaults", () => {
    const CustomSounds = paneClass("sounds", 200, "Custom Sounds");
    const BillingPane = paneClass("billing", 300, "Billing");
    const ExtraPane = paneClass("alerts", 50, "Alerts");
    const ExplicitWidget = widgetClass("explicit", 20, "Explicit");
    const LateWidget = widgetClass("zebra", 10, "Zebra");
    const EarlyWidget = widgetClass("alpha", 10, "Alpha");
    const IconEffect = () => null;
    const FolderPresentation = () => null;

    class CustomSiteApp extends WSApplication {
      static override launcherSurface = WSSurface.plain("#112233");
      static override hiddenPreferencePanes = ["sounds"];
      static override folderAppearance = {
        shape: { kind: "roundedRect" as const, smoothSurface: { radius: 14, curve: "arc" as const } },
      };
      static override quickSwitch = { overflow: "scroll" as const };
      static override iconEffect = IconEffect;
      static override folderPresentation = FolderPresentation;
      static override widgets = [ExplicitWidget];
      static override preferencePanes = [CustomSounds];
    }

    const definition = createWebspring({
      info: minimalInfo,
      application: CustomSiteApp,
      widgets: [LateWidget, ExplicitWidget, EarlyWidget],
      preferencePanes: [BillingPane, CustomSounds, ExtraPane],
    });

    expect(isWSDefinition(definition)).toBe(true);
    expect(definition.application).toBe(CustomSiteApp);
    expect(definition.background.launcher).toEqual({ colour: "#112233" });
    expect(definition.background.shelf).toEqual(WSSurface.plain("#171c26"));
    expect(definition.preferences.hide).toEqual(["sounds"]);
    expect(definition.folderAppearance).toEqual({
      shape: { kind: "roundedRect", smoothSurface: { radius: 14, curve: "arc", smoothing: 0.6 } },
      fill: "inset",
    });
    expect(definition.quickSwitch).toEqual({ overflow: "scroll" });
    expect(definition.iconEffect).toBe(IconEffect);
    expect(definition.folderPresentation).toBe(FolderPresentation);
    expect(definition.widgets.map((widget) => widget.id)).toEqual(["explicit", "alpha", "zebra"]);
    expect(definition.preferences.panes.map((pane) => pane.id)).toEqual(["sounds", "alerts", "billing"]);

    const baseDefaults = createWebspring({ info: minimalInfo });
    expect(baseDefaults.application).toBe(WSApplication);
    expect(baseDefaults.background.launcher).toEqual(WSSurface.cotton());
    expect(baseDefaults.background.shelf).toEqual(WSSurface.plain("#171c26"));
  });

  it("rejects malformed statics and accessor getters without invoking them", () => {
    const getter = vi.fn(() => WSSurface.cotton());
    class AccessorApp extends WSApplication {}
    Object.defineProperty(AccessorApp, "launcherSurface", { enumerable: true, get: getter });
    expect(() => createWebspring({ info: minimalInfo, application: AccessorApp })).toThrow(/accessor/i);
    expect(getter).not.toHaveBeenCalled();

    class BadEffectApp extends WSApplication {
      static override iconEffect = "nope" as never;
    }
    expect(() => createWebspring({ info: minimalInfo, application: BadEffectApp })).toThrow(/iconEffect.*React component/i);

    class BadFolderPresApp extends WSApplication {
      static override folderPresentation = "split" as never;
    }
    expect(() => createWebspring({ info: minimalInfo, application: BadFolderPresApp })).toThrow(/folderPresentation.*React component/i);
  });

  it("resolves launchers per presentation and validates launcher metadata", () => {
    class Dial {
      static presentations = ["desktop", "tablet"] as const;
      static returnTracks = ["icons"] as const;
      static launchZoom = { delay: 0.25, duration: 0.5, easing: "decelerate" as const };
    }

    class DesktopDialApp extends WSApplication {
      static override viewControllers = { desktop: Dial };
    }

    const definition = createWebspring({ info: minimalInfo, application: DesktopDialApp });
    expect(resolveLauncher(definition, "desktop")).toBe(Dial);
    expect(resolveLauncher(definition, "tablet")).toBe(defaultWSLauncherViewController);
    expect(resolveLauncher(definition, "mobile")).toBe(defaultWSLauncherViewController);
    expect(defaultWSLauncherViewController.name).toBe("WSBoardViewController");
    expect(definition.returnTracks.desktop).toEqual(["icons"]);
    expect(definition.launchZooms.desktop).toEqual({ delay: 0.25, duration: 0.5, easing: "decelerate" });
    expect(definition.returnTracks.tablet).toEqual(["material"]);

    class TabletMobileOnly {}
    (TabletMobileOnly as { presentations?: readonly string[] }).presentations = ["tablet", "mobile"];
    class BadPlacementApp extends WSApplication {
      static override mainViewController = TabletMobileOnly as never;
    }
    expect(() => createWebspring({ info: minimalInfo, application: BadPlacementApp })).toThrow(/does not support desktop/i);

    const tracksGetter = vi.fn(() => ["material"]);
    class AccessorLauncher {}
    Object.defineProperty(AccessorLauncher, "returnTracks", { enumerable: true, get: tracksGetter });
    class AccessorLauncherApp extends WSApplication {
      static override mainViewController = AccessorLauncher as never;
    }
    expect(() => createWebspring({ info: minimalInfo, application: AccessorLauncherApp })).toThrow(/accessor/i);
    expect(tracksGetter).not.toHaveBeenCalled();

    class BadTracksLauncher {
      static returnTracks = ["material", "material"] as never;
    }
    class BadTracksApp extends WSApplication {
      static override mainViewController = BadTracksLauncher as never;
    }
    expect(() => createWebspring({ info: minimalInfo, application: BadTracksApp })).toThrow(/returnTracks/i);
  });

  it("enforces persistent vs launcher home routes", () => {
    class PersistentLauncher {
      static mode = "persistent" as const;
    }
    class PersistentSiteApp extends WSApplication {
      static override mainViewController = PersistentLauncher;
    }

    const persistentDefinition = createWebspring({
      info: { ...minimalInfo, homeRoute: "/notes" },
      application: PersistentSiteApp,
    });
    expect(persistentDefinition.info.homeRoute).toBe("/notes");

    class LauncherModeView {
      static mode = "launcher" as const;
    }
    class LauncherModeApp extends WSApplication {
      static override mainViewController = LauncherModeView;
    }

    expect(() => createWebspring({
      info: { ...minimalInfo, homeRoute: "/notes" },
      application: LauncherModeApp,
    })).toThrow(/must resolve to the shell/);

    expect(() => createWebspring({
      info: { ...minimalInfo, homeRoute: "/notes" },
    })).toThrow(/must resolve to the shell/);

    class MixedModeApp extends WSApplication {
      static override viewControllers = { desktop: PersistentLauncher };
    }
    expect(() => createWebspring({
      info: { ...minimalInfo, homeRoute: "/notes" },
      application: MixedModeApp,
    })).toThrow(/must resolve to the shell/);

    expect(() => assertWSHomeConfiguration(persistentDefinition, () => ({ kind: "app" }))).not.toThrow();
    expect(() => assertWSHomeConfiguration(persistentDefinition, () => ({ kind: "notFound" }))).toThrow(/is not routeable/);
  });
});

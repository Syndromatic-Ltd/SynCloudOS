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
import { WSBoardViewController, WSLauncherViewController, type WSLauncherViewControllerClass } from "../../src/Webspring/public";
import { createTestWebspring, type TestWebspringOptions } from "./webspringTestShell";

function defineLauncher(launcher: WSLauncherViewControllerClass) {
  return createTestWebspring({ info: { bundleIdentifier: "com.example.test.return-definition", displayName: "Return definition" }, launcher });
}

describe("Webspring return requirement capture", () => {
  it("captures immutable requirements without constructing the launcher", () => {
    let constructed = 0;
    const tracks: ("material" | "icons")[] = ["material"];
    class Custom extends WSLauncherViewController {
      static override returnTracks = tracks;
      constructor(...args: ConstructorParameters<typeof WSLauncherViewController>) { super(...args); constructed += 1; }
    }
    const shell = defineLauncher(Custom);
    tracks.push("icons");
    expect(shell.viewControllers.desktop).toBe(Custom);
    expect(shell.returnTracks.desktop).toEqual(["material"]);
    expect(Object.isFrozen(shell.returnTracks)).toBe(true);
    expect(Object.isFrozen(shell.returnTracks.desktop)).toBe(true);
    expect(constructed).toBe(0);
  });

  it.each([WSBoardViewController, class Launchpad extends WSBoardViewController { static override pageSize = 4; }])("captures Board requirements on a subclass", (Launcher) => {
    expect(defineLauncher(Launcher).returnTracks.mobile).toEqual(["material"]);
  });

  it("retains the two-track default for a launcher without a declaration", () => {
    expect(defineLauncher(class Plain extends WSLauncherViewController {}).returnTracks.desktop).toEqual(["material", "icons"]);
  });

  it.each([[], ["unknown"], ["material", "material"], "material"].map((returnTracks) => ({ returnTracks })))("rejects invalid requirements $returnTracks", ({ returnTracks }) => {
    class Invalid extends WSLauncherViewController {}
    Object.defineProperty(Invalid, "returnTracks", { value: returnTracks, enumerable: true });
    expect(() => defineLauncher(Invalid)).toThrow(/returnTracks/);
  });

  it("rejects requirement accessors without evaluating them", () => {
    let reads = 0;
    class Accessor extends WSLauncherViewController {}
    Object.defineProperty(Accessor, "returnTracks", { enumerable: true, get() { reads += 1; return ["material"]; } });
    expect(() => defineLauncher(Accessor)).toThrow(/returnTracks.*accessor/);
    expect(reads).toBe(0);
  });
});

describe("Webspring folder definition", () => {
  type Folder = { id: `folder.${string}`; title: { key: string }; order: number; apps: string[] };
  function defineFolders(initial: Folder[], extra: Record<string, unknown> = {}) {
    return createTestWebspring({
      info: { bundleIdentifier: "com.example.test.folders", displayName: "Folders", folders: { editable: true, initial } },
      ...extra as TestWebspringOptions,
    });
  }

  it("defaults to the split presentation and keeps a supplied one", () => {
    const Presentation = () => null;
    const defaults = defineFolders([{ id: "folder.tools", title: { key: "tools" }, order: 1, apps: ["one"] }]);
    expect(typeof defaults.folderPresentation).toBe("function");
    expect(defineFolders([], { folderPresentation: Presentation }).folderPresentation).toBe(Presentation);
    expect(() => defineFolders([], { folderPresentation: "split" })).toThrow(/folderPresentation.*React component/);
  });

  it("fills in the folder appearance's defaults and keeps a configured one", () => {
    expect(defineFolders([]).folderAppearance).toEqual({
      shape: { kind: "roundedRect", smoothSurface: { radius: "36%", curve: "squircle", smoothing: 0.6 } },
      fill: "inset",
    });
    expect(defineFolders([], { folderAppearance: { shape: { kind: "roundedRect", smoothSurface: { radius: 14, curve: "arc" } } } }).folderAppearance).toEqual({
      shape: { kind: "roundedRect", smoothSurface: { radius: 14, curve: "arc", smoothing: 0.6 } },
      fill: "inset",
    });
    const textured = defineFolders([], { folderAppearance: { shape: { kind: "circle" }, fill: { kind: "texture", image: "/cotton.jpg" } } });
    expect(textured.folderAppearance).toEqual({
      shape: { kind: "circle" },
      fill: { kind: "texture", image: "/cotton.jpg", size: "cover", colour: "transparent" },
    });
    expect(Object.isFrozen(textured.folderAppearance.fill)).toBe(true);
    expect(defineFolders([], { folderAppearance: { shape: { kind: "roundedRect", smoothSurface: { radius: "xl" } } } })
      .folderAppearance.shape).toMatchObject({ smoothSurface: { radius: "xl" } });
  });

  it.each([
    [{ shape: { kind: "hexagon" } }, /shape\.kind must be roundedRect or circle/],
    [{ shape: "circle" }, /shape must be a plain object/],
    [{ shape: { kind: "circle", smoothSurface: {} } }, /shape has unknown fields: smoothSurface/],
    [{ shape: { kind: "roundedRect", smoothSurface: { radius: "60%" } } }, /radius must be a percentage up to 50%/],
    [{ shape: { kind: "roundedRect", smoothSurface: { radius: -2 } } }, /radius must be/],
    [{ shape: { kind: "roundedRect", smoothSurface: { radius: "huge" } } }, /radius must be/],
    [{ shape: { kind: "roundedRect", smoothSurface: { curve: "bezier" } } }, /curve must be arc, squircle, superellipse or clothoid/],
    [{ shape: { kind: "roundedRect", smoothSurface: { smoothing: 2 } } }, /smoothing must be a number from 0 to 1/],
    [{ shape: { kind: "roundedRect", smoothSurface: { radius: null } } }, /radius must be/],
    [{ fill: "cotton" }, /fill must be inset or a texture/],
    [{ fill: { kind: "texture" } }, /fill\.image must be a nonempty string/],
    [{ fill: { kind: "texture", image: "/cotton.jpg", colour: "" } }, /fill\.colour must be a nonempty string/],
    [{ fill: { kind: "texture", image: "/cotton.jpg", repeat: true } }, /fill has unknown fields: repeat/],
    [{ outline: "none" }, /folderAppearance has unknown fields: outline/],
    ["inset", /folderAppearance must be a plain object/],
  ])("rejects the folder appearance %j", (folderAppearance, message) => {
    expect(() => defineFolders([], { folderAppearance })).toThrow(TypeError);
    expect(() => defineFolders([], { folderAppearance })).toThrow(message);
  });

  it("rejects duplicate folder IDs", () => {
    expect(() => defineFolders([
      { id: "folder.tools", title: { key: "a" }, order: 1, apps: ["one"] },
      { id: "folder.tools", title: { key: "b" }, order: 2, apps: ["two"] },
    ])).toThrow("Webspring manifest contains duplicate folder ID folder.tools.");
  });

  it("rejects an app listed in two folders", () => {
    expect(() => defineFolders([
      { id: "folder.tools", title: { key: "a" }, order: 1, apps: ["one", "two"] },
      { id: "folder.games", title: { key: "b" }, order: 2, apps: ["two"] },
    ])).toThrow("Webspring app two is listed in folders folder.tools and folder.games.");
  });
});

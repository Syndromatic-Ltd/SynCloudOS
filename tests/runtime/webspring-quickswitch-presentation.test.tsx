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
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEAnimationEnvironmentProvider, type NSEAnimator } from "../../src/NSE/Animation";
import type { AFXAnimationDefinition, AFXAnimationSettlement } from "../../src/FX/AnimationFX/animationTypes";
import type { SynCloudOSAppInfo } from "../../src/SynCloudOS/AppInfo/appInfoTypes";
import { SynCloudOSProvider } from "../../src/SynCloudOSReact";
import { WebspringQuickSwitchView } from "../../src/Webspring/WebspringQuickSwitchView";
import { fitQuickSwitch } from "../../src/Webspring/quickswitchModel";
import { defineWebspring } from "../../src/Webspring/public";
import { createTestRuntime } from "./helpers";


afterEach(cleanup);

function recordingAnimator() {
  const played: Array<{ definition: AFXAnimationDefinition; settle(): Promise<void> }> = [];
  const animator: NSEAnimator = {
    ownerAppId: "syncloudos.system",
    animations: {
      acquireOwner: (owner) => Object.freeze({ ...owner, epoch: 1, release() {} }),
      animate(_target, definition) {
        let resolve!: (settlement: AFXAnimationSettlement) => void;
        const finished = new Promise<AFXAnimationSettlement>((done) => { resolve = done; });
        played.push({
          definition: definition as AFXAnimationDefinition,
          async settle() { resolve({ state: "completed", reduced: false }); await act(async () => { await finished; }); },
        });
        return { id: "a", finished, progress: 0, state: "running", cancel: () => resolve({ state: "cancelled", reduced: false }),
          seek() {}, pause() {}, resume() {} };
      },
    } as NSEAnimator["animations"],
  };
  return { animator, played };
}

const apps = [{ version: "1.0.0", bundleIdentifier: "com.example.alpha", displayName: "Alpha", shortName: "Alpha", packageName: "com.test.alpha", route: "/alpha",
  icon: { src: "/icons/alpha.png" }, notifications: { badgeCount: 0 }, isDisabled: false } as unknown as SynCloudOSAppInfo];

it("drops the strip in and holds it until its exit settles; reduced motion only fades", async () => {
  const runtime = createTestRuntime();
  for (const reducedMotion of [false, true]) {
    const { animator, played } = recordingAnimator();
    const view = (open: boolean) => (
      <SynCloudOSProvider runtime={runtime}>
        <NSEAnimationEnvironmentProvider animator={animator} reducedMotion={reducedMotion}>
          <WebspringQuickSwitchView apps={apps} lifecycle={{}} onClose={() => undefined} open={open} openAppIds={[]} />
        </NSEAnimationEnvironmentProvider>
      </SynCloudOSProvider>
    );
    const rendered = render(view(true));
    const enter = played[0]!.definition;
    expect(enter).toMatchObject({ duration: 0.18, fill: "backwards" });
    expect(enter.animations.map(({ keyPath }) => keyPath)).toEqual(reducedMotion ? ["opacity"] : ["opacity", "transform"]);
    if (!reducedMotion) expect(enter.animations[1]).toMatchObject({ from: "translate(0px, -14px) scale(0.985)", to: "none" });
    rendered.rerender(view(false));
    const exit = played.at(-1)!;
    expect(exit.definition.fill).toBe("forwards");
    expect(screen.getByRole("dialog", { name: "QuickSwitch" })).toBeTruthy();
    await exit.settle();
    expect(screen.queryByRole("dialog", { name: "QuickSwitch" })).toBeNull();
    rendered.unmount();
  }
});

const row = ["com.example.alpha", "com.example.beta", "com.example.gamma"].map((id) => ({ version: "1.0.0", ...apps[0], bundleIdentifier: id, displayName: id, shortName: id, packageName: `com.test.${id}`, route: `/${id.split(".").at(-1)}` }) as unknown as SynCloudOSAppInfo);

it("selects on hover without scrolling the row; keyboard selection only scrolls as far as needed", () => {
  const scrollIntoView = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  try {
    const { animator } = recordingAnimator();
    render(
      <SynCloudOSProvider runtime={createTestRuntime()}>
        <NSEAnimationEnvironmentProvider animator={animator} reducedMotion>
          <WebspringQuickSwitchView apps={row} lifecycle={{}} onClose={() => undefined} open openAppIds={[]} />
        </NSEAnimationEnvironmentProvider>
      </SynCloudOSProvider>
    );
    const options = screen.getAllByRole("option");
    scrollIntoView.mockClear();
    // Hovering the end icon used to centre it, sliding the whole row under the pointer.
    fireEvent.pointerEnter(options[2]!);
    expect(options[2]!.getAttribute("aria-selected")).toBe("true");
    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog", { name: "QuickSwitch" }), { key: "ArrowLeft" });
    expect(options[1]!.getAttribute("aria-selected")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});

it("grows to the screen edge, then shrinks icons by default or scrolls when the shell asks", () => {
  const icons = { count: 5, iconSize: 72, iconGap: 14 };
  expect(fitQuickSwitch({ ...icons, room: 1000, overflow: "shrink" })).toEqual({ fit: 1, overflowing: false });
  expect(fitQuickSwitch({ ...icons, room: 208, overflow: "shrink" })).toEqual({ fit: 0.5, overflowing: false });
  expect(fitQuickSwitch({ ...icons, room: 1000, overflow: "scroll" })).toEqual({ fit: 1, overflowing: false });
  expect(fitQuickSwitch({ ...icons, room: 208, overflow: "scroll" })).toEqual({ fit: 1, overflowing: true });
  expect(fitQuickSwitch({ ...icons, count: 0, room: 0, overflow: "shrink" }).fit).toBe(1);
});

it("captures the QuickSwitch overflow choice and rejects anything else", () => {
  const base = { manifest: {
    schemaVersion: 1, bundleIdentifier: "com.example.quickswitch", displayName: "QuickSwitch", version: "1.0.0",
    webspringShell: { views: [{ id: "site", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }], defaults: { desktop: "site", tablet: "site", mobile: "site" }, homeRoute: "/", branding: { name: { key: "site.name", fallback: "QuickSwitch" } } },
  }, components: { site: () => null } } as const;
  expect(defineWebspring(base).quickSwitch).toBeUndefined();
  expect(defineWebspring({ ...base, quickSwitch: { overflow: "scroll" } }).quickSwitch).toEqual({ overflow: "scroll" });
  expect(() => defineWebspring({ ...base, quickSwitch: { overflow: "grow" as "scroll" } })).toThrow("shrink or scroll");
  expect(() => defineWebspring({ ...base, quickSwitch: { scrollable: true } as never })).toThrow("unknown fields: scrollable");
});

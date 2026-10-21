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
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineNSETheme, NSEThemeProvider, type NSEThemeDefinition, type NSEContrast } from "@syndromatic/syncloudos/nse";
import { atmoTheme } from "@syndromatic/syncloudos/nse/themes/atmo";
import { NSEMetalThumb, NSEMaterialLightingProvider } from "../../../src/NSE/Appearance/NSEMetalThumb";
import { NSEMaterialLighting, staticNSEMaterialLight, type NSEMaterialLight } from "../../../src/NSE/Appearance/NSEMaterialLighting";
import type { AFXFrameScheduler } from "../../../src/FX/AnimationFX/AFXLayer";
import type { MFXMotionManager } from "../../../src/FX/MotionFX/MFXMotionManager";

afterEach(cleanup);
const custom = defineNSETheme({ id: "test.independent", displayName: "Independent" });
const themes = [atmoTheme, custom];

function lightingPort() {
  const listeners = new Set<() => void>();
  let value: NSEMaterialLight = { offset: { x: 0.1, y: 0.1 }, angle: 0.12, active: true };
  const release = vi.fn();
  return {
    listeners, release,
    getSnapshot: () => value,
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); release(); };
    }),
    publish(next: NSEMaterialLight) { value = next; for (const listener of listeners) listener(); },
  };
}

describe("explicit metal thumbs are independent of theme identity", () => {
  it.each([undefined, ...themes])("subscribes under $id, including the neutral default", (appearance) => {
    const light = lightingPort();
    const thumb = <NSEMaterialLightingProvider value={light}><NSEMetalThumb /></NSEMaterialLightingProvider>;
    const view = render(appearance ? <NSEThemeProvider theme={appearance}>{thumb}</NSEThemeProvider> : thumb);
    const element = view.container.querySelector<HTMLElement>(".nse-metal-thumb")!;
    expect(light.listeners.size).toBe(1);
    expect(element.dataset.lighting).toBe("reactive");
    expect(element.style.getPropertyValue("--nse-metal-angle")).toBe("0.12rad");
    act(() => light.publish(staticNSEMaterialLight));
    expect(element.dataset.lighting).toBe("static");
    view.unmount();
    expect(light.listeners.size).toBe(0);
    expect(light.release).toHaveBeenCalledOnce();
  });

  it("keeps the same subscription across themes, releasing it for disabled or forced colour controls", () => {
    const light = lightingPort();
    const fixture = (appearance: NSEThemeDefinition, disabled = false, contrast: NSEContrast = "normal") =>
      <NSEThemeProvider theme={appearance} contrast={contrast}>
        <NSEMaterialLightingProvider value={light}><NSEMetalThumb disabled={disabled} /></NSEMaterialLightingProvider>
      </NSEThemeProvider>;
    const view = render(fixture(atmoTheme));
    const element = view.container.querySelector(".nse-metal-thumb");
    for (const theme of themes) {
      view.rerender(fixture(theme));
      expect(view.container.querySelector(".nse-metal-thumb")).toBe(element);
      expect(light.listeners.size).toBe(1);
    }
    expect(light.subscribe).toHaveBeenCalledOnce();
    view.rerender(fixture(custom, true));
    expect(light.listeners.size).toBe(0);
    expect(element?.getAttribute("data-lighting")).toBe("static");
    view.rerender(fixture(custom, false, "forced"));
    expect(light.listeners.size).toBe(0);
    view.rerender(fixture(custom, false, "high"));
    expect(light.listeners.size).toBe(1);
    view.unmount();
    expect(light.listeners.size).toBe(0);
  });

  it.each(themes)("does not hide explicitly requested metal paint under $id", (appearance) => {
    const style = document.createElement("style");
    // Exercise the published material's suppression rules without relying on
    // jsdom support for the conic-gradient and texture rendering declarations.
    const css = readFileSync("src/NSE/Appearance/metal-thumb.css", "utf8");
    style.textContent = css.split("\n").filter((line) => line.startsWith(":where(")).join("\n");
    document.head.append(style);
    try {
      const view = render(<NSEThemeProvider theme={appearance}><NSEMetalThumb /></NSEThemeProvider>);
      expect(getComputedStyle(view.container.querySelector(".nse-metal-thumb")!).display).not.toBe("none");
    } finally { style.remove(); }
  });

  it("leaves reduced-motion suspension and resumption with the shared lighting scheduler", () => {
    let reduced = true;
    const states = new Set<() => void>();
    const dispose = vi.fn();
    const create = vi.fn(() => ({
      setDeviceMotionUpdateInterval() {}, startDeviceMotionUpdates() {}, dispose,
    }) as unknown as MFXMotionManager);
    const scheduler: AFXFrameScheduler = {
      now: () => 0,
      get reducedMotion() { return reduced; },
      suspended: false,
      requestFrame: () => () => undefined,
      subscribeState(listener) { states.add(listener); return () => { states.delete(listener); }; },
    };
    const store = new NSEMaterialLighting(create, scheduler);
    const view = render(<NSEThemeProvider theme={custom}>
      <NSEMaterialLightingProvider value={store}><NSEMetalThumb /></NSEMaterialLightingProvider>
    </NSEThemeProvider>);
    expect(states.size).toBe(1);
    expect(create).not.toHaveBeenCalled();
    act(() => { reduced = false; for (const listener of states) listener(); });
    expect(create).toHaveBeenCalledOnce();
    act(() => { reduced = true; for (const listener of states) listener(); });
    expect(dispose).toHaveBeenCalledOnce();
    expect(store.getSnapshot()).toBe(staticNSEMaterialLight);
    view.unmount();
    expect(states.size).toBe(0);
  });
});

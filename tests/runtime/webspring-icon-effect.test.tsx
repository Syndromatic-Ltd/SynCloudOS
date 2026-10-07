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
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defineWebspring } from "../../src/Webspring/Webspring";
import { WebspringIconEffect, WebspringIconEffectProvider } from "../../src/Webspring/WebspringIconEffect";

const manifest = {
  schemaVersion: 1, id: "test.icon-decoration", version: "1.0.0", title: "Decoration",
  webspringShell: { views: [{ id: "custom", presentations: ["desktop", "tablet", "mobile"], mode: "launcher" }],
    defaults: { desktop: "custom", tablet: "custom", mobile: "custom" }, homeRoute: "/",
    branding: { name: { key: "name", fallback: "Decoration" } } },
} as const;

describe("site-owned shell icon decoration", () => {
  it("captures a component without invoking it and passes selection state to its mounted instance", () => {
    let calls = 0;
    const Effect = ({ active, subtle }: { active: boolean; subtle: boolean }) => {
      calls++; return <output data-testid="effect">{String(active)}:{String(subtle)}</output>;
    };
    const shell = defineWebspring({ manifest, components: { custom: () => null }, iconEffect: Effect });
    expect(calls).toBe(0);
    expect(shell.iconEffect).toBe(Effect);
    const view = render(<WebspringIconEffectProvider component={shell.iconEffect}><WebspringIconEffect active subtle /></WebspringIconEffectProvider>);
    expect(screen.getByTestId("effect").textContent).toBe("true:true");
    view.rerender(<WebspringIconEffectProvider component={shell.iconEffect}><WebspringIconEffect active={false} /></WebspringIconEffectProvider>);
    expect(screen.getByTestId("effect").textContent).toBe("false:false");
    view.unmount();
  });
  it("renders no decoration when the shell does not declare one", () => {
    const shell = defineWebspring({ manifest, components: { custom: () => null } });
    const view = render(<WebspringIconEffectProvider component={shell.iconEffect}><WebspringIconEffect active /></WebspringIconEffectProvider>);
    expect(view.container.innerHTML).toBe("");
    view.unmount();
  });
  it("rejects accessors and invalid decorations without executing them", () => {
    let reads = 0;
    const input = Object.defineProperty({ manifest, components: { custom: () => null } }, "iconEffect", {
      enumerable: true, get() { reads++; return () => null; },
    });
    expect(() => defineWebspring(input)).toThrow(/iconEffect.*accessor/);
    expect(reads).toBe(0);
    expect(() => defineWebspring({ manifest, components: { custom: () => null }, iconEffect: "effect" } as never)).toThrow(/iconEffect.*component/);
  });
});

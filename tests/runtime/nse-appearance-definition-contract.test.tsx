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

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as appearanceModule from "../../src/NSE/public/theme";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";
import { NSEOverlayProvider } from "../../src/NSE/Overlays";
import type { NSEOverlayRuntimePort } from "../../src/NSE/Overlays/overlayTypes";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";

type AppearanceRecipe = Readonly<{
  readonly slot: string;
  readonly recipeId: string;
}>;

type AppearanceDefinition = Readonly<{
  readonly id: string;
  readonly displayName: string;
  readonly recipes: readonly AppearanceRecipe[];
}>;

type AppearanceDefinitionInput = Readonly<{
  readonly id: string;
  readonly displayName: string;
  readonly recipes?: readonly AppearanceRecipe[];
}>;

type AppearanceModuleContract = {
  readonly defineNSETheme?: unknown;
  readonly NSEThemeProvider?: unknown;
};

type DefineNSEAppearance = (definition: AppearanceDefinitionInput) => AppearanceDefinition;

type AppearanceProviderProps = PropsWithChildren<{
  readonly theme: AppearanceDefinition;
  readonly appearance?: "auto" | "light" | "dark";
  readonly resolvedAppearance?: "light" | "dark";
  readonly contrast?: "normal" | "high" | "forced";
  readonly transparency?: "normal" | "reduced";
}>;

type AppearanceProviderComponent = React.ComponentType<AppearanceProviderProps>;

const appearanceContract = appearanceModule as typeof appearanceModule & AppearanceModuleContract;

function definitionFactory(): DefineNSEAppearance {
  const candidate = appearanceContract.defineNSETheme;
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("defineNSETheme is not available");
  }
  return candidate as DefineNSEAppearance;
}

function appearanceProvider(): AppearanceProviderComponent {
  const candidate = appearanceContract.NSEThemeProvider;
  expect(typeof candidate).toBe("function");
  if (typeof candidate !== "function") {
    throw new Error("NSEThemeProvider is not available");
  }
  return candidate as AppearanceProviderComponent;
}

function overlayRuntime(runtimeId = "runtime:appearance-contract"): NSEOverlayRuntimePort {
  const controller = new AbortController();
  const workArea = { width: 1024, height: 768, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } } as const;
  const visualViewport = { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 } as const;
  const presentation = createStaticPresentationPort({ width: 1024, height: 768 });
  return {
    runtimeId,
    signal: controller.signal,
    environment: {
      browser: { getDocument: () => document, getWindow: () => window },
      workArea: {
        getSnapshot: () => workArea,
        subscribe: () => () => undefined,
      },
      visualViewport: {
        getSnapshot: () => visualViewport,
        subscribe: () => () => undefined,
      },
      presentation,
      setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    restoreFocus: () => undefined,
    reportPlacementFailure: () => undefined,
    wrapFocusScope: (_options, children) => children,
  };
}

function expectAppearanceProjection(element: Element | null, id: string) {
  expect(element?.getAttribute("data-nse-theme")).toBe(id);
  expect(element?.getAttribute("data-nse-appearance")).toBe("dark");
  expect(element?.getAttribute("data-nse-contrast")).toBe("high");
  expect(element?.getAttribute("data-nse-transparency")).toBe("reduced");
}

afterEach(cleanup);

describe("NSE appearance definition boundary", () => {
  it("exports frozen definition clones with validated identity, recipes and trimmed display names", () => {
    const defineNSETheme = definitionFactory();
    const input = {
      id: "com.test.custom-test",
      displayName: "Custom Test",
      recipes: [
        {
          slot: "button.primary",
          recipeId: "custom-test.button.primary",
        },
      ],
    };

    const definition = defineNSETheme(input);

    expect(definition).toMatchObject({
      id: "com.test.custom-test",
      displayName: "Custom Test",
      recipes: [{ slot: "button.primary", recipeId: "custom-test.button.primary" }],
    });
    expect(definition).not.toBe(input);
    expect(definition.recipes).not.toBe(input.recipes);
    expect(definition.recipes[0]).not.toBe(input.recipes[0]);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.recipes)).toBe(true);
    expect(Object.isFrozen(definition.recipes[0])).toBe(true);
  });

  it("defaults omitted recipes to a frozen empty array", () => {
    const defineNSETheme = definitionFactory();
    const definition = defineNSETheme({ id: "com.test.atmo", displayName: "Atmo" });

    expect(definition.recipes).toEqual([]);
    expect(Object.isFrozen(definition.recipes)).toBe(true);
  });

  it("rejects blank or duplicate recipe slots and recipe IDs", () => {
    const defineNSETheme = definitionFactory();
    const base = { id: "com.test.atmo", displayName: "Atmo" };

    for (const slot of ["", " \t\n "]) {
      expect(() => defineNSETheme({
        ...base,
        recipes: [{ slot, recipeId: "atmo.button.primary" }],
      })).toThrow();
    }
    for (const recipeId of ["", " \t\n "]) {
      expect(() => defineNSETheme({
        ...base,
        recipes: [{ slot: "button.primary", recipeId }],
      })).toThrow();
    }
    expect(() => defineNSETheme({
      ...base,
      recipes: [
        { slot: "button.primary", recipeId: "atmo.button.primary" },
        { slot: "button.primary", recipeId: "atmo.button.secondary" },
      ],
    })).toThrow();
    expect(() => defineNSETheme({
      ...base,
      recipes: [
        { slot: "button.primary", recipeId: "atmo.button.primary" },
        { slot: "button.secondary", recipeId: "atmo.button.primary" },
      ],
    })).toThrow();
  });

  it("rejects invalid IDs and blank display names", () => {
    const defineNSETheme = definitionFactory();

    for (const id of ["", "Atmo", "atmo_onyx", "-atmo", "atmo onyx"]) {
      expect(() => defineNSETheme({ id, displayName: "Atmo" })).toThrow();
    }
    expect(() => defineNSETheme({ id: "com.test.atmo", displayName: " \t\n " })).toThrow();
  });

  it("projects one appearance identity to its wrapper and portal while retaining environment state", async () => {
    const defineNSETheme = definitionFactory();
    const definition = defineNSETheme({
      id: "com.test.custom-test",
      displayName: "Custom Test",
      recipes: [{ slot: "button.primary", recipeId: "custom-test.button.primary" }],
    });
    const Provider = appearanceProvider();

    render(
      <Provider
        theme={definition}
        appearance="auto"
        resolvedAppearance="dark"
        contrast="high"
        transparency="reduced"
      >
        <NSEOverlayProvider runtimePort={overlayRuntime()}>
          <span data-testid="appearance-child">Appearance child</span>
        </NSEOverlayProvider>
      </Provider>,
    );

    expectAppearanceProjection(
      screen.getByTestId("appearance-child").closest("[data-nse-appearance]"),
      definition.id,
    );

    const portalHost = await waitFor(() => {
      const host = document.querySelector("[data-nse-overlay-portal-host]");
      if (!host) throw new Error("NSE overlay portal host has not mounted");
      return host;
    });
    expectAppearanceProjection(portalHost, definition.id);
  });

  it("changes only appearance identity when definitions switch around a mounted push button", () => {
    const defineNSETheme = definitionFactory();
    const firstDefinition = defineNSETheme({
      id: "com.test.atmo",
      displayName: "Atmo",
      recipes: [{ slot: "button.primary", recipeId: "atmo.button.primary" }],
    });
    const secondDefinition = defineNSETheme({
      id: "com.test.classic",
      displayName: "Classic",
      recipes: [{ slot: "button.primary", recipeId: "classic.button.primary" }],
    });
    const Provider = appearanceProvider();
    const onClick = vi.fn();
    const providerProps = {
      appearance: "auto" as const,
      resolvedAppearance: "dark" as const,
      contrast: "high" as const,
      transparency: "reduced" as const,
    };

    const { rerender } = render(
      <Provider {...providerProps} theme={firstDefinition}>
        <NSEPushButton onClick={onClick}>Continue</NSEPushButton>
      </Provider>,
    );

    const firstButton = screen.getByRole("button", { name: "Continue" });
    expect((firstButton as HTMLButtonElement).disabled).toBe(false);
    expect(firstButton.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.test.atmo");
    expect(firstButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-appearance")).toBe("dark");
    expect(firstButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-contrast")).toBe("high");
    expect(firstButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-transparency")).toBe("reduced");
    fireEvent.click(firstButton);
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Provider {...providerProps} theme={secondDefinition}>
        <NSEPushButton onClick={onClick}>Continue</NSEPushButton>
      </Provider>,
    );

    const secondButton = screen.getByRole("button", { name: "Continue" });
    expect((secondButton as HTMLButtonElement).disabled).toBe(false);
    expect(secondButton.closest("[data-nse-theme]")?.getAttribute("data-nse-theme")).toBe("com.test.classic");
    expect(secondButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-appearance")).toBe("dark");
    expect(secondButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-contrast")).toBe("high");
    expect(secondButton.closest("[data-nse-appearance]")?.getAttribute("data-nse-transparency")).toBe("reduced");
    fireEvent.click(secondButton);
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

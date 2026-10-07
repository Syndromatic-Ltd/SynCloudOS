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
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, expect, it } from "vitest";

import {
  NSEPreferencesController,
  useNSEController,
} from "../../src/NSE/Controllers";

afterEach(cleanup);

it("rerenders only when the selected preference changes", () => {
  const values = new Map<string, unknown>([
    ["editor", { version: 1, theme: "grey" }],
  ]);
  const controller = new NSEPreferencesController({
    namespace: "editor",
    schema: {
      version: 2,
      defaults: { theme: "system", lineNumbers: true },
      fields: {
        theme: {
          validate: (value): value is string => typeof value === "string",
        },
        lineNumbers: {
          validate: (value): value is boolean => typeof value === "boolean",
        },
      },
      migrations: [
        {
          from: 1,
          to: 2,
          migrate: (value) => ({
            theme: value.theme === "grey" ? "system" : value.theme,
            lineNumbers: true,
          }),
        },
      ],
    },
    adapter: {
      read: (key) => values.get(key) ?? null,
      write: (key, value) => void values.set(key, value),
      remove: (key) => void values.delete(key),
    },
  });
  let renders = 0;
  function Harness() {
    renders += 1;
    const theme = useNSEController(
      controller,
      (snapshot) => snapshot.value.theme,
    );
    return <output>{theme}</output>;
  }
  const view = render(<Harness />);
  expect(screen.getByText("system")).toBeTruthy();
  act(() => controller.set("lineNumbers", false));
  expect(renders).toBe(1);
  act(() => controller.set("theme", "dark"));
  expect(screen.getByText("dark")).toBeTruthy();
  expect(renders).toBe(2);
  view.unmount();
  act(() => controller.set("theme", "light"));
  expect(renders).toBe(2);
  controller.dispose();
});

it("uses caller equality to preserve a selected object reference", () => {
  const controller = new NSEPreferencesController({
    namespace: "object-selector",
    schema: {
      version: 1,
      defaults: { theme: "system", lineNumbers: true },
      fields: {
        theme: {
          validate: (value): value is string => typeof value === "string",
        },
        lineNumbers: {
          validate: (value): value is boolean => typeof value === "boolean",
        },
      },
      migrations: [],
    },
    adapter: { read: () => null, write: () => undefined, remove: () => undefined },
  });
  let renders = 0;
  function Harness() {
    renders += 1;
    const selection = useNSEController(
      controller,
      (snapshot) => ({ theme: snapshot.value.theme }),
      (left, right) => left.theme === right.theme,
    );
    return <output>{selection.theme}</output>;
  }
  render(<Harness />);
  act(() => controller.set("lineNumbers", false));
  expect(renders).toBe(1);
  controller.dispose();
});

it("recomputes a selection when selector semantics change for the same snapshot", () => {
  const controller = new NSEPreferencesController({
    namespace: "selector-freshness",
    schema: {
      version: 1,
      defaults: { theme: "system", lineNumbers: true },
      fields: {
        theme: { validate: (value): value is string => typeof value === "string" },
        lineNumbers: { validate: (value): value is boolean => typeof value === "boolean" },
      },
      migrations: [],
    },
    adapter: { read: () => null, write: () => undefined, remove: () => undefined },
  });
  function Harness({ mode }: { readonly mode: "theme" | "line-numbers" }) {
    const selection = useNSEController(
      controller,
      (snapshot) =>
        mode === "theme" ? snapshot.value.theme : String(snapshot.value.lineNumbers),
      (left, right) => left === right,
    );
    return <output>{selection}</output>;
  }

  const view = render(<Harness mode="theme" />);
  expect(screen.getByText("system")).toBeTruthy();
  view.rerender(<Harness mode="line-numbers" />);
  expect(screen.getByText("true")).toBeTruthy();
  controller.dispose();
});

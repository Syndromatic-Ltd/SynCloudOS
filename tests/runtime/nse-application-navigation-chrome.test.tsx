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
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  NSEApplicationNavigationChromeController,
  NSEApplicationNavigationChromeProvider,
  NSEHierarchyStack,
  NSENavigationStackController,
  NSETabBarController,
  useNSEApplicationNavigationChrome,
  type NSEApplicationNavigationChromeState,
} from "../../src/NSE/Navigation";

afterEach(cleanup);

function chromeState(ownerId: string, title: string): NSEApplicationNavigationChromeState {
  return {
    ownerId,
    title,
    back: {
      label: `Back to ${title}`,
      onActivate: () => undefined,
    },
  };
}

function ChromeRegistration({ state }: { readonly state: NSEApplicationNavigationChromeState | null }) {
  useNSEApplicationNavigationChrome(state);
  return null;
}

function StageChromeBackControl({ controller }: { readonly controller: NSEApplicationNavigationChromeController }) {
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (!snapshot.active?.back) return null;
  return <button type="button" aria-label={snapshot.active.back.label} onClick={snapshot.active.back.onActivate}>Back</button>;
}

describe("NSE application navigation chrome", () => {
  it("keeps an unclaimed hierarchy local even inside an application chrome provider", async () => {
    const tabs = new NSETabBarController<React.ReactNode>({
      id: "unclaimed-hierarchy-tabs",
      destinations: [
        { id: "home", label: "Home", icon: { kind: "template", name: "home" } },
        { id: "library", label: "Library", icon: { kind: "template", name: "library" } },
      ],
    });
    const stack = new NSENavigationStackController({
      id: "unclaimed-hierarchy-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const controller = new NSEApplicationNavigationChromeController();
    render(
      <NSEApplicationNavigationChromeProvider controller={controller}>
        <NSEHierarchyStack controller={tabs} stackController={stack} aria-label="Unclaimed hierarchy" />
      </NSEApplicationNavigationChromeProvider>,
    );

    expect(controller.getSnapshot().active).toBeNull();
    await stack.push("library");
    expect(controller.getSnapshot().active).toBeNull();

    stack.dispose();
    tabs.dispose();
    controller.dispose();
  });

  it("rejects a second application claim and ignores a stale release", () => {
    const controller = new NSEApplicationNavigationChromeController();
    const first = controller.claim("application:fixture");
    expect(first).not.toBeNull();
    first?.update({ title: "First destination", back: null });

    const duplicate = controller.claim("application:fixture");
    const other = controller.claim("application:other");
    expect(duplicate).toBeNull();
    expect(other).toBeNull();
    expect(controller.getSnapshot().active).toMatchObject({
      ownerId: "application:fixture",
      title: "First destination",
    });

    duplicate?.release();
    expect(controller.getSnapshot().active?.ownerId).toBe("application:fixture");
    first?.release();
    expect(controller.getSnapshot().active).toBeNull();
    first?.release();
    controller.dispose();
  });

  it("bridges compact hierarchy Back and title state to shared chrome without a second visible strip", async () => {
    const tabs = new NSETabBarController<React.ReactNode>({
      id: "hierarchy-chrome-tabs",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" } },
        { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" } },
      ],
    });
    const stack = new NSENavigationStackController({
      id: "fixture-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const chromeController = new NSEApplicationNavigationChromeController();
    render(
      <NSEApplicationNavigationChromeProvider controller={chromeController}>
        <button type="button" onClick={() => { void stack.push("library"); }}>
          Open Library destination
        </button>
        <NSEHierarchyStack
          controller={tabs}
          stackController={stack}
          applicationChrome={{ ownerId: "application:hierarchy-fixture" }}
          rootTitle="Fixture root"
          title="Library detail"
          aria-label="Hierarchy fixture"
        />
        <StageChromeBackControl controller={chromeController} />
      </NSEApplicationNavigationChromeProvider>,
    );

    const open = screen.getByRole("button", { name: "Open Library destination" });
    open.focus();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    await waitFor(() => expect(chromeController.getSnapshot().active).toMatchObject({
      ownerId: "application:hierarchy-fixture",
      title: "Library detail",
      back: { label: "Back to Home destination" },
    }));
    expect(screen.queryByText("Back", { selector: ".nse-hierarchy-stack button" })).toBeNull();
    expect(document.querySelector(".nse-hierarchy-stack-current")).toBeNull();
    const bridge = document.querySelector<HTMLElement>("[data-nse-hierarchy-stack=\"true\"]");
    expect(bridge?.tagName).toBe("SPAN");
    expect(bridge?.hidden).toBe(true);
    expect(bridge?.hasAttribute("data-nse-hierarchy-stack-label")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Back to Home destination" }));
    await waitFor(() => expect(stack.getSnapshot().path).toEqual([]));
    await waitFor(() => expect(document.activeElement).toBe(open));

    chromeController.dispose();
    stack.dispose();
    tabs.dispose();
  });

  it("retains one explicit application claim through StrictMode effect replay", () => {
    const controller = new NSEApplicationNavigationChromeController();
    render(
      <React.StrictMode>
        <NSEApplicationNavigationChromeProvider controller={controller}>
          <ChromeRegistration state={chromeState("application:strict", "Strict destination")} />
        </NSEApplicationNavigationChromeProvider>
      </React.StrictMode>,
    );

    expect(controller.getSnapshot().active).toMatchObject({
      ownerId: "application:strict",
      title: "Strict destination",
    });
    controller.dispose();
  });
});

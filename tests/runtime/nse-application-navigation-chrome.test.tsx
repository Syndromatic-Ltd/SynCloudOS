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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApplicationNavigationChromeController,
  ApplicationNavigationChromeProvider,
  HierarchyStack,
  NavigationStackController,
  TabBarController,
  useNSEApplicationNavigationChrome,
  type NSEApplicationNavigationChromeState,
} from "../../src/NSE/Navigation";

import { LocalisationProvider, useNSEMoreTitle } from "../../src/NSE/Navigation/compactMoreTitle";

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

function StageChromeBackControl({ controller }: { readonly controller: ApplicationNavigationChromeController }) {
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (!snapshot.active?.back) return null;
  return <button type="button" aria-label={snapshot.active.back.label} onClick={snapshot.active.back.onActivate}>Back</button>;
}

describe("NSE application navigation chrome", () => {
  it("claims released chrome with the latest pending state and stops waiting on unmount", () => {
    const controller = new ApplicationNavigationChromeController();
    const split = controller.claim("split:initial")!;
    split.update({ title: "Split", back: null });
    const view = render(<ApplicationNavigationChromeProvider controller={controller}>
      <ChromeRegistration state={chromeState("gallery", "First")} />
    </ApplicationNavigationChromeProvider>);
    view.rerender(<ApplicationNavigationChromeProvider controller={controller}>
      <ChromeRegistration state={chromeState("gallery", "Sections")} />
    </ApplicationNavigationChromeProvider>);
    expect(controller.getSnapshot().active?.ownerId).toBe("split:initial");
    act(() => split.release());
    expect(controller.getSnapshot().active).toMatchObject({ ownerId: "gallery", title: "Sections" });
    view.unmount();
    expect(controller.getSnapshot().active).toBeNull();
    const next = controller.claim("next")!;
    next.update({ title: "Next", back: null });
    next.release();
    expect(controller.getSnapshot().active).toBeNull();
    controller.dispose();
  });

  it("keeps an unclaimed hierarchy local even inside an application chrome provider", async () => {
    const tabs = new TabBarController<React.ReactNode>({
      id: "unclaimed-hierarchy-tabs",
      destinations: [
        { id: "home", label: "Home", icon: { kind: "template", name: "home" } },
        { id: "library", label: "Library", icon: { kind: "template", name: "library" } },
      ],
    });
    const stack = new NavigationStackController({
      id: "unclaimed-hierarchy-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const controller = new ApplicationNavigationChromeController();
    render(
      <ApplicationNavigationChromeProvider controller={controller}>
        <HierarchyStack controller={tabs} stackController={stack} aria-label="Unclaimed hierarchy" />
      </ApplicationNavigationChromeProvider>,
    );

    expect(controller.getSnapshot().active).toBeNull();
    await stack.push("library");
    expect(controller.getSnapshot().active).toBeNull();

    stack.dispose();
    tabs.dispose();
    controller.dispose();
  });

  it("rejects a second application claim and ignores a stale release", () => {
    const controller = new ApplicationNavigationChromeController();
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
    const tabs = new TabBarController<React.ReactNode>({
      id: "hierarchy-chrome-tabs",
      destinations: [
        { id: "home", label: "Home", accessibleLabel: "Home destination", icon: { kind: "template", name: "home" } },
        { id: "library", label: "Library", accessibleLabel: "Library destination", icon: { kind: "template", name: "library" } },
      ],
    });
    const stack = new NavigationStackController({
      id: "fixture-stack",
      rootDestinationId: "home",
      destinationIds: ["home", "library"],
    });
    const chromeController = new ApplicationNavigationChromeController();
    render(
      <ApplicationNavigationChromeProvider controller={chromeController}>
        <button type="button" onClick={() => { void stack.push("library"); }}>
          Open Library destination
        </button>
        <HierarchyStack
          controller={tabs}
          stackController={stack}
          applicationChrome={{ ownerId: "application:hierarchy-fixture" }}
          rootTitle="Fixture root"
          title="Library detail"
          aria-label="Hierarchy fixture"
        />
        <StageChromeBackControl controller={chromeController} />
      </ApplicationNavigationChromeProvider>,
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
    const controller = new ApplicationNavigationChromeController();
    render(
      <React.StrictMode>
        <ApplicationNavigationChromeProvider controller={controller}>
          <ChromeRegistration state={chromeState("application:strict", "Strict destination")} />
        </ApplicationNavigationChromeProvider>
      </React.StrictMode>,
    );

    expect(controller.getSnapshot().active).toMatchObject({
      ownerId: "application:strict",
      title: "Strict destination",
    });
    controller.dispose();
  });
});


it("localises compact navigation through an NSE-owned host capability and releases its subscription", () => {
  const listeners = new Set<() => void>();
  let title = "More destinations";
  const locale = {
    getSnapshot: () => title,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    t: (key: string) => key === "navigation.more" ? title : key,
  };
  function MoreTitle() { return <output>{useNSEMoreTitle()}</output>; }
  const view = render(<LocalisationProvider value={locale}><MoreTitle /></LocalisationProvider>);
  expect(screen.getByText("More destinations")).toBeTruthy();
  act(() => { title = "Weitere Ziele"; for (const listener of listeners) listener(); });
  expect(screen.getByText("Weitere Ziele")).toBeTruthy();
  view.unmount();
  expect(listeners.size).toBe(0);
  render(<MoreTitle />);
  expect(screen.getByText("More")).toBeTruthy();
});

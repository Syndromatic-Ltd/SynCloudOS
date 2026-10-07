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

import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NSESourceListScene } from "../../src/NSE/Navigation/SourceList";
import { NSEAdaptiveNavigationController, NSETabBarController } from "../../src/NSE/Navigation";
import { createStaticPresentationTraits } from "../fixtures/presentationTraits";

afterEach(cleanup);

describe("adaptive bottom-tab projection", () => {
  it("projects an explicit content-glyph sidebar descriptor without replacing the compact navigation icon", () => {
    const tabs = new NSETabBarController<React.ReactNode>({
      id: "source-list-content-glyph-tabs",
      destinations: [
        {
          id: "overview",
          label: "Overview",
          accessibleLabel: "Overview destination",
          icon: { kind: "vector", path: "/navigation/overview.svg" },
          sidebarItem: {
            glyph: "/content/overview.png",
            glyphFramed: true,
            glyphSize: "large",
          },
          createContent: () => <article>Overview content</article>,
        },
      ],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "source-list-content-glyph-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 1440, height: 900 }),
    });
    render(<NSESourceListScene projection={{ controller: tabs, adaptiveController: adaptive, ariaLabel: "Content glyph projection" }} />);

    const row = screen.getByRole("button", { name: "Overview destination" });
    const glyph = row.querySelector<HTMLElement>(".nse-sidebar-item-glyph");
    expect(glyph?.style.backgroundImage).toContain("/content/overview.png");
    expect(glyph?.classList.contains("nse-sidebar-item-glyph-framed")).toBe(true);
    expect(glyph?.classList.contains("nse-sidebar-item-glyph-large")).toBe(true);
    expect(tabs.getDestination("overview")?.icon).toEqual({ kind: "vector", path: "/navigation/overview.svg" });

    adaptive.dispose();
    tabs.dispose();
  });

  it("projects vector icons and preserves an intentionally unlabeled singleton source-list group", () => {
    const tabs = new NSETabBarController<React.ReactNode>({
      id: "source-list-icon-projection-tabs",
      destinations: [
        {
          id: "overview",
          label: "Overview",
          accessibleLabel: "Overview destination",
          icon: { kind: "vector", path: "/navigation/overview.svg" },
          createContent: () => <article>Overview content</article>,
        },
      ],
      sections: [{ id: "overview", destinationIds: ["overview"] }],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "source-list-icon-projection-adaptive",
      model: "peer",
      presentation: "adaptive",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 1440, height: 900 }),
    });
    const { container } = render(
      <NSESourceListScene projection={{ controller: tabs, adaptiveController: adaptive, ariaLabel: "Icon projection" }} />,
    );

    const row = screen.getByRole("button", { name: "Overview destination" });
    expect(row.querySelector<HTMLElement>(".nse-sidebar-item-glyph")?.style.backgroundImage).toContain("/navigation/overview.svg");
    expect(container.querySelector(".nse-sidebar-section-header")).toBeNull();
    expect(container.querySelector("[data-navigation-group='overview']")).not.toBeNull();

    adaptive.dispose();
    tabs.dispose();
  });

  it("places persistent peer tabs after the retained content body at the physical bottom region", () => {
    const tabs = new NSETabBarController<React.ReactNode>({
      id: "bottom-projection-tabs",
      destinations: [
        {
          id: "home",
          label: "Home",
          accessibleLabel: "Home destination",
          icon: { kind: "template", name: "home" },
          createContent: () => <article data-testid="bottom-projection-content">Home content</article>,
        },
      ],
    });
    const adaptive = new NSEAdaptiveNavigationController({
      id: "bottom-projection-adaptive",
      model: "peer",
      presentation: "bottom-tabs",
      tabController: tabs,
      traits: createStaticPresentationTraits({ width: 1440, height: 900 }),
    });
    const { container } = render(
      <NSESourceListScene projection={{ controller: tabs, adaptiveController: adaptive, ariaLabel: "Bottom projection" }} />,
    );

    const body = container.querySelector(".nse-source-list-scene");
    const compactChrome = container.querySelector("[data-nse-source-list-compact-chrome=\"true\"]");
    const tabList = screen.getByRole("tablist", { name: "Bottom projection" });
    expect(body).not.toBeNull();
    expect(compactChrome).not.toBeNull();
    expect(body!.compareDocumentPosition(compactChrome!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body!.compareDocumentPosition(tabList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("bottom-projection-content")).toBeTruthy();

    adaptive.dispose();
    tabs.dispose();
  });
});

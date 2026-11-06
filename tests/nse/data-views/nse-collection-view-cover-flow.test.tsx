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

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NSEArrayController } from "../../../src/NSE/Controllers";
import type { NSEDataViewAdapter } from "../../../src/NSE/DataViews/Core";
import { NSECollectionView, createCoverFlowCollectionLayout } from "../../../src/NSE/DataViews/Collection";
import type { IFXImageResource } from "../../../src/FX/ImageFX/IFXImageResource";

interface Cover { readonly id: string; readonly label: string; readonly caption: string }

const covers: readonly Cover[] = [
  { id: "one", label: "One", caption: "First" },
  { id: "two", label: "Two", caption: "Second" },
  { id: "three", label: "Three", caption: "Third" },
  { id: "four", label: "Four", caption: "Fourth" },
];

function source(selected = "two") {
  const controller = new NSEArrayController<Cover, string>({
    id: `covers-${selected}`,
    content: covers,
    getId: (item) => item.id,
    selection: { mode: "single", allowsEmpty: false, preservesSelection: true },
  });
  controller.select([selected]);
  const adapter: NSEDataViewAdapter<Cover, string> = { controller, idForItem: (item) => item.id, labelForItem: (item) => item.label };
  return { controller, adapter };
}

/** A resource whose pixels never arrive: the view keeps its options and title regardless. */
const picture = { src: "/cover.png", pixelLease: () => new Promise(() => undefined) } as unknown as IFXImageResource;

function renderCoverFlow(options: { readonly wraps?: boolean; readonly selected?: string; readonly onActivate?: (id: string, item: Cover) => void } = {}) {
  const { controller, adapter } = source(options.selected);
  render(<NSECollectionView
    aria-label="Covers"
    adapter={adapter}
    layout={createCoverFlowCollectionLayout({ isWrapped: options.wraps ?? false })}
    imageForItem={() => picture}
    subtitleForItem={(item) => item.caption}
    onActivate={options.onActivate}
  />);
  return { controller, view: screen.getByRole("listbox", { name: "Covers" }) };
}

const selectedLabel = () => screen.getAllByRole("option").find((option) => option.getAttribute("aria-selected") === "true")?.textContent;

afterEach(cleanup);

describe("Cover Flow collection layout", () => {
  it("validates its geometry and defaults to AnimationFX's camera", () => {
    const layout = createCoverFlowCollectionLayout();
    expect(layout).toMatchObject({ kind: "coverFlow", cameraDistance: 4, cameraPitch: .335, isWrapped: false, visibleItemsEachSide: 4 });
    expect(() => createCoverFlowCollectionLayout({ cameraDistance: 0 })).toThrow(RangeError);
    expect(() => createCoverFlowCollectionLayout({ cameraPitch: Math.PI })).toThrow(RangeError);
    expect(() => createCoverFlowCollectionLayout({ itemHeightFraction: 1.5 })).toThrow(RangeError);
  });

  it("shows the selected item as the current option with its title and subtitle", () => {
    const { view } = renderCoverFlow();
    expect(view.getAttribute("data-layout")).toBe("cover-flow");
    expect(selectedLabel()).toBe("Two");
    expect(view.textContent).toContain("Second");
    // Without AnimationFX layers the view says why and shows the selected picture flat.
    expect(view.getAttribute("data-rendering")).toBe("unavailable");
    expect(view.getAttribute("data-failure")).toBe("No AnimationFX layers are available here.");
    expect(view.querySelector("img")?.getAttribute("src")).toBe("/cover.png");
  });

  it("moves the selection with the arrow, Home and End keys and activates with Enter", () => {
    const onActivate = vi.fn();
    const { view } = renderCoverFlow({ onActivate });
    act(() => { fireEvent.keyDown(view, { key: "ArrowRight" }); });
    expect(selectedLabel()).toBe("Three");
    act(() => { fireEvent.keyDown(view, { key: "End" }); });
    expect(selectedLabel()).toBe("Four");
    act(() => { fireEvent.keyDown(view, { key: "ArrowRight" }); });
    expect(selectedLabel()).toBe("Four");
    act(() => { fireEvent.keyDown(view, { key: "Home" }); });
    expect(selectedLabel()).toBe("One");
    act(() => { fireEvent.keyDown(view, { key: "Enter" }); });
    expect(onActivate).toHaveBeenCalledWith("one", covers[0]);
  });

  it("wraps from the last item to the first in a wrapped ring", () => {
    const { view } = renderCoverFlow({ wraps: true, selected: "four" });
    act(() => { fireEvent.keyDown(view, { key: "ArrowRight" }); });
    expect(selectedLabel()).toBe("One");
    act(() => { fireEvent.keyDown(view, { key: "ArrowLeft" }); });
    expect(selectedLabel()).toBe("Four");
  });

  it("follows a selection made on the controller", () => {
    const { controller } = renderCoverFlow();
    act(() => { controller.select(["four"]); });
    expect(selectedLabel()).toBe("Four");
  });
});

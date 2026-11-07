// @vitest-environment jsdom
import React, { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEPathControl, NSEPathControlItem, type NSEPathControlHandle } from "../../../src/NSE/Controls/Values/NSEPathControl";

afterEach(cleanup);
it("exposes the clicked path item to its action and renders images as NSE image views", () => {
  const first = new NSEPathControlItem({ title: "Projects", url: "file:///Projects", image: "/folder.png" });
  const second = new NSEPathControlItem({ title: "Coast", url: "file:///Projects/Coast" });
  const ref = createRef<NSEPathControlHandle>();
  const action = vi.fn((sender: NSEPathControlHandle) => expect(sender.clickedPathItem).toBe(first));
  const { container } = render(<NSEPathControl ref={ref} pathItems={[first, second]} onAction={action} aria-label="Path" />);
  expect(ref.current?.url).toBe(second.url);
  expect(ref.current?.clickedPathItem).toBeNull();
  expect(container.querySelector(".nse-control-image-view")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Projects" }));
  expect(action).toHaveBeenCalledOnce();
  expect(ref.current?.pathItems).toEqual([first, second]);
  expect(container.querySelector('[aria-current="location"]')?.textContent).toBe("Coast");
});
it("derives standard path items from a URL, decodes titles and supports keyboard activation", () => {
  const onAction = vi.fn();
  render(<NSEPathControl url="file:///Users/Test/My%20Pictures" onAction={onAction} />);
  expect(screen.getByRole("button", { name: "My Pictures" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Test" }));
  expect(onAction.mock.calls[0]?.[0].clickedPathItem.url).toBe("file:///Users/Test");
});

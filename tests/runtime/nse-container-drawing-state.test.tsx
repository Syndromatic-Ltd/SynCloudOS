// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEBox } from "../../src/NSE/Controls/Fields/NSEFields";
import { Divider } from "../../src/NSE/Controls/Selection/NSEDivider";
afterEach(cleanup);
it("publishes NSBox transparency and custom drawing properties", () => {
  const { container } = render(<NSEBox boxType="custom" isTransparent fillColour="#123" borderColour="#456" borderWidth={2}>Content</NSEBox>);
  const box = container.firstElementChild!;
  expect(box.getAttribute("data-nse-transparent")).toBe("true");
  expect(box.getAttribute("data-nse-custom-fill")).toBe("true");
  expect(box.getAttribute("data-nse-custom-border")).toBe("true");
});
it("uses British grey in the separator's drawing contract", () => {
  const { container } = render(<Divider variant="grey" label="Section" />);
  expect(container.firstElementChild?.getAttribute("data-nse-style")).toBe("grey");
});
it("projects disclosure drawing state while leaving activation with its existing handler", () => {
  const toggle = vi.fn();
  render(<Divider label="Group" variant="arrow" expanded onToggle={toggle} />);
  const button = screen.getByRole("button", { name: "Group" });
  expect(button.getAttribute("data-nse-role")).toBe("disclosure");
  expect(button.getAttribute("data-nse-expanded")).toBe("true");
  fireEvent.click(button);
  expect(toggle).toHaveBeenCalledTimes(1);
});

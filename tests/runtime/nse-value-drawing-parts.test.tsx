// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSESwitch } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSELevelIndicator } from "../../src/NSE/Controls/Values/NSELevelIndicator";
import { NSEProgressIndicator } from "../../src/NSE/Progress/NSEProgressIndicator";

afterEach(cleanup);
it("distinguishes the switch's two fill caps and state captions through neutral hooks", () => {
  const { container } = render(<NSESwitch state="on" />);
  expect(Array.from(container.querySelectorAll('[data-nse-part="fill"]'), e => e.getAttribute("data-nse-position"))).toEqual(["leading", "trailing"]);
  expect(Array.from(container.querySelectorAll('[data-nse-part="title"]'), e => e.getAttribute("data-nse-state"))).toEqual(["on", "off"]);
  expect(container.querySelectorAll('[data-nse-part="label"]')).toHaveLength(2);
});
it("publishes the existing level classification independently of control selection", () => {
  const { container, rerender } = render(<NSELevelIndicator value={6} minimum={0} maximum={10} warningValue={5} criticalValue={8} aria-label="Capacity" />);
  expect(container.firstElementChild?.getAttribute("data-nse-level")).toBe("warning");
  rerender(<NSELevelIndicator value={9} minimum={0} maximum={10} warningValue={5} criticalValue={8} aria-label="Capacity" />);
  expect(container.firstElementChild?.getAttribute("data-nse-level")).toBe("critical");
});
it("publishes progress indeterminacy as an AppKit property", () => {
  const { container, rerender } = render(<NSEProgressIndicator aria-label="Loading" />);
  expect(container.firstElementChild?.getAttribute("data-nse-indeterminate")).toBe("true");
  rerender(<NSEProgressIndicator aria-label="Loading" value={50} />);
  expect(container.firstElementChild?.getAttribute("data-nse-indeterminate")).toBe("false");
});

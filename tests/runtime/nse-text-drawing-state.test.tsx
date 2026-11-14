// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InputBox, NSETextField } from "../../src/NSE/Controls/Fields/NSEFields";
import { NSESearchField } from "../../src/NSE/Controls/Fields/NSESearchField";
import { NSESecureTextField } from "../../src/NSE/Controls/Fields/NSESecureTextField";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";

afterEach(cleanup);
it("publishes native editors in an input group while preserving nested control ownership", () => {
  const field = React.createRef<HTMLInputElement>();
  const { container } = render(<InputBox><input ref={field} aria-label="Direct" defaultValue="Value" /><label>Nested<textarea aria-label="Nested" defaultValue="Text" /></label><NSEButton title="Copy" /></InputBox>);
  for (const name of ["Direct", "Nested"]) expect(screen.getByRole("textbox", { name }).getAttribute("data-nse-part")).toBe("field");
  expect(container.querySelector('[data-nse-control="button"]')?.getAttribute("data-nse-part")).toBe("background");
  expect((screen.getByRole("textbox", { name: "Direct" }) as HTMLInputElement).value).toBe("Value");
  expect(field.current).toBe(screen.getByRole("textbox", { name: "Direct" }));
  fireEvent.change(field.current!, { target: { value: "Edited" } });
  expect(field.current?.value).toBe("Edited");
});
it("publishes grouped-field geometry and validation without replacing native input semantics", () => {
  const { container } = render(<NSETextField aria-label="Name" groupPosition="first" height={40} invalid />);
  const root = container.querySelector('[data-nse-control="text-field"]')!;
  expect(root.getAttribute("data-nse-position")).toBe("first");
  expect(root.getAttribute("data-nse-height")).toBe("40");
  expect(root.getAttribute("data-nse-validation")).toBe("invalid");
  expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBe("true");
});
it("publishes an input group's retained highlight separately from keyboard focus", () => {
  const { container } = render(<InputBox alwaysLooksFocused><input aria-label="Export" /></InputBox>);
  const root = container.firstElementChild!;
  expect(root.getAttribute("data-nse-role")).toBe("group");
  expect(root.hasAttribute("data-nse-highlighted")).toBe(true);
  expect(root.hasAttribute("data-nse-focused")).toBe(false);
});
it("updates search drawing state when its existing clear action runs", () => {
  const { container } = render(<NSESearchField aria-label="Find" defaultValue="query" />);
  expect(container.firstElementChild?.getAttribute("data-nse-value-state")).toBe("populated");
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(container.firstElementChild?.getAttribute("data-nse-value-state")).toBe("empty");
});
it("publishes secure-field validation alongside the existing error semantics", () => {
  const { container } = render(<NSESecureTextField aria-label="Password" invalid />);
  expect(container.firstElementChild?.getAttribute("data-nse-validation")).toBe("invalid");
  expect(screen.getByRole("alert")).toBeTruthy();
});

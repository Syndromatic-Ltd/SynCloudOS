// @vitest-environment jsdom
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


import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NSEImage } from "../../src/NSE/Controls/Images/NSEImageResource";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
import { NSESegmentedControl } from "../../src/NSE/Controls/Values/NSESegmentedControl";

afterEach(cleanup);
it("looks up cached, distinct NSImage navigation templates and returns null for unknown names", () => {
  const back = NSEImage.named(NSEImage.goBackTemplateName)!;
  const forward = NSEImage.named(NSEImage.goForwardTemplateName)!;
  expect(back.isTemplate).toBe(true);
  expect(back.size).toEqual({ width: 17, height: 17 });
  expect(NSEImage.named(NSEImage.goBackTemplateName)).toBe(back);
  expect(back.src).not.toBe(forward.src);
  expect(decodeURIComponent(back.src)).toContain("M15 4 L7 12 L15 20");
  expect(decodeURIComponent(forward.src)).toContain("M9 4 L17 12 L9 20");
  expect(NSEImage.named("missing-image")).toBeNull();
});
it("draws an image-only button as a currentColor template with its accessible title", () => {
  render(<NSEButton title="Sections" bezelStyle="texturedRounded" imagePosition="imageOnly" image={NSEImage.named(NSEImage.goBackTemplateName)} />);
  const button = screen.getByRole("button", { name: "Sections" });
  const image = button.querySelector<HTMLElement>("[data-nse-image-template]")!;
  expect(image.style.backgroundColor).toMatch(/^currentcolor$/i);
  expect(image.style.maskImage).toContain(NSEImage.named(NSEImage.goBackTemplateName)!.src);
  expect(image.getAttribute("aria-hidden")).toBe("true");
  expect(button.textContent).toBe("");
});
it.each(["texturedRounded", "rounded"] as const)("draws named images in %s history segments and preserves disabled state", segmentStyle => {
  render(<NSESegmentedControl aria-label="History" segmentStyle={segmentStyle} selection={{ mode: "momentary", selectedIds: new Set() }} items={[
    { id: "back", label: "Back", image: NSEImage.named(NSEImage.goBackTemplateName), isEnabled: false },
    { id: "forward", label: "Forward", image: NSEImage.named(NSEImage.goForwardTemplateName) },
  ]} />);
  expect(screen.getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Forward" }).querySelector("[data-nse-image-template]")).not.toBeNull();
});

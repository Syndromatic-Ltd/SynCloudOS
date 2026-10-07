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
import React, { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NSEClipView } from "../../../src/NSE/Scroll";

describe("NSEClipView", () => {
  it("distinguishes clip from scroll hosts and forwards its physical host", () => {
    const onScrollHostChange = vi.fn();
    const ref = createRef<HTMLDivElement>();
    const view = render(
      <NSEClipView ref={ref} mode="clip" onScrollHostChange={onScrollHostChange}>
        <button>Focusable content</button>
      </NSEClipView>,
    );

    const clip = screen.getByRole("button", { name: "Focusable content" }).parentElement as HTMLDivElement;
    expect(clip.getAttribute("data-scroll-host")).toBe("false");
    expect(clip.style.overflow).toBe("hidden");
    expect(ref.current).toBe(clip);
    expect(onScrollHostChange).toHaveBeenLastCalledWith(null);

    view.rerender(
      <NSEClipView ref={ref} mode="scroll" scrollHostId="journal-body" onScrollHostChange={onScrollHostChange}>
        <button>Focusable content</button>
      </NSEClipView>,
    );
    const scroll = screen.getByRole("button", { name: "Focusable content" }).parentElement as HTMLDivElement;
    expect(scroll.getAttribute("data-scroll-host")).toBe("true");
    expect(scroll.getAttribute("data-scroll-host-id")).toBe("journal-body");
    expect(scroll.style.overflow).toBe("auto");
    expect(onScrollHostChange).toHaveBeenLastCalledWith(scroll);
  });
});

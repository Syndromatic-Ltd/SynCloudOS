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
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NSEPushButton } from "../../src/NSE/Controls/Buttons/NSEButtons";

Object.assign(globalThis, { React });

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function pointer(target: EventTarget, type: string, x = 50, options: { id?: number; button?: number; buttons?: number; primary?: boolean } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 25,
    button: options.button ?? 0, buttons: options.buttons ?? (type === "pointerup" ? 0 : 1) });
  Object.defineProperties(event, { pointerId: { value: options.id ?? 1 }, isPrimary: { value: options.primary ?? true }, pointerType: { value: "touch" } });
  fireEvent(target, event);
}

function setup() {
  const click = vi.fn();
  const view = render(<NSEPushButton onClick={click}>Push</NSEPushButton>);
  const button = view.getByRole("button");
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50, toJSON: () => ({}) });
  return { ...view, button, click };
}

describe("NSE push button press lifetime", () => {
  it("tracks the initiating pointer inside, outside and back inside until release", () => {
    const { button, click } = setup();
    pointer(button, "pointerdown");
    expect(button.getAttribute("data-press-active")).toBe("true");
    pointer(window, "pointermove", 140, { id: 2 });
    expect(button.getAttribute("data-press-active")).toBe("true");
    pointer(window, "pointermove", 140);
    expect(button.getAttribute("data-press-active")).toBe("false");
    pointer(window, "pointermove", 70);
    expect(button.getAttribute("data-press-active")).toBe("true");
    pointer(window, "pointerup", 70);
    pointer(button, "lostpointercapture", 70);
    expect(button.getAttribute("data-press-active")).toBe("false");
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(button, { detail: 1 });
    expect(click).toHaveBeenCalledOnce();
  });

  it("keeps a held SystemAlert action mounted when its report rerenders", async () => {
    const { SystemAlert } = await import("../../src/SynCloudOSReact/SystemAlert");
    const error = { code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH", title: "Session mismatch", message: "Reload", suggestedActions: ["reload", "dismiss"] };
    const props = { error, onDismiss: vi.fn(), onReturn: vi.fn(), onReload: vi.fn() };
    const { getByRole, rerender } = render(<SystemAlert {...props} />);
    const button = getByRole("button", { name: "Reload Webspring" });
    pointer(button, "pointerdown");
    rerender(<SystemAlert {...props} technicalReport="Updated diagnostic report" />);
    expect(getByRole("button", { name: "Reload Webspring" })).toBe(button);
    expect(button.getAttribute("data-press-active")).toBe("true");
    pointer(window, "pointercancel");
  });

  it("cancels outside releases and pointer cancellation without synthesizing activation", () => {
    const { button, click } = setup();
    pointer(button, "pointerdown");
    pointer(window, "pointerup", 140);
    fireEvent.click(button, { detail: 1 });
    expect(click).not.toHaveBeenCalled();
    pointer(button, "pointerdown");
    pointer(window, "pointercancel");
    expect(button.getAttribute("data-press-active")).toBe("false");
    pointer(window, "pointermove");
    expect(button.getAttribute("data-press-active")).toBe("false");
  });

  it("clears on window blur, disable and unmount, and keeps native keyboard activation", () => {
    const { button, click, rerender, unmount } = setup();
    pointer(button, "pointerdown");
    // WebKit blurs an already-focused button when a mouse press moves focus to
    // the page; the pointer hold still owns its presentation.
    fireEvent.blur(button);
    expect(button.getAttribute("data-press-active")).toBe("true");
    fireEvent(window, new Event("blur"));
    expect(button.getAttribute("data-press-active")).toBe("false");
    fireEvent.keyDown(button, { key: " " });
    expect(button.getAttribute("data-press-active")).toBe("true");
    fireEvent.keyUp(button, { key: " " });
    expect(button.getAttribute("data-press-active")).toBe("false");
    fireEvent.click(button, { detail: 0 });
    expect(click).toHaveBeenCalledOnce();
    pointer(button, "pointerdown");
    rerender(<NSEPushButton disabled>Push</NSEPushButton>);
    expect(button.getAttribute("data-press-active")).toBe("false");
    pointer(window, "pointermove");
    expect(button.getAttribute("data-press-active")).toBe("false");
    unmount();
    pointer(window, "pointerup");
  });

  it("ignores secondary or prevented presses and preserves explicit selected/pressed state", () => {
    const { button, rerender } = setup();
    pointer(button, "pointerdown", 50, { button: 2 });
    expect(button.getAttribute("data-press-active")).toBe("false");
    pointer(button, "pointerdown", 50, { primary: false });
    expect(button.getAttribute("data-press-active")).toBe("false");
    rerender(<NSEPushButton pressed selected onPointerDown={event => event.preventDefault()}>Push</NSEPushButton>);
    pointer(button, "pointerdown");
    expect(button.getAttribute("data-press-active")).toBe("false");
    expect(button.getAttribute("data-pressed")).toBe("true");
    expect(button.getAttribute("data-selected")).toBe("true");
  });
});

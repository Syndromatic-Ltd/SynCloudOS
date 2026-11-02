// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NSEConfirmDialog } from "../../../src/NSE/Components/NSESystemDialogs";
afterEach(cleanup);
describe("canonical confirmation action intent", () => {
  it.each([undefined, "dark"] as const)("retains %s action tone without changing safe cancellation", confirmTone => {
    const confirm=vi.fn(),cancel=vi.fn();
    render(<NSEConfirmDialog open title="Edit this note?" message="Open the existing editor." confirmLabel="Open Journal Publisher" cancelLabel="Cancel" confirmTone={confirmTone} onConfirm={confirm} onCancel={cancel}/>);
    const action=screen.getByRole("button",{name:"Open Journal Publisher"});
    expect(action.getAttribute("data-tone")).toBe(confirmTone??"negative");
    expect(action.classList.contains("nse-system-alert-action-button")).toBe(true);
    expect(screen.getByRole("alertdialog").contains(action)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Cancel"}));
    expect(cancel).toHaveBeenCalledTimes(1);expect(confirm).not.toHaveBeenCalled();
  });
  it("keeps iconless long copy out of the reserved icon column", () => {
    render(<NSEConfirmDialog open title="A long confirmation title with several readable words" message="A long body message" confirmLabel="Continue" cancelLabel="Cancel" onConfirm={()=>{}} onCancel={()=>{}}/>);
    const copy=screen.getByText("A long body message").closest(".nse-system-alert-content");
    expect(copy?.classList.contains("nse-confirm-content-textonly")).toBe(true);
    expect(copy?.querySelector(".nse-system-alert-icon-frame")).toBeNull();
    expect(copy?.querySelector<HTMLElement>(".nse-system-alert-copy")?.tabIndex).toBe(0);
  });
});

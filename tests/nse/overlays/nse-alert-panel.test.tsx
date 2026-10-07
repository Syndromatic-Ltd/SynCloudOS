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
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SystemAlert } from "../../../src/SynCloudOSReact/SystemAlert";
import { NSEAlert } from "../../../src/NSE/Components/NSEAlert";

const error = {
  id: "alert-1",
  at: 0,
  timestamp: "1970-01-01T00:00:00.000Z",
  code: "APP_CONTENT_FAILED",
  title: "Journal stopped unexpectedly",
  message: "The journal can be reopened.",
  source: "test",
  severity: "fatal" as const,
  recoverable: false,
  suggestedActions: ["returnToWebspring", "dismiss"] as const,
};

describe("NSE alert panel", () => {
  it("dispatches the supplied recovery action without dismissing the alert", () => {
    const dismiss = vi.fn();
    const returnToWebspring = vi.fn();
    render(
      <SystemAlert
        error={error}
        onDismiss={dismiss}
        onReload={vi.fn()}
        onReturn={returnToWebspring}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Return to Webspring" }));
    expect(returnToWebspring).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("keeps bare NSEAlert a semantic surface rather than a local focus trap", () => {
    render(<NSEAlert labelledBy="alert-title"><h2 id="alert-title">Notice</h2></NSEAlert>);
    const alert = screen.getByRole("alertdialog", { name: "Notice" });
    expect(alert.getAttribute("aria-modal")).toBe("true");
  });

  it("presents session mismatch recovery as affirmative reload and cancellable dismissal", () => {
    const dismiss = vi.fn();
    const reload = vi.fn();
    render(
      <SystemAlert
        error={{
          ...error,
          code: "UNRECOVERABLE_LOGIN_SESSION_MISMATCH",
          title: "Syndromatic has unexpectedly stopped.",
          suggestedActions: ["reload", "dismiss"],
        }}
        onDismiss={dismiss}
        onReload={reload}
        onReturn={vi.fn()}
      />,
    );

    const reloadButton = screen.getByRole("button", { name: "Reload Webspring" });
    expect(reloadButton.getAttribute("data-tone")).toBe("affirmative");
    expect(screen.getByRole("button", { name: "Cancel" }).getAttribute("data-tone")).toBe("medium");
    expect(screen.getAllByRole("button").slice(-2).map((button) => button.textContent)).toEqual(["Cancel", "Reload Webspring"]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dismiss).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NSEButton } from "../../src/NSE/Controls/Buttons/NSEButton";
afterEach(cleanup);
it.each([["\r", "Enter"], ["\u001b", "Escape"]])("dispatches special key equivalent %j as %s", (equivalent, key) => {
  const action = vi.fn(); render(<NSEButton title="Action" keyEquivalent={equivalent} onClick={action} />);
  fireEvent.keyDown(document.body, { key }); expect(action).toHaveBeenCalledOnce();
});

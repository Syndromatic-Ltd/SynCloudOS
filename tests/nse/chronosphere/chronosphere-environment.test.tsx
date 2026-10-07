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
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ChronosphereGridView } from "../../../src/NSE/Chronosphere/ChronosphereGridView";
import { ChronosphereEnvironmentProvider, type ChronosphereEnvironment } from "../../../src/NSE/Chronosphere/chronosphereEnvironment";
import { defaultChronosphereLabels } from "../../../src/NSE/Chronosphere/chronosphereViewTypes";
import { createChronosphereAppSubject } from "../../../src/NSE/Chronosphere/chronosphereSubject";

it("browses and restores through an injected NSE environment without an app mount", async () => {
  const controller = new AbortController();
  const restore = vi.fn(), exit = vi.fn();
  const environment: ChronosphereEnvironment = {
    signal: controller.signal,
    images: { load: () => { throw new Error("Grid must not acquire artwork."); } },
    mediaQueries: { getSnapshot: () => false, subscribe: () => () => {} },
    scheduler: {
      requestAnimationFrame(callback) { callback(0); return { dispose() {} }; },
      setTimeout(callback) { callback(); return { dispose() {} }; },
    },
    animations: {
      acquireOwner: viewId => ({ viewId, dispose() {} }),
      animate: () => ({ progress: 1, finished: Promise.resolve(), dispose() {} }),
    },
  };
  const entry = { id: "v1", sequence: 1, displayLabel: "Version 1", title: "Earlier draft", dateLabel: "Yesterday", summary: "Saved draft" };
  const subject = createChronosphereAppSubject("document", "Document", [entry]);
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ChronosphereEnvironmentProvider value={environment}>
      <ChronosphereGridView model={{ subject, entries: subject.entries, labels: defaultChronosphereLabels, presentImage: null, foregroundImage: null, presentRect: null, prepared: undefined }} actions={{ exit, restore }} />
    </ChronosphereEnvironmentProvider>));
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    const button = [...container.querySelectorAll("button")].find(node => node.textContent === "Restore");
    expect(button?.disabled).toBe(false);
    await act(async () => button!.click());
    expect(restore).toHaveBeenCalledWith(entry);
    expect(exit).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount()); container.remove(); controller.abort();
  }
});

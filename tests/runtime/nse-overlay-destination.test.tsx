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
import { createPortal } from "react-dom";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { NSEOverlayProvider, useNSEOverlayProvider } from "../../src/NSE/Overlays";
import { SynCloudOSProvider, useRuntimeNSEOverlayPort } from "../../src/SynCloudOSReact";
import { createTestRuntime } from "./helpers";

afterEach(() => { cleanup(); document.body.replaceChildren(); });

it.each([undefined, null])("inherits an explicit destination only when a nested prop is %s", (override) => {
  const runtime = createTestRuntime();
  const destination = document.createElement("div");
  document.body.appendChild(destination);
  let outer: ReturnType<typeof useNSEOverlayProvider> | undefined;
  let inner: ReturnType<typeof useNSEOverlayProvider> | undefined;
  function Probe() {
    inner = useNSEOverlayProvider();
    return inner.portalHost ? createPortal(<span data-captured-overlay="true" />, inner.portalHost) : null;
  }
  function Nested() {
    outer = useNSEOverlayProvider();
    return <div data-clipped-frame="true"><NSEOverlayProvider runtimePort={outer.runtime} portalContainer={override}><Probe /></NSEOverlayProvider></div>;
  }
  function Host() {
    const port = useRuntimeNSEOverlayPort("application:probe");
    return <NSEOverlayProvider runtimePort={port} portalContainer={destination}><Nested /></NSEOverlayProvider>;
  }
  const rendered = render(<SynCloudOSProvider runtime={runtime}><Host /></SynCloudOSProvider>);
  expect(inner!.manager).not.toBe(outer!.manager);
  expect(inner!.portalHost).not.toBe(outer!.portalHost);
  if (override === undefined) {
    expect(inner!.portalHost!.parentElement).toBe(destination);
    expect(destination.querySelector("[data-captured-overlay]")).not.toBeNull();
    expect(rendered.container.querySelector("[data-clipped-frame]")!.contains(inner!.portalHost!)).toBe(false);
  } else {
    expect(inner!.portalHost).toBeNull();
    expect(destination.querySelector("[data-captured-overlay]")).toBeNull();
  }
});

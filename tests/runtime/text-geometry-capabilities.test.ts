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

import { describe, expect, it, vi } from "vitest";
import { BrowserTextLayoutAdapter } from "../../src/SynCloudOS/PlatformAdapters/BrowserTextLayoutAdapter";
import { createTestRuntime, createTestRuntimeEnvironment } from "./helpers";
import { NSELayoutManager } from "../../src/NSE/TextLayout/NSELayoutManager";
import { TFXTextContainer } from "../../src/FX/TextFX/TFXTextContainer";

describe("text geometry capability and lifetime boundaries", () => {
  it("declares browser measurements logical with CSS units and explicit unsupported exclusions", () => {
    const adapter = new BrowserTextLayoutAdapter({ createSegmenter: () => null, createMeasurementSurface: () => null, yieldToHost: async () => {} });
    expect(adapter).toMatchObject({ geometryCapabilities: { kind: "logical-dom", units: "css-pixels", exclusions: false, shapedCarets: false } });
    adapter.dispose();
  });
  it("declares the runtime logical service independently of shaped FX frames", async () => {
    const runtime = createTestRuntime({ id: "geometry:capability", environment: createTestRuntimeEnvironment() });
    try { expect(runtime.textLayout).toMatchObject({ geometryCapabilities: { kind: "logical-dom", units: "css-pixels", exclusions: false } }); }
    finally { await runtime.dispose(); }
  });
  it("does not restart a disposed layout manager and unsubscribes once", async () => {
    const unsubscribe = vi.fn();
    const layout = vi.fn(async () => ({ fragments: [], laidOutRange: { location: 0, length: 0 }, truncated: false }));
    const manager = new NSELayoutManager({ service: { layout, segment: () => [], subscribeFontReadiness: () => unsubscribe } });
    manager.dispose(); manager.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await expect(manager.layout({ text: "", font: { families: ["system-ui"], size: 12, weight: 400, style: "normal", stretch: "normal" }, locale: "en", direction: "ltr" }, [new TFXTextContainer({ size: { width: 10, height: 10 } })])).rejects.toMatchObject({ name: "AbortError" });
    expect(layout).not.toHaveBeenCalled();
  });
});

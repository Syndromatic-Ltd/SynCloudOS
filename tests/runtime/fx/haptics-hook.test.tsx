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
import React, { StrictMode, Suspense } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HFXHapticClient } from "../../../src/FX/HapticsFX/HFXHapticClient";
import type { HFXHapticSession } from "../../../src/FX/HapticsFX/HFXHapticSession";
import { createRuntimeHapticsHostService } from "../../../src/SynCloudOS/HapticsFX/HapticsHostService";
import { AUFXSystemFeedbackBus } from "../../../src/SynCloudOS/AudioFX/AUFXSystemFeedbackBus";

const context = vi.hoisted(() => ({ client: null as HFXHapticClient | null }));
vi.mock("../../../src/SynCloudOS/AppSDK/scos/useSCOS", () => ({ useSCOS: () => ({ haptics: context.client }) }));
import { useHaptics } from "../../../src/SynCloudOS/AppSDK/hooks/useHaptics";
afterEach(cleanup);

it("owns one committed engine after StrictMode replay and revokes it on unmount", () => {
  const host = createRuntimeHapticsHostService(new AUFXSystemFeedbackBus(() => null), { navigator: null, audio: "off" });
  const sessions: HFXHapticSession[] = [];
  context.client = { createEngine: () => { const engine = host.createSession(); sessions.push(engine); return engine; } };
  let facade!: HFXHapticSession;
  function Probe() { facade = useHaptics(); return null; }
  const view = render(<StrictMode><Probe /></StrictMode>);
  expect(sessions).toHaveLength(2);
  expect(sessions[0].capabilities.state).toBe("disposed");
  expect(sessions[1].capabilities.state).not.toBe("disposed");
  view.unmount();
  expect(sessions[1].capabilities.state).toBe("disposed");
  expect(() => facade.makePlayer({} as never)).toThrow(/not mounted/);
  host.dispose();
});

it("does not acquire engines for abandoned renders", () => {
  const createEngine = vi.fn(); context.client = { createEngine };
  const pending = new Promise<never>(() => {});
  function Pending() { useHaptics(); throw pending; }
  const view = render(<Suspense fallback={null}><Pending /></Suspense>);
  expect(createEngine).not.toHaveBeenCalled();
  view.unmount();
});

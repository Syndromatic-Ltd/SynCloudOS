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
import React, { StrictMode, Suspense, useEffect } from "react";
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import type {
  MFXMotionClient,
  MFXMotionManager,
} from "../../../src/FX/MotionFX/public";
import { MotionService } from "../../../src/SynCloudOS/MotionFX/MotionService";
import { motionFixture } from "./motion-fixture";

const context = vi.hoisted(() => ({ client: null as MFXMotionClient | null }));
vi.mock("../../../src/SynCloudOS/AppSDK/SynWareContext", () => ({
  useSynWare: () => ({ motion: context.client }),
}));
import { useSynWareMotion } from "../../../src/SynCloudOS/AppSDK/hooks/useSynWareMotion";
afterEach(cleanup);

it("survives StrictMode replay with one committed owner and releases it on unmount", () => {
  const fixture = motionFixture(),
    service = new MotionService(fixture.adapter);
  const createManager = vi.fn(() => service.createManager());
  context.client = { createManager };
  let facade!: MFXMotionManager;
  function Probe() {
    facade = useSynWareMotion();
    useEffect(() => {
      const subscription = facade.startDeviceMotionUpdates(
        { referenceFrame: "relative" },
        () => {},
      );
      return () => subscription.dispose();
    }, [facade]);
    return null;
  }
  const view = render(
    <StrictMode>
      <Probe />
    </StrictMode>,
  );
  expect(createManager).toHaveBeenCalledTimes(2);
  expect(fixture.listeners.size).toBe(1);
  fixture.emit(1);
  expect(facade.deviceMotion?.timestamp).toBe(1);
  expect(fixture.adapter.requestAuthorization).not.toHaveBeenCalled();
  view.unmount();
  expect(fixture.listeners.size).toBe(0);
  expect(() => facade.startGyroUpdates(() => {})).toThrow(/not mounted/);
  service.dispose();
});

it("does not acquire host owners for a render abandoned by Suspense", () => {
  const createManager = vi.fn();
  context.client = { createManager };
  const pending = new Promise<never>(() => {});
  function Pending() {
    useSynWareMotion();
    throw pending;
  }
  const view = render(
    <Suspense fallback={<span>Waiting</span>}>
      <Pending />
    </Suspense>,
  );
  expect(createManager).not.toHaveBeenCalled();
  view.unmount();
});

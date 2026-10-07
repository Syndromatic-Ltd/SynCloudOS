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
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { NSEAnimationEnvironmentProvider, useNSEAnimationEnvironment } from "../../src/NSE/Animation";
import type { AFXFrameScheduler } from "../../src/FX/AnimationFX/AFXLayer";

it("inherits scoped FX capabilities and lets a mounted app replace or explicitly clear them", () => {
  const frames: AFXFrameScheduler = { now: () => 0, requestFrame: () => () => {}, reducedMotion: false, suspended: false };
  const layers = { createRenderer: () => { throw new Error("not called"); } };
  const seen: ReturnType<typeof useNSEAnimationEnvironment>[] = [];
  function Probe() { seen.push(useNSEAnimationEnvironment()); return null; }
  const view = render(<NSEAnimationEnvironmentProvider frames={frames} layers={layers}><NSEAnimationEnvironmentProvider><Probe /></NSEAnimationEnvironmentProvider></NSEAnimationEnvironmentProvider>);
  expect(seen.at(-1)?.frames).toBe(frames);
  expect(seen.at(-1)?.layers).toBe(layers);
  view.rerender(<NSEAnimationEnvironmentProvider frames={frames} layers={layers}><NSEAnimationEnvironmentProvider frames={null} layers={null}><Probe /></NSEAnimationEnvironmentProvider></NSEAnimationEnvironmentProvider>);
  expect(seen.at(-1)?.frames).toBeNull();
  expect(seen.at(-1)?.layers).toBeNull();
  view.unmount();
});

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

import { expect, it } from "vitest";
import { createWindowTestDependencies, panelWindow, standardWindow } from "../fixtures/windowTestDependencies";

it("lets a panel become key without replacing the main standard window", async () => {
  const f = createWindowTestDependencies();
  const main = f.manager.create(standardWindow("main-window"));
  const inspector = f.manager.create(panelWindow("inspector"));
  await f.manager.open(main.id);
  await f.manager.open(inspector.id);

  expect(f.manager.snapshot()).toMatchObject({
    keyWindowControllerId: "inspector",
    mainWindowControllerId: "main-window",
  });
  expect(main.record).toMatchObject({ isKey: false, isMain: true });
  expect(inspector.record).toMatchObject({ isKey: true, isMain: false });
  expect(f.focus.getActiveAnchors()).toMatchObject({
    windowResponderId: "window:inspector",
    applicationResponderId: "application:session-notes",
  });
  expect(f.manager.list().map(({ id }) => id)).toEqual(["main-window", "inspector"]);

  f.manager.makeKey(main.id);
  expect(f.manager.snapshot()).toMatchObject({
    keyWindowControllerId: "main-window",
    mainWindowControllerId: "main-window",
  });
  await f.cleanup();
});

it("leaves every window inactive when the application behind them is chosen", async () => {
  const f = createWindowTestDependencies();
  const note = f.manager.create(standardWindow("detached-note"));
  const inspector = f.manager.create(panelWindow("inspector"));
  await f.manager.open(note.id);
  await f.manager.open(inspector.id);

  f.manager.resignKey();
  expect(f.manager.snapshot()).toMatchObject({ keyWindowControllerId: null, mainWindowControllerId: null });
  expect(note.record).toMatchObject({ isKey: false, isMain: false, state: "open" });
  expect(inspector.record).toMatchObject({ isKey: false, isMain: false, state: "open" });
  expect(f.focus.getActiveAnchors().windowResponderId).toBeUndefined();
  expect(f.focus.getActiveAnchors()).toMatchObject({ applicationResponderId: "application:session-notes" });
  // Nothing changes when the application is chosen again.
  const generation = f.manager.snapshot().generation;
  f.manager.resignKey();
  expect(f.manager.snapshot().generation).toBe(generation);

  f.manager.makeKey(inspector.id);
  expect(f.manager.snapshot()).toMatchObject({ keyWindowControllerId: "inspector" });
  await f.cleanup();
});

it("cycles eligible open windows through the canonical manager", async () => {
  const f = createWindowTestDependencies();
  const first = f.manager.create(standardWindow("first"));
  const second = f.manager.create(standardWindow("second"));
  const third = f.manager.create(standardWindow("third"));
  await f.manager.open(first.id);
  await f.manager.open(second.id);
  await f.manager.open(third.id);
  f.manager.minimise(second.id);

  expect(f.manager.cycle("forward")?.id).toBe("first");
  expect(f.manager.snapshot().keyWindowControllerId).toBe("first");
  expect(f.manager.list().map(({ id }) => id)).toEqual(["second", "third", "first"]);

  expect(f.manager.cycle("backward")?.id).toBe("third");
  expect(f.manager.snapshot().keyWindowControllerId).toBe("third");
  expect(f.manager.cycle("backward")?.id).toBe("first");

  f.manager.minimise(first.id);
  expect(f.manager.cycle("forward")).toBeNull();
  await f.cleanup();
});

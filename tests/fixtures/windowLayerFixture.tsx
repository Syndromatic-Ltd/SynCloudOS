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

import React from "react";
import type { WindowRole } from "../../src/SynCloudOS/Windows";
import {
  WindowContentRendererRegistry,
  type WindowLayerDiagnostic,
} from "../../src/Webspring/WindowLayer";
import {
  createWindowTestDependencies,
  popoverWindow,
  sheetWindow,
  standardWindow,
} from "./windowTestDependencies";

export interface WindowLayerFixtureOptions {
  readonly windows?: readonly {
    readonly id: string;
    readonly role: WindowRole;
    readonly title: string;
  }[];
  readonly attachedSheet?: boolean;
  readonly includeNonRenderable?: boolean;
  readonly transientPopover?: boolean;
}

export async function createWindowLayerFixture(options: WindowLayerFixtureOptions = {}) {
  const dependencies = createWindowTestDependencies();
  const { manager, runtime, screen } = dependencies;
  Object.defineProperties(runtime, {
    windows: { configurable: true, value: manager },
    screen: { configurable: true, value: screen },
  });
  const contentRegistry = new WindowContentRendererRegistry();
  const diagnostics: WindowLayerDiagnostic[] = [];
  const registerController = (id: string) => {
    const state = manager.select(id).contentState;
    if (state.status !== "loaded" || contentRegistry.has(state.mountKey)) return;
    contentRegistry.register(state.mountKey, ({ window }) => (
      <span data-window-content-id={window.id}>content:{window.id}</span>
    ));
  };

  if (options.attachedSheet) {
    const parent = manager.create(standardWindow("memo", { title: "Memo" }));
    await manager.open(parent.id);
    registerController(parent.id);
    const sheet = manager.create(sheetWindow("save-sheet", parent.id, { title: "Save changes?" }));
    await manager.open(sheet.id);
    registerController(sheet.id);
  } else if (options.transientPopover) {
    const parent = manager.create(standardWindow("transient-parent", { title: "Transient parent" }));
    await manager.open(parent.id);
    registerController(parent.id);
    const popover = manager.create(popoverWindow("transient-popover", parent.id, "transient-anchor", {
      title: "Transient popover",
    }));
    await manager.open(popover.id);
    registerController(popover.id);
  } else {
    for (const requested of options.windows ?? []) {
      const controller = manager.create(standardWindow(requested.id, {
        role: requested.role,
        title: requested.title,
      }));
      await manager.open(controller.id);
      registerController(controller.id);
    }
  }

  if (options.includeNonRenderable) {
    const loaded = manager.create(standardWindow("loaded", {
      title: "loaded",
      bounds: { x: 80, y: 60, width: 720, height: 520 },
    }));
    await manager.open(loaded.id);
    registerController(loaded.id);

    const minimised = manager.create(standardWindow("minimised", { title: "minimised" }));
    await manager.open(minimised.id);
    registerController(minimised.id);
    manager.minimise(minimised.id);

    const hidden = manager.create(standardWindow("hidden", { title: "hidden", mobilePolicy: "hidden" }));
    await manager.open(hidden.id);
    registerController(hidden.id);

    const invalidBounds = [
      { id: "invalid-nan", bounds: { x: 80, y: 60, width: Number.NaN, height: 520 } },
      { id: "invalid-infinite", bounds: { x: Number.POSITIVE_INFINITY, y: 60, width: 720, height: 520 } },
      { id: "invalid-negative", bounds: { x: 80, y: 60, width: -1, height: 520 } },
    ];
    const invalidControllers = [];
    for (const { id, bounds } of invalidBounds) {
      const invalid = manager.create(standardWindow(id, { title: id }));
      await manager.open(invalid.id);
      registerController(invalid.id);
      invalidControllers.push({ invalid, bounds });
    }
    for (const { invalid, bounds } of invalidControllers) {
      const invalidRecord = { ...invalid.record, bounds };
      Object.defineProperty(invalid, "record", {
        configurable: true,
        get: () => invalidRecord,
      });
    }
  }

  return {
    runtime,
    manager,
    contentRegistry,
    diagnostics,
    reportDiagnostic: (diagnostic: WindowLayerDiagnostic) => diagnostics.push(diagnostic),
    async cleanup() {
      contentRegistry.dispose();
      await dependencies.cleanup();
    },
  };
}

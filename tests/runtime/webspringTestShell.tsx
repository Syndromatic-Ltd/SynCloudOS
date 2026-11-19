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


import React, { useState, type ReactNode } from "react";
import { WSBoardViewController } from "../../src/Webspring/Contents/Views/WSBoardViewController/WSBoardViewController";
import { WSApplication, constructWSApplication, createWebspring, type WSDefinition } from "../../src/Webspring/WSApplication";
import {
  WSLauncherRootView,
  WSLauncherViewController,
  wsLauncherHostState,
  wsSetLauncherHostState,
  type WSLauncherViewControllerClass,
} from "../../src/Webspring/WSLauncherViewController";
import type { WSInfo } from "../../src/Webspring/WSInfo";
import type { ShellMode, WebspringActions, WebspringViewModel } from "../../src/Webspring/webspringTypes";

/** What a test launcher's view reads: the launcher, plus the host's model and actions. */
export interface TestLauncherContext {
  readonly launcher: WSLauncherViewController;
  readonly model: WebspringViewModel;
  readonly actions: WebspringActions;
}

/** A launcher whose view is `render`, for tests that only need a shell around an outlet. */
export function createTestLauncher(render: (context: TestLauncherContext) => ReactNode = () => null, mode: ShellMode = "launcher") {
  return class TestLauncher extends WSLauncherViewController {
    static override mode = mode;
    override renderView() {
      const { model, actions } = this[wsLauncherHostState]();
      return render({ launcher: this, model, actions });
    }
  };
}

type ApplicationStatics = Partial<Pick<typeof WSApplication,
  | "launcherSurface" | "shelfSurface" | "folderAppearance" | "folderPresentation" | "iconEffect"
  | "quickSwitch" | "widgets" | "preferencePanes" | "hiddenPreferencePanes" | "viewControllers">>;

export interface TestWebspringOptions extends ApplicationStatics {
  readonly info?: Partial<WSInfo>;
  /** Defaults to the stock Board. */
  readonly launcher?: WSLauncherViewControllerClass;
}

/** A `createWebspring` definition whose application class carries the given statics. */
export function createTestWebspring({ info, launcher, ...statics }: TestWebspringOptions = {}): WSDefinition {
  class TestApplication extends WSApplication {}
  if (launcher) Object.defineProperty(TestApplication, "mainViewController", { value: launcher, enumerable: true });
  for (const [key, value] of Object.entries(statics)) {
    if (value !== undefined) Object.defineProperty(TestApplication, key, { value, enumerable: true });
  }
  return createWebspring({
    info: {
      bundleIdentifier: "com.example.fixture.webspring",
      displayName: "Fixture",
      version: "1.0.0",
      homeRoute: "/",
      branding: { name: { key: "site.name", fallback: "Fixture" } },
      ...info,
    },
    application: TestApplication,
  });
}

/** Renders a launcher straight from a model, as `WebspringHost` does, for tests that drive one by hand. */
export function TestLauncherHost({ shell, launcher: LauncherClass = WSBoardViewController, model, actions, applicationOutlet = null }: {
  readonly shell: WSDefinition;
  readonly launcher?: WSLauncherViewControllerClass;
  readonly model: WebspringViewModel;
  readonly actions: WebspringActions;
  readonly applicationOutlet?: ReactNode;
}) {
  const [{ application, launcher }] = useState(() => {
    const created = constructWSApplication(shell.application);
    const Launcher = LauncherClass as unknown as new (options: { owner: WSApplication }) => WSLauncherViewController;
    return { application: created, launcher: new Launcher({ owner: created }) };
  });
  launcher[wsSetLauncherHostState]({ application, model, actions, folderPresentation: shell.folderPresentation });
  return <WSLauncherRootView controller={launcher} applicationOutlet={applicationOutlet} />;
}

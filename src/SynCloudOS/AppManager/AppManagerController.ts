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

import type { SynCloudOSAppInfo } from "../AppInfo/appInfoTypes";
import { AppManager, type AppManagerDependencies } from "./AppManager";
import type { SynCloudOSAppManagerController, SynCloudOSAppRegistry, SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

export function createAppManagerController(
  runtime: SynCloudOSRuntime,
  dependencies: AppManagerDependencies & { appRegistry: Pick<SynCloudOSAppRegistry, "getAllApps"> },
): SynCloudOSAppManagerController {
const AppRegistry = dependencies.appRegistry;
const EventBus = runtime.events;
const managers = new Map<string, AppManager>();
const managerDependencies: AppManagerDependencies = { ...dependencies, runtime };

function isStaleManager(manager: AppManager, appInfo: SynCloudOSAppInfo) {
  return (
    manager.appInfo.normalizedAt !== appInfo.normalizedAt ||
    manager.appInfo.bundleId !== appInfo.bundleId ||
    manager.appInfo.packageName !== appInfo.packageName ||
    manager.appInfo.route !== appInfo.route ||
    manager.appInfo.presentation !== appInfo.presentation ||
    manager.appInfo.isDisabled !== appInfo.isDisabled
  );
}

const appManagerController = {
  runtimeId: runtime.runtimeId,
  createManagerForApp(appInfo: SynCloudOSAppInfo, options: { replace?: boolean; reason?: string; publish?: boolean } = {}) {
    const existing = managers.get(appInfo.id);
    if (existing && !options.replace && !isStaleManager(existing, appInfo)) {
      return existing;
    }

    const manager = new AppManager(appInfo, managerDependencies);
    managers.set(appInfo.id, manager);
    if (existing && options.publish !== false) {
      EventBus.publish("app.manager.replace", {
        appId: appInfo.id,
        packageName: appInfo.packageName,
        reason: options.reason ?? "AppInfo changed during registration"
      }, appInfo.packageName);
    }
    return manager;
  },

  publishManagerReplacement(appInfo: SynCloudOSAppInfo, reason?: string) {
    EventBus.publish("app.manager.replace", {
      appId: appInfo.id,
      packageName: appInfo.packageName,
      reason: reason ?? "AppInfo changed during registration"
    }, appInfo.packageName);
  },

  restoreManagerForApp(appId: string, manager: AppManager | null) {
    if (manager) managers.set(appId, manager);
    else managers.delete(appId);
  },

  initializeAppManagers() {
    AppRegistry.getAllApps().forEach((appInfo: SynCloudOSAppInfo) => {
      this.createManagerForApp(appInfo, { reason: "AppManagerController.initializeAppManagers" });
    });
    return this.getAppManagers();
  },

  getManagerForApp(appId: string) {
    return managers.get(appId) ?? null;
  },

  removeManagerForApp(appId: string) {
    const removed = managers.delete(appId);
    if (removed) runtime.undo.remove({ kind: "application", id: appId });
    return removed;
  },
  getAppManagers() {
    return Array.from(managers.values());
  },

  dispose() {
    managers.clear();
  }
};
return appManagerController;
}

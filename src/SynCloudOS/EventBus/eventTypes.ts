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

export type SynCloudOSRuntimeEventType =
  | "runtime.boot.begin"
  | "runtime.boot.complete"
  | "runtime.boot.skipped"
  | "runtime.transaction.begin"
  | "runtime.transaction.commit"
  | "runtime.transaction.rollback"
  | "runtime.transaction.rollback.failed"
  | "runtime.transaction.effect.begin"
  | "runtime.transaction.effect.complete"
  | "runtime.transaction.effect.failed"
  | "runtime.event.listener.failed"
  | "runtime.event.listener.reporter.failed"
  | "lifecycle.emit"
  | "policy.decision"
  | "policy.register"
  | "policy.remove"
  | "policy.accessMode.changed"
  | "plugin.register"
  | "plugin.enable"
  | "plugin.disable"
  | "plugin.unregister"
  | "boot.phase.begin"
  | "boot.phase.complete"
  | "boot.phase.failed"
  | "statechart.transition.begin"
  | "statechart.transition.complete"
  | "statechart.transition.failed"
  | "app.register"
  | "app.register.update"
  | "app.register.failed"
  | "app.unregister"
  | "app.manager.replace"
  | "app.lifecycle.transition"
  | "lifecycle.transition.requested"
  | "lifecycle.transition.failed"
  | "app.launch.requested"
  | "app.launch.ready"
  | "app.launch.visible"
  | "app.launch.complete"
  | "app.launch.failed"
  | "bundle.register"
  | "bundle.update"
  | "bundle.unregister"
  | "bundle.lifecycle.failed"
  | "window.open"
  | "window.focus"
  | "window.close"
  | "window.stack.repaired"
  | "route.open"
  | "route.notFound"
  | "webspring.hover"
  | "webspring.select"
  | "notification.post"
  | "notification.dismiss"
  | "notification.archive"
  | "notification.action"
  | "notification.expire"
  | "notification.group.clear"
  | "notification.policy.denied"
  | "error.capture"
  | "service.available"
  | "service.unavailable"
  | "locale.changed"
  | "locale.hydrate.failed"
  | "system.userInfoContextMenu.requested"
  | "workspace.returnToWebspring"
  | "workspace.focusApp";

export interface SynCloudOSRuntimeEvent {
  runtimeId: string;
  id: string;
  type: SynCloudOSRuntimeEventType | string;
  label?: string;
  at: number;
  payload?: unknown;
}

export type SynCloudOSRuntimeEventListener = (event: SynCloudOSRuntimeEvent) => void;

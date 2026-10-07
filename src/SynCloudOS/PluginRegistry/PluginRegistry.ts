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

import type { SynCloudOSPolicySubject, SynCloudOSPolicySubjectGrant } from "../PolicyKit/policyTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import type { SynCloudOSPlugin, SynCloudOSPluginRecord, SynCloudOSPluginRegisterOptions } from "./pluginTypes";

export function createPluginRegistry(runtime: SynCloudOSRuntime, dependencies: { policyKit: any; lifecycle?: any }) {
const EventBus = runtime.events;
const Lifecycle = dependencies.lifecycle ?? runtime.lifecycle;
const PolicyKit = dependencies.policyKit;
const plugins = new Map<string, SynCloudOSPluginRecord>();

function isRegisterOptions(value: unknown): value is SynCloudOSPluginRegisterOptions {
  if (!value || typeof value !== "object") return false;
  return "subject" in value || "origin" in value || "source" in value || "context" in value;
}

// Registration defaults to the registry's own system authority, granted by
// this runtime's PolicyKit per request (so it tracks the current system
// capabilities). A caller-described subject is evaluated only with a grant
// that PolicyKit issued; otherwise the derived subject applies.
function getSystemGrant(): SynCloudOSPolicySubjectGrant {
  return PolicyKit.issueSubject(getSystemSubject(), { purpose: "plugin-registry" });
}

function getSystemSubject(): SynCloudOSPolicySubject {
  return {
    user: {
      id: "system.pluginRegistry",
      displayName: "Plugin Registry",
      role: "system",
      isAuthenticated: true,
      isAnonymous: false
    },
    role: "system",
    capabilities: PolicyKit.getRoleCapabilities("system"),
    isAuthenticated: true
  };
}

function resolveRegisterInput(
  SynCloudOSOrOptions?: unknown,
  options?: SynCloudOSPluginRegisterOptions
): { SynCloudOS: unknown; options: SynCloudOSPluginRegisterOptions } {
  if (options) {
    return { SynCloudOS: SynCloudOSOrOptions, options };
  }
  if (isRegisterOptions(SynCloudOSOrOptions)) {
    return { SynCloudOS: undefined, options: SynCloudOSOrOptions };
  }
  return { SynCloudOS: SynCloudOSOrOptions, options: {} };
}

const pluginRegistry = {
  runtimeId: runtime.runtimeId,
  async register(plugin: SynCloudOSPlugin, SynCloudOSOrOptions?: unknown, registerOptions?: SynCloudOSPluginRegisterOptions) {
    if (!plugin.id || !plugin.name || !plugin.version) {
      throw new Error("SynCloudOS.PluginRegistry.register requires id, name, and version.");
    }
    const { SynCloudOS, options } = resolveRegisterInput(SynCloudOSOrOptions, registerOptions);
    const policy = PolicyKit.authorise({
      action: "plugin.register",
      subject: options.subject ?? getSystemSubject(),
      subjectGrant: options.subjectGrant ?? (options.subject ? undefined : getSystemGrant()),
      origin: options.origin ?? "runtime",
      source: options.source ?? "PluginRegistry.register",
      context: {
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        ...(options.context ?? {})
      }
    });
    if (!policy.allowed) {
      EventBus.publish("plugin.register.denied", { pluginId: plugin.id, reason: policy.reason, policy }, plugin.name);
      throw new Error(`SynCloudOS.PluginRegistry.register denied for ${plugin.id}: ${policy.reason}`);
    }
    const record: SynCloudOSPluginRecord = {
      plugin,
      status: "enabled",
      registeredAt: Date.now(),
      enabledAt: Date.now(),
      disabledAt: null
    };
    plugins.set(plugin.id, record);
    await plugin.register?.(SynCloudOS);
    EventBus.publish("plugin.register", { pluginId: plugin.id, version: plugin.version }, plugin.name);
    Lifecycle.emit("lifecycle.emit", { name: "plugin.register", pluginId: plugin.id }, plugin.name);
    return record;
  },

  unregister(pluginId: string) {
    const removed = plugins.delete(pluginId);
    EventBus.publish("plugin.unregister", { pluginId, removed }, pluginId);
    return removed;
  },

  async enable(pluginId: string) {
    const record = plugins.get(pluginId);
    if (!record) return null;
    await record.plugin.enable?.();
    record.status = "enabled";
    record.enabledAt = Date.now();
    record.disabledAt = null;
    EventBus.publish("plugin.enable", { pluginId }, pluginId);
    return record;
  },

  async disable(pluginId: string) {
    const record = plugins.get(pluginId);
    if (!record) return null;
    await record.plugin.disable?.();
    record.status = "disabled";
    record.disabledAt = Date.now();
    EventBus.publish("plugin.disable", { pluginId }, pluginId);
    return record;
  },
  getPlugin(pluginId: string) {
    return plugins.get(pluginId) ?? null;
  },

  getPlugins() {
    return Array.from(plugins.values());
  },

  dispose() {
    plugins.clear();
  }
};
return pluginRegistry;
}

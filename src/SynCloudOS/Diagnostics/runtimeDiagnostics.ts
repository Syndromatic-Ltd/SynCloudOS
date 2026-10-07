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

import type { SynCloudOSRuntimeEvent } from "../EventBus/eventTypes";
import type { RuntimeTransactionRecord } from "../Runtime/runtimeTypes";
import type { SynCloudOSPolicyDecision, SynCloudOSPolicyTraceEntry } from "../PolicyKit/policyTypes";
import { RuntimeDiagnosticLog } from "./RuntimeDiagnosticLog";

/**
 * Runtime-owned diagnostic histories. They are inspection data, kept outside
 * the reactive runtime snapshot: appending never publishes application state
 * or wakes store subscribers. Inspectors read them on demand or subscribe to
 * a log explicitly.
 */
export interface SynCloudOSRuntimeDiagnostics {
  readonly events: RuntimeDiagnosticLog<SynCloudOSRuntimeEvent>;
  readonly transactions: RuntimeDiagnosticLog<RuntimeTransactionRecord>;
  /** PolicyKit's audit of authorised decisions. */
  readonly policyDecisions: RuntimeDiagnosticLog<SynCloudOSPolicyDecision>;
  dispose(): void;
}

export interface RuntimeDiagnosticsOptions {
  readonly eventHistoryLimit?: number;
  readonly transactionHistoryLimit?: number;
  readonly policyAuditLimit?: number;
}

const kibibyte = 1024;

const retainedTraceEntries = 16;

function truncatedTrace(trace: readonly SynCloudOSPolicyTraceEntry[], estimatedBytes: number): SynCloudOSPolicyTraceEntry[] {
  if (trace.length <= retainedTraceEntries) return [...trace];
  const kept = trace.slice(0, retainedTraceEntries - 1);
  return [...kept, {
    step: "policy.trace.truncated",
    result: "info",
    message: `${trace.length - kept.length} further trace entries were not retained (decision estimated at ${estimatedBytes} bytes).`,
    requiredCapabilities: [],
    requiredRoles: [],
    requiredAccessClasses: [],
    matchedCapabilities: [],
    missingCapabilities: [],
    matchedRoles: [],
    missingRoles: [],
    matchedAccessClasses: [],
    missingAccessClasses: [],
  }];
}

function payloadSummary(payload: unknown, estimatedBytes: number) {
  const keys = payload && typeof payload === "object" ? Object.keys(payload).slice(0, 32) : [];
  return Object.freeze({ truncated: true as const, estimatedBytes, keys: Object.freeze(keys) });
}

export function createRuntimeDiagnostics(options: RuntimeDiagnosticsOptions = {}): SynCloudOSRuntimeDiagnostics {
  const events = new RuntimeDiagnosticLog<SynCloudOSRuntimeEvent>({
    maximumEntries: options.eventHistoryLimit ?? 240,
    maximumBytes: 1024 * kibibyte,
    maximumEntryBytes: 16 * kibibyte,
    // The published event keeps its full payload for live listeners; history
    // retains a bounded summary of an oversized payload.
    project: (event, estimatedBytes) => Object.freeze({ ...event, payload: payloadSummary(event.payload, estimatedBytes) }),
  });
  const transactions = new RuntimeDiagnosticLog<RuntimeTransactionRecord>({
    maximumEntries: options.transactionHistoryLimit ?? 120,
    maximumBytes: 512 * kibibyte,
    maximumEntryBytes: 16 * kibibyte,
    project: (record) => ({ ...record, effects: record.effects.slice(0, 16) }),
  });
  const policyDecisions = new RuntimeDiagnosticLog<SynCloudOSPolicyDecision>({
    maximumEntries: options.policyAuditLimit ?? 200,
    maximumBytes: 512 * kibibyte,
    maximumEntryBytes: 16 * kibibyte,
    // The caller receives the full decision; the audit keeps the outcome and
    // the head of an unusually long trace (many registered policies).
    project: (decision, estimatedBytes) => ({
      ...decision,
      reason: decision.reason.length > 512 ? `${decision.reason.slice(0, 511)}…` : decision.reason,
      trace: truncatedTrace(decision.trace, estimatedBytes),
    }),
  });
  return Object.freeze({
    events,
    transactions,
    policyDecisions,
    dispose() {
      events.dispose();
      transactions.dispose();
      policyDecisions.dispose();
    },
  });
}

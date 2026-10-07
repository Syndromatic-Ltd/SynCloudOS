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

import type {
  ConformanceInspectorExport,
  ConformanceInspectorSectionId,
  ConformanceInspectorSnapshot,
  ConformanceInspectorSnapshotMetadata,
} from "./conformanceInspectorTypes";

const maximumInspectorStringLength = 96;
// Each producer capture emits one opaque runtime-owned namespace and a local
// ordinal. This keeps references joinable inside one snapshot without
// exposing reusable nonce or capture-sequence components across exports.
const referencePattern = /^ref-[a-f0-9]{32}-[1-9][0-9]*$/;
const categoryPattern = /^[A-Za-z0-9_.:+-]{1,64}$/;
const sensitiveCategoryPattern = /(?:auth(?:entication|orization)?|token|secret|password|coo(?:kie)|bearer|credential)/iu;
const trustedSnapshots = new WeakSet<object>();

const sectionIds = new Set<ConformanceInspectorSectionId>([
  "runtime.activeOperations",
  "runtime.ownedResources",
  "lifecycle.apps",
  "lifecycle.timeline",
  "navigation.routes",
  "navigation.browserQueue",
  "adapters",
  "capabilities",
  "responderGraph",
  "commands",
  "keyBindings",
  "undoManagers",
  "documents",
  "windows",
  "panels",
  "overlays",
  "pasteboards",
  "dragSession",
  "colourPanel",
  "caches",
  "appearance",
  "accessibility",
  "performance",
  "errors",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyBoundedStrings(value: unknown): boolean {
  if (typeof value === "string") return value.length <= maximumInspectorStringLength;
  if (Array.isArray(value)) return value.every(hasOnlyBoundedStrings);
  if (!isRecord(value)) return true;
  return Object.values(value).every(hasOnlyBoundedStrings);
}

export function isConformanceInspectorReference(value: unknown): value is string {
  return typeof value === "string" && referencePattern.test(value);
}

function isReference(value: unknown): value is string {
  return isConformanceInspectorReference(value);
}

function isOptionalReference(value: unknown): boolean {
  return value === null || isReference(value);
}

function isCategory(value: unknown): value is string {
  return typeof value === "string" && categoryPattern.test(value) && !sensitiveCategoryPattern.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function everyRecord(values: readonly unknown[], predicate: (value: Record<string, unknown>) => boolean): boolean {
  return values.every((value) => isRecord(value) && predicate(value));
}

function hasRedactedIdentityProjection(snapshot: ConformanceInspectorSnapshot): boolean {
  return everyRecord(snapshot.runtime.activeOperations, (row) => (
    isReference(row.id) && isCategory(row.kind) && isCategory(row.phase) && isCategory(row.status)
  )) && everyRecord(snapshot.runtime.ownedResources, (row) => (
    isCategory(row.id) && isCategory(row.kind) && isNonNegativeInteger(row.count)
  )) && everyRecord(snapshot.lifecycle.apps, (row) => isReference(row.id) && isCategory(row.state)) &&
    everyRecord(snapshot.lifecycle.timeline, (row) => (
      isReference(row.id) && isCategory(row.type) && isOptionalReference(row.appId) && isNonNegativeInteger(row.at)
    )) && everyRecord(snapshot.navigation.routes, (row) => (
      isReference(row.id) && isCategory(row.kind) && isCategory(row.workspaceId)
    )) && everyRecord(snapshot.navigation.browserQueue, (row) => (
      isReference(row.id) && isCategory(row.kind) && isNonNegativeInteger(row.at)
    )) && everyRecord(snapshot.adapters, (row) => isCategory(row.id) && isCategory(row.kind)) &&
    everyRecord(snapshot.capabilities, (row) => isReference(row.id) && isCategory(row.capability)) &&
    (snapshot.activeResponder === null || (
      isReference(snapshot.activeResponder.id) && isCategory(snapshot.activeResponder.role) && isOptionalReference(snapshot.activeResponder.parentId)
    )) && everyRecord(snapshot.responderGraph, (row) => (
      isReference(row.id) && isCategory(row.role) && isOptionalReference(row.parentId)
    )) && everyRecord(snapshot.commands, (row) => isReference(row.id) && isReference(row.owner)) &&
    everyRecord(snapshot.keyBindings, (row) => (
      isReference(row.commandId) && isCategory(row.chord) && isCategory(row.scope)
    )) && everyRecord(snapshot.undoManagers, (row) => isReference(row.id) && isReference(row.owner)) &&
    everyRecord(snapshot.documents, (row) => (
      isReference(row.id) && isReference(row.typeId) && isCategory(row.state) &&
      (row.recovery === "none" || row.recovery === "available") && isNonNegativeInteger(row.dirtyRevision) &&
      (row.recoveryVersion === null || isNonNegativeInteger(row.recoveryVersion))
    )) && everyRecord(snapshot.windows, (row) => (
      isReference(row.id) && isCategory(row.role) && isCategory(row.state) && isNonNegativeInteger(row.zIndex)
    )) && everyRecord(snapshot.panels, (row) => (
      isReference(row.id) && isCategory(row.role) && isCategory(row.state) && isNonNegativeInteger(row.zIndex)
    )) && everyRecord(snapshot.overlays, (row) => (
      isReference(row.id) && isCategory(row.kind) && isCategory(row.state)
    )) && everyRecord(snapshot.pasteboards, (row) => (
      isCategory(row.name) && Array.isArray(row.types) && row.types.every(isReference) && isNonNegativeInteger(row.changeCount)
    )) && (snapshot.dragSession === null || (
      isReference(snapshot.dragSession.id) && isCategory(snapshot.dragSession.phase) && isCategory(snapshot.dragSession.operation)
    )) && isOptionalReference(snapshot.colourPanel.pickerId) && isOptionalReference(snapshot.colourPanel.targetOwner) &&
    everyRecord(snapshot.caches, (row) => isReference(row.id) && isNonNegativeInteger(row.entries) && isNonNegativeInteger(row.bytes)) &&
    isCategory(snapshot.appearance.selection.requested) && isCategory(snapshot.appearance.selection.resolved) &&
    everyRecord(snapshot.appearance.galleryCoverage, (row) => (
      isCategory(row.slot) && (row.status === "covered" || row.status === "unresolved" || row.status === "provenance-violation")
    )) && snapshot.appearance.unresolvedAssetSlots.every(isCategory) && snapshot.appearance.provenanceViolations.every(isCategory) &&
    everyRecord(snapshot.accessibility, (row) => isCategory(row.code) && (
      row.severity === "info" || row.severity === "warning" || row.severity === "error"
    )) && everyRecord(snapshot.performance, (row) => (
      isCategory(row.id) && isNonNegativeInteger(row.value) && isNonNegativeInteger(row.budget)
    )) && everyRecord(snapshot.errors, (row) => (
      isReference(row.id) && isReference(row.category) && isReference(row.code) && isNonNegativeInteger(row.at)
    ));
}

function isMetadata(value: unknown): value is ConformanceInspectorSnapshotMetadata {
  if (!isRecord(value) || typeof value.complete !== "boolean" || !Number.isSafeInteger(value.returned) ||
    !Number.isSafeInteger(value.redacted) || !Array.isArray(value.sections)) return false;
  return value.sections.every((section) => isRecord(section) &&
    typeof section.id === "string" && sectionIds.has(section.id as ConformanceInspectorSectionId) &&
    (section.status === "complete" || section.status === "truncated" || section.status === "unavailable") &&
    (section.total === null || (typeof section.total === "number" && Number.isSafeInteger(section.total))) &&
    typeof section.returned === "number" && Number.isSafeInteger(section.returned) &&
    typeof section.redacted === "number" && Number.isSafeInteger(section.redacted));
}

/** Verifies the narrow wire format before either a framework consumer or an
 * export receives it. The producer creates opaque references for private
 * identities, while this validator rejects an accidental raw colour identity
 * and every unbounded string if a future producer regresses. */
function isConformanceInspectorWire(value: unknown): value is ConformanceInspectorSnapshot {
  if (!isRecord(value) || !isConformanceInspectorReference(value.runtimeId) ||
    !Number.isSafeInteger(value.sequence) || typeof value.capturedAt !== "string" ||
    !isMetadata(value.metadata) || !Array.isArray(value.adapters) || !Array.isArray(value.documents) ||
    !Array.isArray(value.windows) || !Array.isArray(value.panels) || !Array.isArray(value.overlays) ||
    !isRecord(value.colourPanel)) return false;

  const pickerId = value.colourPanel.pickerId;
  const targetOwner = value.colourPanel.targetOwner;
  if (!isOptionalReference(pickerId) || !isOptionalReference(targetOwner)) return false;
  return hasOnlyBoundedStrings(value) && hasRedactedIdentityProjection(value as unknown as ConformanceInspectorSnapshot);
}

/**
 * A conformance snapshot is an immutable capability minted by the canonical
 * producer, not an attacker-provided JSON shape. The structural check remains
 * useful for producer regressions; trust admission prevents an arbitrary
 * object with a few matching fields from crossing the export boundary.
 */
export function trustConformanceInspectorSnapshot<T extends ConformanceInspectorSnapshot>(value: T): T {
  if (!Object.isFrozen(value) || !isConformanceInspectorWire(value)) {
    throw new Error("Conformance inspector producer attempted to publish an invalid snapshot.");
  }
  trustedSnapshots.add(value);
  return value;
}

export function isConformanceInspectorSnapshot(value: unknown): value is ConformanceInspectorSnapshot {
  return isRecord(value) && trustedSnapshots.has(value) && isConformanceInspectorWire(value);
}

export function assertConformanceInspectorSnapshot(value: unknown): asserts value is ConformanceInspectorSnapshot {
  if (!isConformanceInspectorSnapshot(value)) {
    throw new Error("Conformance inspector rejected an unredacted or invalid snapshot.");
  }
}

export function createConformanceInspectorExport(snapshot: ConformanceInspectorSnapshot): ConformanceInspectorExport {
  assertConformanceInspectorSnapshot(snapshot);
  const content = JSON.stringify(snapshot);
  return Object.freeze({
    fileName: "syncloudos-conformance-snapshot.json" as const,
    content,
    bytes: new TextEncoder().encode(content).byteLength,
  });
}

export { maximumInspectorStringLength };

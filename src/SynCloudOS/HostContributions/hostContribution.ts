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

import { normalizeBundleIdentifier } from "../Identity/bundleIdentifier.mjs";
import type {
  SynCloudOSAppServiceDefinition,
  SynCloudOSAppServiceResolution,
  SynCloudOSRuntime,
  SynCloudOSRuntimeConfig,
  SynCloudOSRuntimeEnvironment,
  ApplicationDocumentRuntimeConfiguration,
} from "../Runtime/runtimeInstanceTypes";
import type { TrustedSynWareBundle } from "../BundleLoader/bundleTypes";
import type { SynCloudOSServiceDefinition } from "../ServiceRegistry/serviceTypes";
import type { DocumentAdapterRegistration, DocumentStorageAdapter } from "../Documents/Adapters/documentAdapterTypes";
import { DocumentStoreDocumentAdapter } from "../Documents/Adapters/DocumentStoreDocumentAdapter";
import type { DocumentType, DocumentTypeRegistration } from "../Documents/documentTypes";
import type { DocumentRecoveryStore } from "../Documents/DocumentRecoveryStore";
import type { DocumentAssetStore } from "../Documents/documentAssetTypes";
import type { DocumentAssetRuntimeBacking, DocumentAssetRuntimeManifestConfiguration } from "../Runtime/DocumentAssetRuntimeIntegration";
import type {
  DocumentStoreReadOptions,
  DocumentStoreWriteOptions,
  SynCloudOSDocument,
  SynCloudOSDocumentDraftInput,
  SynCloudOSDocumentKindMetadata,
  SynCloudOSDocumentMediaAttachment,
  SynCloudOSPublishedDocumentQuery,
  SynCloudOSDocumentReference,
  SynCloudOSDocumentRevision,
  SynCloudOSDocumentRevisionOptions,
  SynCloudOSDocumentSlugResolveOptions,
  SynCloudOSDocumentUnpublishOptions,
  SynCloudOSDocumentPublishOptions,
  SynCloudOSDraftDocumentQuery,
  SynCloudOSDocumentStoreContext,
} from "../DocumentStore";
import type {
  SynCloudOSAppAccessPolicy,
  SynCloudOSPolicySubject,
  SynCloudOSPolicySubjectGrant,
  SynCloudOSRoleCapabilityRegistrationInput,
} from "../PolicyKit/policyTypes";
import type { SynCloudOSIdentityUser } from "../Identity/identityTypes";
import type { LUFXQuery, LUFXQueryDescriptor } from "../../FX/LuminaFX/LUFXQuery";
import type { LUFXQueryExecutionOptions, LUFXQueryResultPage } from "../../FX/LuminaFX/LUFXQueryPlanner";
import type { LUFXSuggestionOptions } from "../../FX/LuminaFX/LUFXSuggestions";
import type { LuminaItemEligibilityInput } from "../LuminaFX/LuminaEligibility";
import type {
  LUFXHostDomainRegistration,
  LUFXHostQueryBatch,
  LUFXHostSuggestionBatch,
} from "../LuminaFX/LUFXHostService";
import type {
  LUFXActivationReference,
  LUFXActivationResult,
} from "../LuminaFX/LUFXActivationResolver";
import type {
  LuminaDonationProjection,
  LuminaDonationReconcileReceipt,
  LuminaDonationSourceRecord,
} from "../LuminaFX/LuminaDonationCoordinator";

/** Runtime configuration fields that a contribution may own. Environment and
 * additive collections are supplied by the host composer, never by a
 * contribution's scalar object. */
export type SynCloudOSHostScalarRuntimeConfig = Omit<
  Partial<SynCloudOSRuntimeConfig>,
  "environment" | "initialBundles" | "trustedDocumentKinds" | "applicationDocuments"
>;

export type SynCloudOSHostContributionCleanup = () => void | Promise<void>;

type MutableApplicationDocumentConfiguration = {
  -readonly [Key in keyof ApplicationDocumentRuntimeConfiguration]?: ApplicationDocumentRuntimeConfiguration[Key];
};

export interface SynCloudOSHostContributionPreparation {
  readonly runtimeConfig?: Readonly<SynCloudOSHostScalarRuntimeConfig>;
  readonly initialBundles?: readonly TrustedSynWareBundle[];
  readonly trustedDocumentKinds?: readonly SynCloudOSDocumentKindMetadata[];
  readonly applicationDocuments?: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>>;
  readonly install?: (
    context: SynCloudOSHostInstallContext,
  ) => void | SynCloudOSHostContributionCleanup | Promise<void | SynCloudOSHostContributionCleanup>;
}

/** Public contribution handles intentionally contain no preparation callback.
 * The callback is held in a module-private WeakMap and cannot be recreated by
 * copying the visible ID. */
export interface SynCloudOSHostContribution {
  readonly id: string;
}

export interface PreparedSynCloudOSHostContribution {
  readonly id: string;
  readonly source: string;
  readonly runtimeConfig: Readonly<SynCloudOSHostScalarRuntimeConfig>;
  readonly initialBundles: readonly TrustedSynWareBundle[];
  readonly trustedDocumentKinds: readonly SynCloudOSDocumentKindMetadata[];
  readonly applicationDocuments?: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>>;
  readonly install?: (
    context: SynCloudOSHostInstallContext,
  ) => void | SynCloudOSHostContributionCleanup | Promise<void | SynCloudOSHostContributionCleanup>;
}

export interface SynCloudOSHostServiceInstallPort {
  registerClient<TDefinition extends SynCloudOSAppServiceDefinition<object>>(definition: TDefinition): void;
  registerDescriptor(definition: SynCloudOSServiceDefinition): SynCloudOSHostContributionCleanup;
  has(serviceId: string): boolean;
  resolve<TClient = object>(request: {
    readonly appId: string;
    readonly serviceId: string;
    readonly permissions: readonly string[];
    readonly minimumVersion?: string;
  }): SynCloudOSAppServiceResolution<TClient>;
}

export interface SynCloudOSHostDocumentInstallPort {
  registerType<TModel, TSerialized = TModel>(type: DocumentType<TModel, TSerialized>): DocumentTypeRegistration;
  registerAdapter(adapter: DocumentStorageAdapter): DocumentAdapterRegistration;
  registerDocumentStoreAdapter(options: Readonly<{
    id: string;
    documentIdPrefix: string;
  }>): DocumentAdapterRegistration;
}

export interface SynCloudOSHostTerminalSeedReservation {
  publish(options?: SynCloudOSDocumentPublishOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocument>;
  unpublish(options?: SynCloudOSDocumentUnpublishOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocument>;
  deleteDraft(options?: DocumentStoreWriteOptions): Promise<void>;
  release(): boolean;
}

export interface SynCloudOSHostSeedPort {
  readPublished(
    reference: SynCloudOSDocumentReference,
    options?: DocumentStoreReadOptions,
  ): Promise<SynCloudOSDocument | null>;
  listPublished(
    query?: SynCloudOSPublishedDocumentQuery,
    options?: DocumentStoreReadOptions,
  ): Promise<SynCloudOSDocument[]>;
  listDrafts(
    query?: SynCloudOSDraftDocumentQuery,
    options?: DocumentStoreReadOptions,
  ): Promise<SynCloudOSDocument[]>;
  getDraft(documentId: string, options?: DocumentStoreReadOptions): Promise<SynCloudOSDocument | null>;
  saveDraft<TBody = unknown, TMetadata extends Record<string, unknown> = Record<string, unknown>>(
    draft: SynCloudOSDocumentDraftInput<TBody, TMetadata>,
    options?: DocumentStoreWriteOptions,
  ): Promise<SynCloudOSDocument<TBody, TMetadata> & { readonly storageVersion: { readonly id: string; readonly sequence: number; readonly etag: string; readonly savedAt: string } }>;
  listDraftVersions(documentId: string, options?: DocumentStoreReadOptions): Promise<readonly { readonly id: string; readonly sequence: number; readonly savedAt: string; readonly etag: string }[]>;
  readDraftVersion(documentId: string, versionId: string, options?: DocumentStoreReadOptions): Promise<SynCloudOSDocument | null>;
  deleteDraft(documentId: string, options?: DocumentStoreWriteOptions): Promise<void>;
  createRevision(documentId: string, options?: SynCloudOSDocumentRevisionOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocumentRevision>;
  publish(documentId: string, options?: SynCloudOSDocumentPublishOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocument>;
  unpublish(documentId: string, options?: SynCloudOSDocumentUnpublishOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocument>;
  resolveSlug(slug: string, options?: SynCloudOSDocumentSlugResolveOptions, readOptions?: DocumentStoreReadOptions): Promise<SynCloudOSDocument | null>;
  attachMedia(documentId: string, media: SynCloudOSDocumentMediaAttachment, options?: DocumentStoreReadOptions): Promise<SynCloudOSDocument>;
  /** Host-only authority for one terminal target. Release after canonical receipt
   * settlement; cancellation does not imply that a dispatched provider stopped. */
  reserveTerminalMutation(documentId: string, identity: string): SynCloudOSHostTerminalSeedReservation;
}

export interface SynCloudOSHostEventInstallPort {
  subscribe(type: string, listener: (event: unknown) => void): SynCloudOSHostContributionCleanup;
}

export interface SynCloudOSHostPolicyInstallPort {
  declare(input: { readonly appId: string; readonly policy: SynCloudOSAppAccessPolicy }): void;
  registerRoleCapabilities(input: SynCloudOSRoleCapabilityRegistrationInput): SynCloudOSHostContributionCleanup;
  currentSubject(): SynCloudOSPolicySubject;
}

export interface SynCloudOSHostBootNotificationInstallPort {
  register(id: string, callback: () => void | Promise<void>): SynCloudOSHostContributionCleanup;
}

export interface SynCloudOSHostResourceInstallPort {
  lookup(resource: string): string | null;
}

/** Trusted host-only Lumina authority. Contributions can register projections
 * only for applications they prepared. Privileged cross-owner querying still
 * passes through PolicyKit in the runtime-owned LUFXHostService. */
export interface SynCloudOSHostLuminaInstallPort {
  registerDomain(input: LUFXHostDomainRegistration): SynCloudOSHostContributionCleanup;
  setEligibility(input: LuminaItemEligibilityInput): number;
  queryOwnedEligible(
    ownerAppId: string,
    value: LUFXQuery | LUFXQueryDescriptor,
    options?: LUFXQueryExecutionOptions,
  ): Promise<LUFXQueryResultPage>;
  queryEligible(
    value: LUFXQuery | LUFXQueryDescriptor,
    options?: LUFXQueryExecutionOptions,
  ): Promise<LUFXHostQueryBatch>;
  suggestEligible(
    value: LUFXQuery | LUFXQueryDescriptor,
    options?: LUFXSuggestionOptions & { readonly signal?: AbortSignal },
  ): Promise<LUFXHostSuggestionBatch>;
  filterCurrent(batch: LUFXHostQueryBatch): LUFXHostQueryBatch;
  activate(reference: LUFXActivationReference, options?: { readonly signal?: AbortSignal }): Promise<LUFXActivationResult>;
  createDonationCoordinator<TValue>(input: Readonly<{
    ownerAppId: string;
    domain: string;
    checkpointKey: string;
    readSource(signal: AbortSignal): Promise<readonly LuminaDonationSourceRecord<TValue>[]>;
    project(record: LuminaDonationSourceRecord<TValue>, nowMs: number): LuminaDonationProjection;
  }>): Readonly<{
    reconcile(options?: { readonly signal?: AbortSignal }): Promise<LuminaDonationReconcileReceipt>;
    dispose(): void;
  }>;
}

/** Host-owned setup context. Every property is a narrow capability projection;
 * the raw runtime and its store, command, transfer, window, and disposal
 * authorities remain private to the browser mount implementation. */
export interface SynCloudOSHostInstallContext {
  readonly id: string;
  readonly source: string;
  readonly signal: AbortSignal;
  readonly services: SynCloudOSHostServiceInstallPort;
  readonly documents: SynCloudOSHostDocumentInstallPort;
  readonly seed: SynCloudOSHostSeedPort;
  readonly events: SynCloudOSHostEventInstallPort;
  readonly policy: SynCloudOSHostPolicyInstallPort;
  readonly lumina: SynCloudOSHostLuminaInstallPort;
  readonly bootNotifications: SynCloudOSHostBootNotificationInstallPort;
  readonly resources: SynCloudOSHostResourceInstallPort;
  readonly persistence: {
    get<T>(key: string, fallback: T): T;
    set<T>(key: string, value: T): boolean;
    remove(key: string): void;
  };
  readonly state: {
    subscribe(listener: () => void): SynCloudOSHostContributionCleanup;
  };
  readonly bundles: {
    get(appId: string): TrustedSynWareBundle | null;
  };
  readonly clock: {
    now(): number;
    randomUUID(): string;
  };
}

export interface SynCloudOSHostCompositionInput {
  readonly runtimeConfig?: Readonly<SynCloudOSHostScalarRuntimeConfig>;
  readonly initialBundles?: readonly TrustedSynWareBundle[];
  readonly trustedDocumentKinds?: readonly SynCloudOSDocumentKindMetadata[];
  readonly applicationDocuments?: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>>;
}

export interface SynCloudOSHostComposition {
  readonly runtimeConfig: Readonly<SynCloudOSHostScalarRuntimeConfig>;
  readonly initialBundles: readonly TrustedSynWareBundle[];
  readonly trustedDocumentKinds: readonly SynCloudOSDocumentKindMetadata[];
  readonly applicationDocuments?: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>>;
}

interface ContributionRecord {
  readonly id: string;
  readonly source: string;
  readonly prepare: (environment: SynCloudOSRuntimeEnvironment) => SynCloudOSHostContributionPreparation | Promise<SynCloudOSHostContributionPreparation>;
}

interface PreparedRecord {
  readonly id: string;
  readonly source: string;
}

const contributionRecords = new WeakMap<object, ContributionRecord>();
const preparedRecords = new WeakMap<object, PreparedRecord>();
const assetBackingSources = new WeakMap<object, object>();
const contributionIdPattern = /^[a-z0-9][a-z0-9._-]{0,127}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(value: object, key: string, label: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`${label} ${key} must be an enumerable data property.`);
  }
  return descriptor.value;
}

function ownKeys(value: object, label: string): string[] {
  const keys: string[] = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new TypeError(`${label} must not contain symbol keys.`);
    keys.push(key);
  }
  return keys;
}

function assertPlainRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${label} must be a plain record.`);
}

function cloneReadonlyRecord(value: unknown, label: string, allowed: ReadonlySet<string>): Readonly<Record<string, unknown>> {
  if (value === undefined) return Object.freeze({});
  assertPlainRecord(value, label);
  const output: Record<string, unknown> = {};
  for (const key of ownKeys(value, label)) {
    if (!allowed.has(key)) throw new TypeError(`${label} does not support ${key}.`);
    const item = ownData(value, key, label);
    if (item !== undefined) output[key] = item;
  }
  return Object.freeze(output);
}

const runtimeScalarKeys = new Set<string>([
  "id",
  "adapters",
  "initialPathname",
  "persistenceNamespace",
  "windowPersistenceNamespace",
  "operationHistoryLimit",
  "jobs",
  "resourceSoftBudgetBytes",
  "performancePolicy",
  "commandHistoryLimit",
  "undoMaxEntries",
  "undoMaxEstimatedBytes",
  "lifecycleHookTimeoutMs",
  "presentationTimeoutMs",
  "presentationRolesForRoute",
  "dragAuthorisation",
  "imageAuthorisation",
  "webContentAuthorisation",
  "identity",
  "authenticationPolicy",
  "policyProfile",
  "userNotifications",
]);
const applicationDocumentKeys = new Set<string>(["recoveryStore", "initialAdapters", "initialTypes", "assetBacking"]);

function captureRecoveryStore(value: unknown): DocumentRecoveryStore | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" ||
      !("write" in value) || typeof value.write !== "function" ||
      !("read" in value) || typeof value.read !== "function" ||
      !("remove" in value) || typeof value.remove !== "function") {
    throw new TypeError("Application document recovery stores require write, read, and remove operations.");
  }
  return value as DocumentRecoveryStore;
}

function assetCapabilityProperty(value: object, key: string, label: string): unknown {
  for (let current: object | null = value; current !== null && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new TypeError(`${label}.${key} must be a data property, not an accessor.`);
    return descriptor.value;
  }
  return undefined;
}

function captureAssetOperation<T extends (...args: never[]) => unknown>(value: object, key: string, label: string): T;
function captureAssetOperation<T extends (...args: never[]) => unknown>(value: object, key: string, label: string, optional: true): T | undefined;
function captureAssetOperation(value: object, key: string, label: string, optional = false) {
  const operation = assetCapabilityProperty(value, key, label);
  if (operation === undefined && optional) return undefined;
  if (typeof operation !== "function") throw new TypeError(`${label}.${key} must be a function.`);
  // Preserve the receiver without bind's reads of caller-controlled function
  // name/length metadata. Invocation remains lazy and returns the exact result.
  return Object.freeze((...args: unknown[]) => Reflect.apply(operation, value, args));
}

function captureAssetStore(value: unknown): DocumentAssetStore {
  const label = "Application document assetBacking.store";
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError(`${label} must be a store capability.`);
  const capabilities = cloneReadonlyRecord(assetCapabilityProperty(value, "capabilities", label), `${label}.capabilities`, new Set([
    "durability", "maximumAssetBytes", "maximumTotalBytes", "maximumRetentionRoots", "retention", "deduplication",
  ]));
  if (capabilities.durability !== "memory" && capabilities.durability !== "durable") throw new TypeError(`${label}.capabilities requires explicit memory or durable backing.`);
  for (const key of ["maximumAssetBytes", "maximumTotalBytes", "maximumRetentionRoots"]) {
    const quota = capabilities[key];
    if (typeof quota !== "number" || !Number.isSafeInteger(quota) || quota < 0) throw new TypeError(`${label}.capabilities.${key} must be a nonnegative safe integer.`);
  }
  if (capabilities.retention !== "persistent-roots" || capabilities.deduplication !== "authorization-scoped") {
    throw new TypeError(`${label}.capabilities requires persistent-roots retention and authorization-scoped deduplication.`);
  }
  const promoteRetentionRoot = captureAssetOperation<NonNullable<DocumentAssetStore["promoteRetentionRoot"]>>(value, "promoteRetentionRoot", label, true);
  return Object.freeze({
    capabilities: capabilities as unknown as DocumentAssetStore["capabilities"],
    put: captureAssetOperation<DocumentAssetStore["put"]>(value, "put", label),
    read: captureAssetOperation<DocumentAssetStore["read"]>(value, "read", label),
    copy: captureAssetOperation<DocumentAssetStore["copy"]>(value, "copy", label),
    retain: captureAssetOperation<DocumentAssetStore["retain"]>(value, "retain", label),
    release: captureAssetOperation<DocumentAssetStore["release"]>(value, "release", label),
    listRetentionRoots: captureAssetOperation<DocumentAssetStore["listRetentionRoots"]>(value, "listRetentionRoots", label),
    collectGarbage: captureAssetOperation<DocumentAssetStore["collectGarbage"]>(value, "collectGarbage", label),
    dispose: captureAssetOperation<DocumentAssetStore["dispose"]>(value, "dispose", label),
    ...(promoteRetentionRoot === undefined ? {} : { promoteRetentionRoot }),
  });
}

function captureAssetBacking(value: unknown): DocumentAssetRuntimeBacking | undefined {
  if (value === undefined) return undefined;
  const label = "Application document assetBacking";
  assertPlainRecord(value, label);
  // Recomposition of an admitted snapshot preserves both capture and provenance.
  if (assetBackingSources.has(value)) return value as unknown as DocumentAssetRuntimeBacking;
  const options = cloneReadonlyRecord(value, label, new Set(["store", "createStore", "scopeForDocument", "manifest"]));
  if ((options.store !== undefined) === (options.createStore !== undefined)) throw new TypeError(`${label} requires exactly one store or createStore.`);
  const scopeForDocument = captureAssetOperation<DocumentAssetRuntimeBacking["scopeForDocument"]>(value, "scopeForDocument", label);
  let manifest: DocumentAssetRuntimeManifestConfiguration | undefined;
  if (options.manifest !== undefined) {
    const manifestLabel = `${label}.manifest`, input = options.manifest;
    assertPlainRecord(input, manifestLabel);
    const fields = cloneReadonlyRecord(input, manifestLabel, new Set(["enumerateReferences", "scopeForLocation", "nativeDurability", "hash"]));
    let nativeDurability: DocumentAssetRuntimeManifestConfiguration["nativeDurability"];
    if (typeof fields.nativeDurability === "function") {
      nativeDurability = captureAssetOperation<Extract<NonNullable<DocumentAssetRuntimeManifestConfiguration["nativeDurability"]>, (...args: never[]) => unknown>>(input, "nativeDurability", manifestLabel);
    } else if (fields.nativeDurability === undefined || fields.nativeDurability === "memory" || fields.nativeDurability === "durable") {
      nativeDurability = fields.nativeDurability;
    } else throw new TypeError(`${manifestLabel}.nativeDurability must be memory, durable, or a function.`);
    const hash = captureAssetOperation<NonNullable<DocumentAssetRuntimeManifestConfiguration["hash"]>>(input, "hash", manifestLabel, true);
    manifest = Object.freeze({
      enumerateReferences: captureAssetOperation<DocumentAssetRuntimeManifestConfiguration["enumerateReferences"]>(input, "enumerateReferences", manifestLabel),
      scopeForLocation: captureAssetOperation<DocumentAssetRuntimeManifestConfiguration["scopeForLocation"]>(input, "scopeForLocation", manifestLabel),
      ...(nativeDurability === undefined ? {} : { nativeDurability }),
      ...(hash === undefined ? {} : { hash }),
    });
  }
  const callbacks = { scopeForDocument, ...(manifest === undefined ? {} : { manifest }) };
  let captured: DocumentAssetRuntimeBacking;
  if (options.store !== undefined) captured = Object.freeze({ ...callbacks, store: captureAssetStore(options.store) });
  else {
    const factory = captureAssetOperation<NonNullable<DocumentAssetRuntimeBacking["createStore"]>>(value, "createStore", label);
    captured = Object.freeze({ ...callbacks, createStore: Object.freeze(() => captureAssetStore(factory())) });
  }
  assetBackingSources.set(captured, value);
  return captured;
}

function cloneArray<T>(value: unknown, label: string): readonly T[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? descriptors[key] : undefined;
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must contain enumerable data entries.`);
    }
  }
  const result: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
      throw new TypeError(`${label} must contain dense enumerable data entries.`);
    }
    result.push(descriptor.value as T);
  }
  return Object.freeze(result);
}

function normalizePreparation(record: ContributionRecord, value: unknown): PreparedSynCloudOSHostContribution {
  assertPlainRecord(value, `Host contribution ${record.id} preparation`);
  const allowed = new Set(["runtimeConfig", "initialBundles", "trustedDocumentKinds", "applicationDocuments", "install"]);
  for (const key of ownKeys(value, `Host contribution ${record.id} preparation`)) {
    if (!allowed.has(key)) throw new TypeError(`Host contribution ${record.id} preparation does not support ${key}.`);
  }
  const runtimeConfig = cloneReadonlyRecord(ownData(value, "runtimeConfig", `Host contribution ${record.id} preparation`), "Host contribution runtimeConfig", runtimeScalarKeys) as SynCloudOSHostScalarRuntimeConfig;
  const initialBundles = cloneArray<TrustedSynWareBundle>(ownData(value, "initialBundles", `Host contribution ${record.id} preparation`), "Host contribution initialBundles");
  const trustedDocumentKinds = cloneArray<SynCloudOSDocumentKindMetadata>(ownData(value, "trustedDocumentKinds", `Host contribution ${record.id} preparation`), "Host contribution trustedDocumentKinds");
  const applicationDocumentsValue = ownData(value, "applicationDocuments", `Host contribution ${record.id} preparation`);
  let applicationDocuments: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>> | undefined;
  if (applicationDocumentsValue !== undefined) {
    assertPlainRecord(applicationDocumentsValue, "Host contribution applicationDocuments");
    for (const key of ownKeys(applicationDocumentsValue, "Host contribution applicationDocuments")) {
      if (!applicationDocumentKeys.has(key)) throw new TypeError(`Host contribution applicationDocuments does not support ${key}.`);
    }
    const recoveryStore = captureRecoveryStore(ownData(applicationDocumentsValue, "recoveryStore", "Host contribution applicationDocuments"));
    const assetBacking = captureAssetBacking(ownData(applicationDocumentsValue, "assetBacking", "Host contribution applicationDocuments"));
    const initialAdapters = cloneArray<DocumentStorageAdapter>(ownData(applicationDocumentsValue, "initialAdapters", "Host contribution applicationDocuments"), "Host contribution applicationDocuments.initialAdapters");
    const initialTypes = cloneArray<DocumentType<unknown, unknown>>(ownData(applicationDocumentsValue, "initialTypes", "Host contribution applicationDocuments"), "Host contribution applicationDocuments.initialTypes");
    const normalizedDocuments: MutableApplicationDocumentConfiguration = {};
    if (recoveryStore !== undefined) normalizedDocuments.recoveryStore = recoveryStore;
    if (assetBacking !== undefined) normalizedDocuments.assetBacking = assetBacking;
    if (initialAdapters.length > 0) normalizedDocuments.initialAdapters = initialAdapters;
    if (initialTypes.length > 0) normalizedDocuments.initialTypes = initialTypes;
    applicationDocuments = Object.freeze(normalizedDocuments);
  }
  const install = ownData(value, "install", `Host contribution ${record.id} preparation`);
  if (install !== undefined && typeof install !== "function") throw new TypeError(`Host contribution ${record.id} install must be a function.`);
  const prepared = Object.freeze({
    id: record.id,
    source: record.source,
    runtimeConfig,
    initialBundles,
    trustedDocumentKinds,
    ...(applicationDocuments === undefined ? {} : { applicationDocuments }),
    ...(install === undefined ? {} : { install: install as PreparedSynCloudOSHostContribution["install"] }),
  });
  preparedRecords.set(prepared, { id: record.id, source: record.source });
  return prepared;
}

export function createSynCloudOSHostContribution(
  id: string,
  source: string,
  prepare: ContributionRecord["prepare"],
): SynCloudOSHostContribution {
  if (!contributionIdPattern.test(id)) throw new TypeError("A host contribution ID must be a bounded lowercase identifier.");
  if (typeof source !== "string" || source.trim().length === 0) throw new TypeError("A host contribution source must be a non-empty string.");
  if (typeof prepare !== "function") throw new TypeError("A host contribution preparer must be a function.");
  const contribution = Object.freeze({ id });
  contributionRecords.set(contribution, { id, source, prepare });
  return contribution;
}

export async function prepareSynCloudOSHostContributions(
  contributions: readonly SynCloudOSHostContribution[],
  environment: SynCloudOSRuntimeEnvironment,
): Promise<readonly PreparedSynCloudOSHostContribution[]> {
  if (!Array.isArray(contributions)) throw new TypeError("Host contributions must be an array.");
  const ids = new Set<string>();
  const prepared: PreparedSynCloudOSHostContribution[] = [];
  for (const contribution of contributions) {
    if (!contribution || typeof contribution !== "object") throw new TypeError("Host contributions must be opaque host handles.");
    const record = contributionRecords.get(contribution);
    if (!record) throw new TypeError("Host contribution was not created by this host registry.");
    if (ids.has(record.id)) throw new TypeError(`Duplicate host contribution ID ${record.id}.`);
    ids.add(record.id);
    const value = await record.prepare(environment);
    prepared.push(normalizePreparation(record, value));
  }
  return Object.freeze(prepared);
}

function preparedRecord(value: PreparedSynCloudOSHostContribution): PreparedRecord {
  if (!value || typeof value !== "object") throw new TypeError("Prepared host contributions must be opaque registry results.");
  const record = preparedRecords.get(value);
  if (!record || value.id !== record.id || value.source !== record.source) {
    throw new TypeError("Prepared host contribution provenance is invalid.");
  }
  return record;
}

function bundleId(bundle: TrustedSynWareBundle): string {
  if (!bundle || typeof bundle !== "object") throw new TypeError("Host contribution bundles must be objects.");
  const manifest = bundle.synWareManifest ?? bundle.manifest;
  if (!manifest || typeof manifest !== "object" || typeof manifest.bundleIdentifier !== "string" || manifest.bundleIdentifier.trim().length === 0) {
    throw new TypeError("Host contribution bundles require a canonical manifest ID.");
  }
  return normalizeBundleIdentifier(manifest.bundleIdentifier);
}

function kindId(kind: SynCloudOSDocumentKindMetadata): string {
  if (!kind || typeof kind !== "object" || typeof kind.kind !== "string" || kind.kind.trim().length === 0) {
    throw new TypeError("Trusted document kinds require a non-empty ID.");
  }
  return kind.kind;
}

function typeId(type: DocumentType<unknown, unknown>): string {
  if (!type || typeof type !== "object" || typeof type.id !== "string" || type.id.trim().length === 0) {
    throw new TypeError("Application document types require a non-empty ID.");
  }
  return type.id;
}

function adapterId(adapter: DocumentStorageAdapter): string {
  if (!adapter || typeof adapter !== "object" || typeof adapter.id !== "string" || adapter.id.trim().length === 0) {
    throw new TypeError("Application document adapters require a non-empty ID.");
  }
  return adapter.id;
}

function equivalent(left: unknown, right: unknown, seen = new Map<object, object>()): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;
  if (seen.get(left) === right) return true;
  seen.set(left, right);
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => equivalent(value, right[index], seen));
  }
  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) return false;
  const leftKeys = Reflect.ownKeys(left);
  const rightKeys = Reflect.ownKeys(right);
  if (leftKeys.length !== rightKeys.length || !leftKeys.every((key) => rightKeys.includes(key))) return false;
  return leftKeys.every((key) => {
    const leftDescriptor = Object.getOwnPropertyDescriptor(left, key);
    const rightDescriptor = Object.getOwnPropertyDescriptor(right, key);
    if (!leftDescriptor || !rightDescriptor || !("value" in leftDescriptor) || !("value" in rightDescriptor)) return false;
    return equivalent(leftDescriptor.value, rightDescriptor.value, seen);
  });
}

function addUnique<T>(target: T[], values: readonly T[], idOf: (value: T) => string, label: string): void {
  const ids = new Set(target.map(idOf));
  for (const value of values) {
    const id = idOf(value);
    if (ids.has(id)) throw new TypeError(`Duplicate ${label} ID ${id}.`);
    ids.add(id);
    target.push(value);
  }
}

function normalizedCompositionInput(input: SynCloudOSHostCompositionInput): SynCloudOSHostComposition {
  if (!isRecord(input)) throw new TypeError("Host composition input must be a plain record.");
  const runtimeConfig = cloneReadonlyRecord(input.runtimeConfig, "Host composition runtimeConfig", runtimeScalarKeys) as SynCloudOSHostScalarRuntimeConfig;
  const initialBundles = cloneArray<TrustedSynWareBundle>(input.initialBundles, "Host composition initialBundles");
  const trustedDocumentKinds = cloneArray<SynCloudOSDocumentKindMetadata>(input.trustedDocumentKinds, "Host composition trustedDocumentKinds");
  const applicationDocumentsValue = ownData(input, "applicationDocuments", "Host composition input");
  let applicationDocuments: Readonly<Partial<ApplicationDocumentRuntimeConfiguration>> | undefined;
  if (applicationDocumentsValue !== undefined) {
    if (!isRecord(applicationDocumentsValue)) throw new TypeError("Host composition applicationDocuments must be a plain record.");
    for (const key of ownKeys(applicationDocumentsValue, "Host composition applicationDocuments")) {
      if (!applicationDocumentKeys.has(key)) throw new TypeError(`Host composition applicationDocuments does not support ${key}.`);
    }
    const normalized: MutableApplicationDocumentConfiguration = {};
    const recoveryStore = captureRecoveryStore(ownData(applicationDocumentsValue, "recoveryStore", "Host composition applicationDocuments"));
    const assetBacking = captureAssetBacking(ownData(applicationDocumentsValue, "assetBacking", "Host composition applicationDocuments"));
    const initialAdapters = cloneArray<DocumentStorageAdapter>(ownData(applicationDocumentsValue, "initialAdapters", "Host composition applicationDocuments"), "Host composition applicationDocuments.initialAdapters");
    const initialTypes = cloneArray<DocumentType<unknown, unknown>>(ownData(applicationDocumentsValue, "initialTypes", "Host composition applicationDocuments"), "Host composition applicationDocuments.initialTypes");
    if (recoveryStore !== undefined) normalized.recoveryStore = recoveryStore;
    if (assetBacking !== undefined) normalized.assetBacking = assetBacking;
    if (initialAdapters.length > 0) normalized.initialAdapters = initialAdapters;
    if (initialTypes.length > 0) normalized.initialTypes = initialTypes;
    applicationDocuments = Object.freeze(normalized);
  }
  return Object.freeze({ runtimeConfig, initialBundles, trustedDocumentKinds, ...(applicationDocuments === undefined ? {} : { applicationDocuments }) });
}

export function composeSynCloudOSHostContributions(
  contributions: readonly PreparedSynCloudOSHostContribution[],
  base: SynCloudOSHostCompositionInput = {},
): SynCloudOSHostComposition {
  if (!Array.isArray(contributions)) throw new TypeError("Prepared host contributions must be an array.");
  const normalizedBase = normalizedCompositionInput(base);
  const records = contributions.map((contribution) => ({ contribution, record: preparedRecord(contribution) }));
  const ids = new Set<string>();
  for (const { record } of records) {
    if (ids.has(record.id)) throw new TypeError(`Duplicate host contribution ID ${record.id}.`);
    ids.add(record.id);
  }

  const scalarValues = new Map<string, { readonly value: unknown; readonly owner: string }>();
  const scalar: Record<string, unknown> = {};
  const addScalar = (config: Readonly<Record<string, unknown>>, owner: string) => {
    for (const key of Object.keys(config)) {
      const value = config[key];
      const existing = scalarValues.get(key);
      if (existing && !equivalent(existing.value, value)) {
        throw new TypeError(`Conflicting host runtime configuration for ${key}: ${existing.owner} and ${owner}.`);
      }
      if (!existing) {
        scalarValues.set(key, { value, owner });
        scalar[key] = value;
      }
    }
  };
  addScalar(normalizedBase.runtimeConfig, "host");

  const bundles: TrustedSynWareBundle[] = [];
  const kinds: SynCloudOSDocumentKindMetadata[] = [];
  const types: DocumentType<unknown, unknown>[] = [];
  const adapters: DocumentStorageAdapter[] = [];
  let recoveryStore = normalizedBase.applicationDocuments?.recoveryStore;
  let recoveryOwner = recoveryStore === undefined ? undefined : "host";
  let assetBacking = normalizedBase.applicationDocuments?.assetBacking;
  let assetBackingOwner = assetBacking === undefined ? undefined : "host";
  for (const { contribution, record } of records) {
    addScalar(contribution.runtimeConfig, `${record.id} (${record.source})`);
    addUnique(bundles, contribution.initialBundles, bundleId, "SynWare bundle");
    addUnique(kinds, contribution.trustedDocumentKinds, kindId, "trusted document kind");
    const docs = contribution.applicationDocuments;
    if (docs?.recoveryStore !== undefined) {
      if (recoveryStore !== undefined && !Object.is(recoveryStore, docs.recoveryStore)) {
        throw new TypeError(`Conflicting application document recovery stores: ${recoveryOwner} and ${record.id}.`);
      }
      recoveryStore = docs.recoveryStore;
      recoveryOwner ??= record.id;
    }
    if (docs?.assetBacking !== undefined) {
      if (assetBacking !== undefined && assetBackingSources.get(assetBacking) !== assetBackingSources.get(docs.assetBacking)) {
        throw new TypeError(`Conflicting application document asset backing: ${assetBackingOwner} and ${record.id}.`);
      }
      if (assetBacking === undefined) { assetBacking = docs.assetBacking; assetBackingOwner = record.id; }
    }
    addUnique(types, docs?.initialTypes ?? [], typeId, "application document type");
    addUnique(adapters, docs?.initialAdapters ?? [], adapterId, "application document adapter");
  }
  addUnique(bundles, normalizedBase.initialBundles, bundleId, "SynWare bundle");
  addUnique(kinds, normalizedBase.trustedDocumentKinds, kindId, "trusted document kind");
  addUnique(types, normalizedBase.applicationDocuments?.initialTypes ?? [], typeId, "application document type");
  addUnique(adapters, normalizedBase.applicationDocuments?.initialAdapters ?? [], adapterId, "application document adapter");

  const applicationDocuments = recoveryStore === undefined && assetBacking === undefined && types.length === 0 && adapters.length === 0
    ? undefined
    : Object.freeze({
      ...(recoveryStore === undefined ? {} : { recoveryStore }),
      ...(assetBacking === undefined ? {} : { assetBacking }),
      ...(adapters.length === 0 ? {} : { initialAdapters: Object.freeze(adapters) }),
      ...(types.length === 0 ? {} : { initialTypes: Object.freeze(types) }),
    });
  return Object.freeze({
    runtimeConfig: Object.freeze(scalar) as SynCloudOSHostScalarRuntimeConfig,
    initialBundles: Object.freeze(bundles),
    trustedDocumentKinds: Object.freeze(kinds),
    ...(applicationDocuments === undefined ? {} : { applicationDocuments }),
  });
}

function hostAbortError(): DOMException {
  return new DOMException("The host contribution installation was aborted.", "AbortError");
}

function assertLive(signal: AbortSignal): void {
  if (signal.aborted) throw hostAbortError();
}

function combineSignals(primary: AbortSignal, secondary?: AbortSignal): AbortSignal {
  if (!secondary || secondary === primary) return primary;
  return AbortSignal.any([primary, secondary]);
}

function awaitSignal<T>(value: Promise<T>, signal: AbortSignal): Promise<T> {
  assertLive(signal);
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(hostAbortError()));
    signal.addEventListener("abort", onAbort, { once: true });
    value.then((result) => finish(() => resolve(result)), (error) => finish(() => reject(error)));
  });
}
function contextStoreContext(
  signal: AbortSignal,
  source: string,
  subject: SynCloudOSPolicySubject,
  origin: "runtime" | "hostContribution",
  subjectGrant?: SynCloudOSPolicySubjectGrant,
): SynCloudOSDocumentStoreContext {
  return Object.freeze({ signal, source, origin, subject, ...(subjectGrant ? { subjectGrant } : {}) });
}

interface HostInstallContextHandle {
  readonly context: SynCloudOSHostInstallContext;
  readonly cleanup: () => Promise<void>;
  readonly runBootNotifications: () => Promise<void>;
}

/** Creates the one contribution-bound port set used by browser installation.
 * The runtime argument is private to this module and is never placed on the
 * returned context object. */
export function createSynCloudOSHostInstallContext(
  prepared: PreparedSynCloudOSHostContribution,
  runtime: SynCloudOSRuntime,
  resources: Readonly<Record<string, string>> = {},
  signal: AbortSignal = runtime.signal,
): HostInstallContextHandle {
  const record = preparedRecord(prepared);
  const installation = new AbortController();
  signal = combineSignals(signal, installation.signal);
  const tracked: SynCloudOSHostContributionCleanup[] = [];
  const terminalReservations = new Set<() => boolean>();
  let cleaned = false;
  const bootNotifications = new Map<string, () => void | Promise<void>>();
  const track = (cleanup: SynCloudOSHostContributionCleanup) => {
    tracked.push(cleanup);
    return cleanup;
  };
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    installation.abort("host-contribution-disposed");
    for (const release of terminalReservations) release();
    const errors: unknown[] = [];
    for (const dispose of [...tracked].reverse()) {
      try { await dispose(); } catch (error) { errors.push(error); }
    }
    bootNotifications.clear();
    if (errors.length > 0) throw new AggregateError(errors, `Host contribution ${record.id} cleanup failed.`);
  };
  const run = async <T>(operation: (operationSignal: AbortSignal) => Promise<T>, operationSignal?: AbortSignal): Promise<T> => {
    const combined = combineSignals(signal, operationSignal);
    assertLive(combined);
    const result = await awaitSignal(Promise.resolve().then(() => operation(combined)), combined);
    assertLive(combined);
    return result;
  };
  const currentSubject = () => {
    assertLive(signal);
    return runtime.policy.getCurrentSubject();
  };
  const seedUser: SynCloudOSIdentityUser = {
    id: `system.host-contribution:${record.source}`,
    displayName: `Host contribution ${record.id}`,
    role: "system",
    isAuthenticated: true,
    isAnonymous: false,
  };
  Object.freeze(seedUser);
  const seedCapabilities = [...new Set([
    "documentStore.drafts.read",
    "documentStore.draft.write",
    "documentStore.revision.create",
    "documentStore.publish",
    "documentStore.unpublish",
    "documentStore.media.write",
    ...prepared.trustedDocumentKinds.flatMap((kind) =>
      Object.values(kind.permissions ?? {}).flatMap((permission) => permission?.requiredCapabilities ?? [])),
  ])];
  Object.freeze(seedCapabilities);
  const seedSubject: SynCloudOSPolicySubject = {
    user: seedUser,
    role: "system",
    capabilities: seedCapabilities,
    isAuthenticated: true,
  };
  Object.freeze(seedSubject);
  // Seeding is host authority, so it is granted by this runtime's PolicyKit
  // and withdrawn with the installation; request metadata alone grants nothing.
  const seedGrant = runtime.policy.issueSubject(seedSubject, { purpose: `host-contribution-seed:${record.id}` });
  track(() => { runtime.policy.revokeSubject(seedGrant); });
  const storeContext = (operationSignal: AbortSignal) =>
    contextStoreContext(operationSignal, record.source, seedSubject, "hostContribution", seedGrant);
  const seedKinds = new Set(prepared.trustedDocumentKinds.map((kind) => kind.kind));
  const seedApplications = new Set([
    ...prepared.initialBundles.map((bundle) => bundle.manifest.bundleIdentifier),
    ...(prepared.applicationDocuments?.initialTypes ?? []).map((type) => type.creatingApplicationId).filter((id): id is string => typeof id === "string"),
  ].map(normalizeBundleIdentifier));
  const inSeedScope = (document: Pick<SynCloudOSDocument, "kind" | "applicationId">) =>
    seedKinds.has(document.kind) && (document.applicationId === undefined || seedApplications.has(normalizeBundleIdentifier(document.applicationId)));
  const scopedRecord = <T extends SynCloudOSDocument | null>(document: T): T => {
    if (document && !inSeedScope(document)) throw new DOMException("The document is outside this contribution's declared seed scope.", "SecurityError");
    return document;
  };
  const scopedDocumentOperation = <T>(documentId: string, operationSignal: AbortSignal, operation: () => Promise<T>) => run(async () => {
    scopedRecord(await runtime.documentStore.getDraft(documentId, storeContext(operationSignal)));
    assertLive(operationSignal);
    return operation();
  }, operationSignal);
  const seed: SynCloudOSHostSeedPort = {
    readPublished: (reference, options) => run(async (operationSignal) => scopedRecord(await runtime.documentStore.readPublished(reference, storeContext(operationSignal))), options?.signal),
    listPublished: (query, options) => run(async (operationSignal) => (await runtime.documentStore.listPublished(query, storeContext(operationSignal))).filter(inSeedScope), options?.signal),
    listDrafts: (query, options) => run(async (operationSignal) => (await runtime.documentStore.listDrafts(query, storeContext(operationSignal))).filter(inSeedScope), options?.signal),
    getDraft: (documentId, options) => run(async (operationSignal) => scopedRecord(await runtime.documentStore.getDraft(documentId, storeContext(operationSignal))), options?.signal),
    saveDraft: (draft, options) => run(async (operationSignal) => {
      if (!inSeedScope(draft)) throw new DOMException("The draft is outside this contribution's declared seed scope.", "SecurityError");
      if (draft.id) scopedRecord(await runtime.documentStore.getDraft(draft.id, storeContext(operationSignal)));
      return runtime.documentStore.saveDraft(draft, storeContext(operationSignal), { ifMatch: options?.ifMatch, idempotencyKey: options?.idempotencyKey, signal: operationSignal });
    }, options?.signal),
    listDraftVersions: (documentId, options) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.listDraftVersions(documentId, storeContext(operationSignal), { signal: operationSignal })), options?.signal),
    readDraftVersion: (documentId, versionId, options) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, async () => scopedRecord(await runtime.documentStore.readDraftVersion(documentId, versionId, storeContext(operationSignal), { signal: operationSignal }))), options?.signal),
    deleteDraft: (documentId, options) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.deleteDraft(documentId, storeContext(operationSignal), { ifMatch: options?.ifMatch, idempotencyKey: options?.idempotencyKey, signal: operationSignal })), options?.signal),
    createRevision: (documentId, options, readOptions) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.createRevision(documentId, options, storeContext(operationSignal))), readOptions?.signal),
    publish: (documentId, options, readOptions) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.publish(documentId, options, storeContext(operationSignal))), readOptions?.signal),
    unpublish: (documentId, options, readOptions) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.unpublish(documentId, options, storeContext(operationSignal))), readOptions?.signal),
    resolveSlug: (slug, options, readOptions) => run(async (operationSignal) => scopedRecord(await runtime.documentStore.resolveSlug(slug, options, storeContext(operationSignal))), readOptions?.signal),
    attachMedia: (documentId, media, options) => run((operationSignal) => scopedDocumentOperation(documentId, operationSignal, () => runtime.documentStore.attachMedia(documentId, media, storeContext(operationSignal))), options?.signal),
    reserveTerminalMutation(documentId, identity) {
      assertLive(signal);
      const lease = runtime.documentStore.reserveTerminalMutation(documentId, identity);
      documentId = lease.documentId;
      let releaseRequested = false;
      let inFlight = 0;
      const release = () => {
        if (releaseRequested) return false;
        releaseRequested = true;
        terminalReservations.delete(release);
        if (inFlight === 0) lease.release();
        return true;
      };
      terminalReservations.add(release);
      const mutate = async <T>(
        operation: (context: SynCloudOSDocumentStoreContext, operationSignal: AbortSignal) => Promise<T>,
        operationSignal?: AbortSignal,
      ): Promise<T> => {
        if (releaseRequested) throw new DOMException("The terminal seed reservation was released.", "InvalidStateError");
        const combined = combineSignals(signal, operationSignal);
        assertLive(combined);
        inFlight += 1;
        try {
          const context = storeContext(combined);
          const draft = await runtime.documentStore.getDraft(documentId, context);
          scopedRecord(draft ?? await runtime.documentStore.readPublished(documentId, context));
          assertLive(combined);
          if (releaseRequested) throw new DOMException("The terminal seed reservation was released.", "InvalidStateError");
          // Do not race provider settlement against abort or reject an accepted
          // result afterward: a noncooperative provider can still mutate.
          return await operation(lease.authorise(context), combined);
        } finally {
          inFlight -= 1;
          if (releaseRequested && inFlight === 0) lease.release();
        }
      };
      return Object.freeze({
        publish: (options?: SynCloudOSDocumentPublishOptions, readOptions?: DocumentStoreReadOptions) =>
          mutate((context) => runtime.documentStore.publish(documentId, options, context), readOptions?.signal),
        unpublish: (options?: SynCloudOSDocumentUnpublishOptions, readOptions?: DocumentStoreReadOptions) =>
          mutate((context) => runtime.documentStore.unpublish(documentId, options, context), readOptions?.signal),
        deleteDraft: (options?: DocumentStoreWriteOptions) =>
          mutate((context, operationSignal) => runtime.documentStore.deleteDraft(documentId, context, {
            ifMatch: options?.ifMatch, idempotencyKey: options?.idempotencyKey, signal: operationSignal,
          }), options?.signal),
        release,
      });
    },
  };

  const registerType = <TModel, TSerialized = TModel>(type: DocumentType<TModel, TSerialized>): DocumentTypeRegistration => {
    assertLive(signal);
    const registration = runtime.documents.registerType(type);
    track(() => registration.dispose());
    return registration;
  };
  const registerAdapter = (adapter: DocumentStorageAdapter): DocumentAdapterRegistration => {
    assertLive(signal);
    const registration = runtime.documents.registerAdapter(adapter);
    track(() => registration.dispose());
    return registration;
  };
  const registerDocumentStoreAdapter = (options: Readonly<{
    id: string;
    documentIdPrefix: string;
  }>): DocumentAdapterRegistration => {
    assertLive(signal);
    if (!options || typeof options !== "object") {
      throw new TypeError("Host document-store adapter options must be a record.");
    }
    if (typeof options.id !== "string" || options.id.trim().length === 0) {
      throw new TypeError("Host document-store adapter ID must be a non-empty string.");
    }
    if (typeof options.documentIdPrefix !== "string" || options.documentIdPrefix.length === 0) {
      throw new TypeError("Host document-store adapter prefix must be a non-empty string.");
    }
    return registerAdapter(new DocumentStoreDocumentAdapter(runtime.documentStore, {
      id: options.id,
      documentIdPrefix: options.documentIdPrefix,
    }));
  };
  const services = Object.freeze<SynCloudOSHostServiceInstallPort>({
    registerClient(definition) {
      assertLive(signal);
      if (!definition || typeof definition.id !== "string" || definition.id.trim().length === 0) throw new TypeError("Host service IDs must not be empty.");
      if (runtime.services.get(definition.id)) throw new TypeError(`Duplicate host service ID ${definition.id}.`);
      const registered = runtime.services.register({
        ...definition,
        createAppClient(context) {
          assertLive(signal);
          return definition.createAppClient?.({ ...context, signal: combineSignals(signal, context.signal) }) ?? null;
        },
        ...(definition.createRoutePreparationClient ? { createRoutePreparationClient(context: Parameters<NonNullable<typeof definition.createRoutePreparationClient>>[0]) {
          assertLive(signal);
          return definition.createRoutePreparationClient!({ ...context, signal: combineSignals(signal, context.signal) });
        } } : {}),
      });
      if (!registered) throw new TypeError(`Host service ${definition.id} could not be registered.`);
      track(() => {
        if (runtime.services.get(definition.id) === registered) runtime.services.unregister(definition.id);
      });
    },
    registerDescriptor(definition) {
      assertLive(signal);
      if (!definition || typeof definition.id !== "string" || definition.id.trim().length === 0) throw new TypeError("Host service descriptor IDs must not be empty.");
      if (runtime.services.getService(definition.id)) throw new TypeError(`Duplicate host service descriptor ID ${definition.id}.`);
      const registered = runtime.services.registerService(definition);
      return track(() => {
        runtime.services.unregisterService(definition.id, registered);
      });
    },
    has(serviceId) {
      assertLive(signal);
      return runtime.services.get(serviceId) !== null;
    },
    resolve(request) {
      assertLive(signal);
      return runtime.services.resolveAppClient({ ...request, signal });
    },
  });
  const events = Object.freeze<SynCloudOSHostEventInstallPort>({
    subscribe(type, listener) {
      assertLive(signal);
      if (typeof type !== "string" || !type.trim() || typeof listener !== "function") throw new TypeError("Host event subscriptions require a type and listener.");
      const unsubscribe = runtime.events.subscribe(type, (event) => { if (!signal.aborted) listener(event); });
      return track(unsubscribe);
    },
  });
  const policy = Object.freeze<SynCloudOSHostPolicyInstallPort>({
    declare(input) {
      assertLive(signal);
      if (!input || typeof input.appId !== "string" || !input.appId.trim()) throw new TypeError("Host policy declarations require an application ID.");
      if (!isRecord(input.policy)) throw new TypeError("Host policy declarations require a policy record.");
      if (!prepared.initialBundles.some((bundle) => normalizeBundleIdentifier(bundle.manifest.bundleIdentifier) === normalizeBundleIdentifier(input.appId))) {
        throw new DOMException("A contribution may declare policy only for its own applications.", "SecurityError");
      }
      const appId = input.appId;
      const declaration = structuredClone(input.policy);
      const policyId = `host:${record.id}:${normalizeBundleIdentifier(appId)}`;
      runtime.policy.registerPolicy(policyId, (request, decision) => {
        const requestedAppId = request.app?.bundleIdentifier ?? request.context?.appId;
        if (!decision.allowed || typeof requestedAppId !== "string" || normalizeBundleIdentifier(requestedAppId) !== normalizeBundleIdentifier(appId)) return decision;
        const app = request.app ?? runtime.apps.getApp(appId);
        if (!app) return decision;
        const declaredDecision = runtime.policy.evaluate({ ...request, app: { ...app, policy: declaration } }, { applyRegisteredPolicies: false });
        return declaredDecision.allowed ? decision : declaredDecision;
      });
      track(() => { runtime.policy.removePolicy(policyId); });
    },
    registerRoleCapabilities(input) {
      assertLive(signal);
      const registration = runtime.policy.registerRoleCapabilities(input);
      return track(() => {
        registration.dispose();
      });
    },
    currentSubject,
  });
  const luminaApplicationIds = new Set(prepared.initialBundles.map((bundle) => normalizeBundleIdentifier(bundle.synWareManifest?.bundleIdentifier ?? bundle.manifest.bundleIdentifier)));
  const assertLuminaApplication = (appId: string, role: "owner" | "destination") => {
    if (!luminaApplicationIds.has(normalizeBundleIdentifier(appId))) {
      throw new DOMException(`A host contribution may use only its own Lumina ${role} application.`, "SecurityError");
    }
  };
  const lumina = Object.freeze<SynCloudOSHostLuminaInstallPort>({
    registerDomain(input) {
      assertLive(signal);
      assertLuminaApplication(input.ownerAppId, "owner");
      assertLuminaApplication(input.destinationAppId, "destination");
      const unregister = runtime.luminaHost.registerDomain({
        ...input,
        resolve: async (resolverInput) => {
          const resolverSignal = combineSignals(signal, resolverInput.signal);
          assertLive(resolverSignal);
          const resolved = await awaitSignal(Promise.resolve(input.resolve({ ...resolverInput, signal: resolverSignal })), resolverSignal);
          assertLive(resolverSignal);
          return resolved;
        },
      });
      return track(unregister);
    },
    setEligibility(input) {
      assertLive(signal);
      assertLuminaApplication(input.ownerAppId, "owner");
      return runtime.luminaHost.setEligibility(input);
    },
    queryOwnedEligible(ownerAppId, value, options = {}) {
      assertLuminaApplication(ownerAppId, "owner");
      return run((operationSignal) => runtime.luminaHost.queryOwnedEligible(ownerAppId, value, { ...options, signal: operationSignal }), options.signal);
    },
    queryEligible(value, options = {}) {
      return run((operationSignal) => runtime.luminaHost.queryEligible(value, { ...options, signal: operationSignal }), options.signal);
    },
    suggestEligible(value, options = {}) {
      return run((operationSignal) => runtime.luminaHost.suggestEligible(value, { ...options, signal: operationSignal }), options.signal);
    },
    filterCurrent(batch) {
      assertLive(signal);
      return runtime.luminaHost.filterCurrent(batch);
    },
    activate(reference, options = {}) {
      return run((operationSignal) => runtime.luminaHost.activate(reference, { signal: operationSignal }), options.signal);
    },
    createDonationCoordinator(input) {
      assertLive(signal);
      assertLuminaApplication(input.ownerAppId, "owner");
      if (typeof input.checkpointKey !== "string" || !input.checkpointKey.trim() || input.checkpointKey.length > 160) {
        throw new TypeError("Lumina donation checkpoint key must be a non-empty string of at most 160 characters.");
      }
      const persistenceKey = `host:${prepared.id}:lumina-donation:${input.checkpointKey.trim()}`;
      const coordinator = runtime.luminaHost.createDonationCoordinator({
        ownerAppId: input.ownerAppId,
        domain: input.domain,
        checkpointStore: {
          load: () => runtime.persistence.getPreference(persistenceKey, null),
          save: (checkpoint) => { runtime.persistence.setPreference(persistenceKey, checkpoint); },
          clear: () => { runtime.persistence.removePreference(persistenceKey); },
        },
        readSource: async (sourceSignal) => {
          const operationSignal = combineSignals(signal, sourceSignal);
          assertLive(operationSignal);
          return await awaitSignal(input.readSource(operationSignal), operationSignal);
        },
        project: input.project,
        now: () => runtime.environment.now(),
        scheduler: {
          schedule(callback, delayMs) {
            return runtime.environment.setTimeout(() => {
              void Promise.resolve(callback()).catch(() => undefined);
            }, delayMs);
          },
          cancel(handle) {
            runtime.environment.clearTimeout(handle);
          },
        },
      });
      const release = track(() => coordinator.dispose());
      return Object.freeze({
        reconcile(options = {}) {
          return run((operationSignal) => coordinator.reconcile({ signal: operationSignal }), options.signal);
        },
        dispose() {
          release();
        },
      });
    },
  });
  const bootPort = Object.freeze<SynCloudOSHostBootNotificationInstallPort>({
    register(id, callback) {
      assertLive(signal);
      if (typeof id !== "string" || !id.trim() || typeof callback !== "function") throw new TypeError("Boot notifications require an ID and callback.");
      if (bootNotifications.has(id)) throw new TypeError(`Duplicate boot notification ID ${id}.`);
      bootNotifications.set(id, callback);
      let disposed = false;
      return track(() => {
        if (disposed) return;
        disposed = true;
        if (bootNotifications.get(id) === callback) bootNotifications.delete(id);
      });
    },
  });
  const context: SynCloudOSHostInstallContext = Object.freeze({
    id: record.id,
    source: record.source,
    signal,
    services,
    documents: Object.freeze({ registerType, registerAdapter, registerDocumentStoreAdapter }),
    seed: Object.freeze(seed),
    events,
    policy,
    lumina,
    bootNotifications: bootPort,
    resources: Object.freeze({ lookup(resource: string) {
      assertLive(signal);
      return Object.prototype.hasOwnProperty.call(resources, resource) ? resources[resource]! : null;
    } }),
    persistence: Object.freeze({
      get<T>(key: string, fallback: T) { assertLive(signal); return runtime.persistence.getPreference(key, fallback); },
      set<T>(key: string, value: T) { assertLive(signal); return runtime.persistence.setPreference(key, value); },
      remove(key: string) { assertLive(signal); runtime.persistence.removePreference(key); },
    }),
    state: Object.freeze({ subscribe(listener: () => void) {
      assertLive(signal);
      return track(runtime.store.subscribe(listener));
    } }),
    bundles: Object.freeze({ get(appId: string) {
      assertLive(signal);
      return runtime.bundles.getBundle(appId);
    } }),
    clock: Object.freeze({
      now() {
        assertLive(signal);
        return runtime.environment.now();
      },
      randomUUID() {
        assertLive(signal);
        return runtime.environment.randomUUID();
      },
    }),
  });
  return Object.freeze({
    context,
    cleanup,
    async runBootNotifications() {
      assertLive(signal);
      for (const callback of [...bootNotifications.values()]) {
        await run(() => Promise.resolve(callback()));
      }
    },
  });
}

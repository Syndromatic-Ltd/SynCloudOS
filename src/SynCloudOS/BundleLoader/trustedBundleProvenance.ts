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

import type { TrustedSynWareBundle } from "./bundleTypes";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";

export type SynWareTrustedPrivilege = string;

export interface SynWareTrustedBundleProvenance {
  readonly sourceKey: string;
  readonly privileges: ReadonlySet<SynWareTrustedPrivilege>;
}

/** Host/test minting accepts a short iterable and always seals it into the
 * read-only record exposed by provenance inspection. */
type SynWareTrustedBundleProvenanceInput = Readonly<{
  sourceKey: string;
  privileges: Iterable<SynWareTrustedPrivilege>;
}>;

const trustedBundleProvenanceBrand: unique symbol = Symbol("SynCloudOS trusted bundle provenance");

type BrandedTrustedBundleProvenance = SynWareTrustedBundleProvenance & {
  readonly [trustedBundleProvenanceBrand]: true;
  /** Never exported as part of the public record: a provenance association
   * cannot survive an identity-changing normalisation. */
  readonly registeredAppId: string;
};

const trustedBundleProvenanceByBundle = new WeakMap<object, BrandedTrustedBundleProvenance>();

function readonlyPrivilegeSet(values: readonly SynWareTrustedPrivilege[]): ReadonlySet<SynWareTrustedPrivilege> {
  const source = new Set(values);
  return Object.freeze({
    get size() { return source.size; },
    has(value: SynWareTrustedPrivilege) { return source.has(value); },
    entries() { return source.entries(); },
    keys() { return source.keys(); },
    values() { return source.values(); },
    forEach(callback: (value: SynWareTrustedPrivilege, key: SynWareTrustedPrivilege, set: ReadonlySet<SynWareTrustedPrivilege>) => void, thisArg?: unknown) {
      source.forEach((value) => callback.call(thisArg, value, value, this));
    },
    [Symbol.iterator]() { return source[Symbol.iterator](); },
  } satisfies ReadonlySet<SynWareTrustedPrivilege>);
}

function createTrustedProvenance(
  bundle: TrustedSynWareBundle,
  input: SynWareTrustedBundleProvenanceInput,
): BrandedTrustedBundleProvenance {
  if (typeof bundle.manifest.id !== "string" || bundle.manifest.id.trim().length === 0) {
    throw new TypeError("Trusted bundle provenance requires a canonical application identity.");
  }
  if (typeof input.sourceKey !== "string" || input.sourceKey.trim().length === 0) {
    throw new TypeError("Trusted bundle provenance requires a non-empty host source key.");
  }
  const privileges = Array.from(input.privileges, (privilege) => {
    if (typeof privilege !== "string" || privilege.trim().length === 0) {
      throw new TypeError("Trusted bundle provenance privileges must be non-empty strings.");
    }
    return privilege.trim();
  });
  if (privileges.length === 0) throw new TypeError("Trusted bundle provenance requires at least one privilege.");
  return Object.freeze({
    sourceKey: input.sourceKey,
    privileges: readonlyPrivilegeSet(privileges),
    [trustedBundleProvenanceBrand]: true as const,
    registeredAppId: bundle.manifest.id,
  });
}

function assertCanonicalTrustedBundleCandidate(bundle: TrustedSynWareBundle): void {
  if (!bundle.synWareManifest || bundle.synWareManifest.id !== bundle.manifest.id) {
    throw new TypeError("Trusted provenance requires a canonical V1 SynWare bundle.");
  }
}

/**
 * Host discovery calls this after it has selected a canonical first-party
 * source. The brand lives only in this module's WeakMap, so manifest fields,
 * lazy modules, spreads, and JSON cannot manufacture a lookalike record.
 */
export function trustSynWareBundleForCanonicalHost<TBundle extends TrustedSynWareBundle>(
  bundle: TBundle,
  provenance: SynWareTrustedBundleProvenanceInput,
): TBundle {
  assertCanonicalTrustedBundleCandidate(bundle);
  trustedBundleProvenanceByBundle.set(bundle, createTrustedProvenance(bundle, provenance));
  return bundle;
}

/** Explicit test-only registration path. It is intentionally not re-exported
 * by the application SDK package. */
export function trustSynWareBundleForTest<TBundle extends TrustedSynWareBundle>(
  bundle: TBundle,
  provenance: SynWareTrustedBundleProvenanceInput,
): TBundle {
  return trustSynWareBundleForCanonicalHost(bundle, provenance);
}

/** Preserve host-owned provenance through loader normalisation. A copied
 * object without this transfer has no authority. */
export function preserveTrustedSynWareBundleProvenance<TBundle extends TrustedSynWareBundle>(
  source: TrustedSynWareBundle,
  target: TBundle,
): TBundle {
  const provenance = trustedBundleProvenanceByBundle.get(source);
  if (provenance && target.manifest.id === provenance.registeredAppId) {
    trustedBundleProvenanceByBundle.set(target, provenance);
  }
  return target;
}

export function getTrustedSynWareBundleProvenance(bundle: TrustedSynWareBundle | null | undefined): SynWareTrustedBundleProvenance | null {
  if (!bundle) return null;
  const provenance = trustedBundleProvenanceByBundle.get(bundle);
  return provenance?.registeredAppId === bundle.manifest.id ? provenance : null;
}

/** Every privileged operation resolves the currently registered record. This
 * intentionally treats replacement, unregistration, forged fields, and a
 * missing manifest declaration as fail-closed conditions. */
export function requireTrustedBundlePrivilege(
  runtime: SynCloudOSRuntime,
  appId: string,
  privilege: SynWareTrustedPrivilege,
  capability: string,
): void {
  const bundle = runtime.bundles.getBundle(appId);
  const provenance = getTrustedSynWareBundleProvenance(bundle);
  if (!bundle || bundle.manifest.id !== appId || bundle.synWareManifest?.id !== appId ||
      !provenance || !provenance.privileges.has(privilege)) {
    throw new DOMException(`SynWare ${appId} does not hold host-owned trusted provenance for ${privilege}.`, "SecurityError");
  }
  if (!bundle.synWareManifest?.permissions?.includes(capability)) {
    throw new DOMException(`SynWare ${appId} must declare capability ${capability} for ${privilege}.`, "SecurityError");
  }
}

/** Host presentation code can avoid mounting a conformance port for ordinary
 * apps. The corresponding client methods still perform the authoritative
 * throwing check again on every call. */
export function hasTrustedBundlePrivilege(
  runtime: SynCloudOSRuntime,
  appId: string,
  privilege: SynWareTrustedPrivilege,
  capability: string,
): boolean {
  try {
    requireTrustedBundlePrivilege(runtime, appId, privilege, capability);
    return true;
  } catch {
    return false;
  }
}

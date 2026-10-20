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
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import type {
  SynCloudOSHostContribution,
  SynCloudOSHostContributionPreparation,
} from "../SynCloudOS/HostContributions/hostContribution";
import { createSynCloudOSHostContribution } from "../SynCloudOS/HostContributions/hostContribution";

/** A host contribution a project declares as `src/Integrations/<Name>.integration.ts`. */
export interface SynWareIntegrationInput extends Omit<SynCloudOSHostContributionPreparation, "initialBundles"> {
  /** Application IDs this integration extends. A build that selects none of them drops the integration. */
  readonly owners: readonly string[];
}

export interface SynWareIntegrationDefinition extends Omit<SynCloudOSHostContributionPreparation, "initialBundles"> {
  readonly owners: readonly string[];
}

export interface SynWareIntegrationDiscovered {
  /** Contribution ID, derived from the file name: `Journal.integration.ts` -> `journal`. */
  readonly id: string;
  /** The file the definition came from, used in errors and contribution provenance. */
  readonly source: string;
}

const ownerPattern = /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/u;
const defined = new WeakSet<object>();

function captureOwners(input: unknown): readonly string[] {
  if (!Array.isArray(input)) throw new TypeError("defineIntegration owners must be an array of application IDs.");
  if (input.length === 0) throw new TypeError("defineIntegration needs at least one owner: the applications it extends.");
  const owners: string[] = [];
  for (const owner of input) {
    if (typeof owner !== "string" || !ownerPattern.test(owner)) {
      throw new TypeError(`defineIntegration owners must be application IDs; ${String(owner)} is not one.`);
    }
    if (owners.includes(owner)) throw new TypeError(`defineIntegration owners list ${owner} twice.`);
    owners.push(owner);
  }
  return Object.freeze(owners);
}

function dataProperty(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new TypeError(`A Webspring integration ${key} must be an enumerable data property, not an accessor.`);
  }
  return descriptor.value;
}

/**
 * Declares a host integration for the applications it names. The file lives at
 * `src/Integrations/<Name>.integration.ts` and must default-export the result:
 *
 * ```ts
 * export default defineIntegration({
 *   owners: ["journal", "journal-publisher"],
 *   install: (context) => context.documents.registerType(JournalNote),
 * });
 * ```
 */
export function defineIntegration(input: SynWareIntegrationInput): SynWareIntegrationDefinition {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new TypeError("A Webspring integration must be declared with an object.");
  }
  const owners = captureOwners(dataProperty(input, "owners"));
  const install = dataProperty(input, "install");
  if (install !== undefined && typeof install !== "function") {
    throw new TypeError("A Webspring integration install must be a function.");
  }
  const runtimeConfig = dataProperty(input, "runtimeConfig");
  const trustedDocumentKinds = dataProperty(input, "trustedDocumentKinds");
  const applicationDocuments = dataProperty(input, "applicationDocuments");
  const definition: SynWareIntegrationDefinition = Object.freeze({
    owners,
    ...(install === undefined ? {} : { install: install as SynWareIntegrationDefinition["install"] }),
    ...(runtimeConfig === undefined ? {} : { runtimeConfig: runtimeConfig as SynWareIntegrationDefinition["runtimeConfig"] }),
    ...(trustedDocumentKinds === undefined ? {} : { trustedDocumentKinds: trustedDocumentKinds as SynWareIntegrationDefinition["trustedDocumentKinds"] }),
    ...(applicationDocuments === undefined ? {} : { applicationDocuments: applicationDocuments as SynWareIntegrationDefinition["applicationDocuments"] }),
  });
  defined.add(definition);
  return definition;
}

/** Whether `value` came from `defineIntegration`. */
export function isIntegrationDefinition(value: unknown): value is SynWareIntegrationDefinition {
  return typeof value === "object" && value !== null && defined.has(value);
}

/** The applications an integration extends. */
export function integrationOwners(value: unknown, source = "An integration module"): readonly string[] {
  if (!isIntegrationDefinition(value)) {
    throw new TypeError(`${source} must default-export defineIntegration(...).`);
  }
  return value.owners;
}

/**
 * Wraps a declared integration in the host-contribution handle the runtime
 * installs. `id` and `source` come from the discovered file, so two
 * integrations cannot share a contribution slot by accident.
 */
export function createIntegrationContribution(
  definition: SynWareIntegrationDefinition,
  discovered: SynWareIntegrationDiscovered,
): SynCloudOSHostContribution {
  if (!isIntegrationDefinition(definition)) throw new TypeError(`${discovered.source} must default-export defineIntegration(...).`);
  return createSynCloudOSHostContribution(discovered.id, discovered.source, () => Object.freeze({
    ...(definition.runtimeConfig === undefined ? {} : { runtimeConfig: definition.runtimeConfig }),
    ...(definition.trustedDocumentKinds === undefined ? {} : { trustedDocumentKinds: definition.trustedDocumentKinds }),
    ...(definition.applicationDocuments === undefined ? {} : { applicationDocuments: definition.applicationDocuments }),
    ...(definition.install === undefined ? {} : { install: definition.install }),
  }));
}

/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { AppServiceDenial } from "./appClientTypes";

declare const synWareServiceClientType: unique symbol;

export interface SynWareServiceToken<TClient> {
  readonly id: string;
  readonly minimumVersion?: string;
  readonly contractVersion?: string;
  readonly [synWareServiceClientType]?: TClient;
}

export interface SynWareServiceTokenDefinition {
  readonly id: string;
  readonly minimumVersion?: string;
  readonly contractVersion?: string;
}

const authenticTokens = new WeakSet<object>();

function boundedIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 256) {
    throw new TypeError(`${label} must be a bounded non-empty string.`);
  }
  return normalized;
}

export function defineSynWareServiceToken<TClient>(
  definition: SynWareServiceTokenDefinition,
): SynWareServiceToken<TClient> {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("SynWare service tokens require a definition object.");
  }
  const token = Object.freeze({
    id: boundedIdentity(definition.id, "SynWare service token id"),
    ...(definition.minimumVersion === undefined
      ? {}
      : { minimumVersion: boundedIdentity(definition.minimumVersion, "SynWare service minimum version") }),
    ...(definition.contractVersion === undefined
      ? {}
      : { contractVersion: boundedIdentity(definition.contractVersion, "SynWare service contract version") }),
  }) as SynWareServiceToken<TClient>;
  authenticTokens.add(token);
  return token;
}

export function isAuthenticSynWareServiceToken(value: unknown): value is SynWareServiceToken<unknown> {
  return typeof value === "object" && value !== null && authenticTokens.has(value);
}

export class SynWareServiceAcquisitionError extends Error {
  readonly serviceId: string;
  readonly denial: AppServiceDenial;

  constructor(serviceId: string, denial: AppServiceDenial) {
    super(denial.message);
    this.name = "SynWareServiceAcquisitionError";
    this.serviceId = serviceId;
    this.denial = denial;
  }
}

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

import type { AuthenticationMethod } from "../../Authentication/authenticationTypes";

export interface StoredAuthSession {
  readonly subject: string;
  readonly expiresAt: number;
  readonly profile: string;
}

export interface AuthSessionStore {
  create(session: StoredAuthSession & { readonly tokenHash: string }): Promise<void>;
  find(tokenHash: string): Promise<StoredAuthSession | null>;
  revoke(tokenHash: string): Promise<void>;
}

export interface AuthTransaction {
  readonly stateHash: string;
  readonly browserBindingHash: string;
  readonly nonce: string;
  readonly pkceVerifier: string;
  readonly returnPath: string;
  readonly expiresAt: number;
}

export interface AuthTransactionStore {
  createTransaction(transaction: AuthTransaction): Promise<void>;
  consumeTransaction(criteria: {
    readonly stateHash: string;
    readonly browserBindingHash: string;
    readonly now: number;
  }): Promise<AuthTransaction | null>;
}

export interface AuthStore extends AuthSessionStore, AuthTransactionStore {}

export interface AuthIdentity {
  readonly issuer: string;
  readonly subject: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
}

export interface AuthAdmissionPolicy {
  admit(identity: AuthIdentity): Promise<{ readonly allowed: boolean; readonly roles: readonly string[] }>;
}

export interface AuthPublicProfile {
  readonly subject: string;
  readonly email?: string;
  readonly name?: string;
  readonly avatarUrl?: string;
  readonly roles: readonly string[];
}

export interface AuthConfiguration {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly publicOrigin: string;
  readonly method: AuthenticationMethod;
  readonly transactionLifetimeMs?: number;
  readonly sessionLifetimeMs?: number;
}

export interface AuthHandlerOptions {
  readonly config: AuthConfiguration;
  readonly store: AuthStore;
  readonly admission: AuthAdmissionPolicy;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly permissionCheck?: (
    profile: AuthPublicProfile,
    permission: string,
    context: { readonly request: Request; readonly resource: URL },
  ) => boolean | Promise<boolean>;
}

export type ProtectedResourceHandler = (request: Request, profile: AuthPublicProfile) => Response | Promise<Response>;

export interface AuthHandler {
  fetch(request: Request): Promise<Response>;
  hashToken(token: string): Promise<string>;
  authenticate(request: Request): Promise<AuthPublicProfile | null>;
  protect(permission: string, handler: ProtectedResourceHandler): (request: Request) => Promise<Response>;
}

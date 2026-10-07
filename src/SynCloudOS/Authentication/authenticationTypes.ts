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

import type { AuthPublicProfile } from "../Server/Auth/types";
import type { IdentitySessionAdapter } from "../Identity/identitySessionTypes";
import type { ResolvedSiteBranding } from "../Branding/siteBranding";
import type { ComponentType } from "react";

export type AuthenticationStatus = "disabled" | "checking" | "anonymous" | "authenticating" | "authenticated" | "expired" | "error";
export interface AuthenticationMethod { readonly id: string; readonly label: string; readonly iconUrl?: string; }
export interface AuthenticationSnapshot {
  readonly status: AuthenticationStatus;
  readonly methods: readonly AuthenticationMethod[];
  readonly profile: AuthPublicProfile | null;
  readonly expiresAt: number | null;
  readonly error: string | null;
  readonly errorCode?: "CONNECTION_ERROR" | "REQUEST_TIMEOUT";
}
export interface AuthenticationService {
  readonly sessionAdapter: IdentitySessionAdapter;
  getSnapshot(): AuthenticationSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(signal?: AbortSignal): Promise<AuthenticationSnapshot>;
  signIn(methodId: string, returnPath: string, signal?: AbortSignal): Promise<void>;
  signOut(signal?: AbortSignal): Promise<void>;
  dispose(): void;
}
export type AuthenticationPolicy = "disabled" | "optional" | "required";
export interface AuthenticationConfiguration {
  readonly policy: Exclude<AuthenticationPolicy, "disabled">;
  readonly service: AuthenticationService;
  readonly loginComponent?: AuthenticationViewComponent;
}
export type AuthenticationInput = AuthenticationPolicy | AuthenticationConfiguration;
export interface AuthenticationViewProps {
  readonly title?: string;
  readonly branding?: ResolvedSiteBranding;
  readonly methods?: readonly AuthenticationMethod[];
  readonly authenticationStatus?: AuthenticationStatus;
  readonly configurationError?: string | null;
  readonly onMethodSignIn?: (methodId: string) => void | Promise<void>;
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
}
export type AuthenticationViewComponent = ComponentType<AuthenticationViewProps>;

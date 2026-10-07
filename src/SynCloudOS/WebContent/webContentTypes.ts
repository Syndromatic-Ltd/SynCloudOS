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

export type RuntimeWebContentCapability = "forms" | "scripts" | "same-origin" | "downloads" | "popups";

export type RuntimeWebContentSource =
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "html"; readonly html: string; readonly baseUrl?: string };

export type RuntimeWebContentAction = "load" | "navigate" | "message-receive" | "message-send" | "open-external";

export interface RuntimeWebContentAuthorisationRequest {
  readonly runtimeId: string;
  readonly appId: string;
  readonly applicationSessionId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  readonly sessionId: string;
  readonly action: RuntimeWebContentAction;
  readonly sourceKind: RuntimeWebContentSource["kind"];
  readonly sourceOrigin: string;
  readonly targetOrigin: string;
  readonly navigationEpoch: number;
  readonly capability: "web-content.load" | "web-content.navigate" | "web-content.message" | "web-content.external";
  readonly requestedCapabilities: readonly RuntimeWebContentCapability[];
}

export interface RuntimeWebContentAuthorisationPort {
  authorise(request: RuntimeWebContentAuthorisationRequest, signal: AbortSignal): boolean | Promise<boolean>;
}

export interface RuntimeWebContentMessageContext {
  readonly sessionId: string;
  readonly origin: string;
  readonly correlationId: string;
  readonly navigationEpoch: number;
}

/** Decoding may wait on an app-owned validator; the runtime races that work
 * against navigation/session disposal before it can enter replay state. */
export type RuntimeWebContentMessageDecoder<T = unknown> = (payload: unknown) => T | false | Promise<T | false>;

export interface RuntimeWebContentSessionRequest<T = unknown> {
  readonly appId: string;
  readonly applicationSessionId: string;
  readonly ownerId: string;
  readonly windowControllerId?: string;
  /** @internal An opaque lease injected by the runtime-scoped app facade. */
  readonly ownerLease?: object;
  readonly title: string;
  readonly source: RuntimeWebContentSource;
  readonly capabilities?: readonly RuntimeWebContentCapability[];
  readonly decodeMessage: RuntimeWebContentMessageDecoder<T>;
  /** Returning false declines the transaction without consuming its correlation id. */
  readonly onMessage?: (payload: T, context: RuntimeWebContentMessageContext) => void | false | Promise<void | false>;
}

export type RuntimeWebContentSessionState = "loading" | "ready" | "suspended" | "failed" | "closed";

export interface RuntimeWebContentSessionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly state: RuntimeWebContentSessionState;
  readonly navigationEpoch: number;
  readonly navigationId: string;
  readonly frameSource: string;
  readonly expectedOrigin: string;
  readonly sandbox: string;
  readonly failure?: string;
}

export interface RuntimeWebContentNavigationAuthority {
  readonly epoch: number;
  readonly navigationId: string;
  readonly frameSource: string;
}

export interface RuntimeWebContentSession {
  readonly id: string;
  getSnapshot(): RuntimeWebContentSessionSnapshot;
  subscribe(listener: () => void): () => void;
  bindFrame(frame: object | null): void;
  didLoad(authority: RuntimeWebContentNavigationAuthority): void;
  didFail(authority: RuntimeWebContentNavigationAuthority, reason?: string): void;
  navigate(source: RuntimeWebContentSource, signal?: AbortSignal): Promise<boolean>;
  postMessage(payload: unknown, correlationId: string, signal?: AbortSignal): Promise<boolean>;
  openExternal(url: string, signal?: AbortSignal): Promise<boolean>;
  dispose(): void;
}

export interface RuntimeWebContentDiagnostics {
  readonly sessionCount: number;
  readonly listenerCount: number;
  readonly objectURLCount: number;
  readonly frameCount: number;
  readonly pendingOperationCount: number;
}

export interface RuntimeWebContentService {
  readonly runtimeId: string;
  createSession<T = unknown>(request: RuntimeWebContentSessionRequest<T>, signal?: AbortSignal): Promise<RuntimeWebContentSession>;
  get(sessionId: string): RuntimeWebContentSession | null;
  suspendOwner(appId: string): void;
  resumeOwner(appId: string): void;
  closeOwner(appId: string, reason?: string): void;
  closeWindowController(windowControllerId: string, reason?: string): void;
  diagnostics(): RuntimeWebContentDiagnostics;
  dispose(): void;
}

export interface RuntimeWebContentPreparedNavigation {
  readonly id: string;
  readonly sessionId: string;
  readonly navigationEpoch: number;
  readonly frameSource: string;
  readonly expectedOrigin: string;
  readonly objectURL: boolean;
}

export interface RuntimeWebContentAdapterMessage {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
}

export interface RuntimeWebContentAdapterPrepareRequest {
  readonly sessionId: string;
  readonly navigationEpoch: number;
  readonly token: string;
  readonly source: RuntimeWebContentSource;
  readonly sandbox: string;
  readonly sanitisedHTML?: string;
}

export interface RuntimeWebContentAdapter {
  issueToken(): string;
  prepare(request: RuntimeWebContentAdapterPrepareRequest, signal: AbortSignal): Promise<RuntimeWebContentPreparedNavigation>;
  ownsNavigation(navigation: unknown): boolean;
  releaseNavigation(navigation: unknown): void;
  bindFrame(sessionId: string, navigationEpoch: number, frame: object | null): void;
  ownsMessage(sessionId: string, navigationEpoch: number, source: unknown): boolean;
  postMessage(sessionId: string, navigationEpoch: number, message: unknown, targetOrigin: string): void;
  openExternal(url: string): boolean;
  subscribeMessages(listener: (message: RuntimeWebContentAdapterMessage) => void): () => void;
  diagnostics(): Pick<RuntimeWebContentDiagnostics, "listenerCount" | "objectURLCount" | "frameCount">;
  dispose(): void;
}

export interface RuntimeWebContentAdapterLease {
  readonly adapter: RuntimeWebContentAdapter;
  release(): void;
}

export interface RuntimeWebContentAdapterFactory {
  acquire(runtimeId: string, signal: AbortSignal): RuntimeWebContentAdapterLease;
}

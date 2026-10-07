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

import type { FilePanelReference, FilePanelReleaseReason, FilePanelResult, FilePanelSaveTarget, OpenPanelRequest, SavePanelRequest } from "../FilePanels";
import type { IFXImageResource } from "../../FX/ImageFX/IFXImageResource";
import type { TFXFontClient, TFXTextGeometryCapabilities } from "../../FX/TextFX/textLayoutTypes";
import type { AppClientHandle } from "./appClientTypes";
import type { TFXRunDelegateReadinessChange, TFXRunDelegateRequest } from "../../FX/TextFX/textLayoutTypes";
import type { TFXRunDelegate } from "../../FX/TextFX/TFXRunDelegate";

/** Persistence is automatically partitioned by the mounted application
 * identity. A session receives only its own preference operations. */
export interface AppPersistenceClient {
  getPreference<T>(key: string, fallback: T): T;
  setPreference<T>(key: string, value: T): boolean;
  removePreference(key: string): void;
}

export interface AppSchedulerClient {
  now(): number;
  createIdentifier(): string;
  setTimeout(callback: () => void, delayMs: number): AppClientHandle;
  requestAnimationFrame(callback: (time: number) => void): AppClientHandle;
}

export interface AppMediaQueryClient {
  getSnapshot(query: string): boolean;
  subscribe(query: string, listener: () => void): () => void;
}

export interface AppIdentitySnapshot {
  readonly authenticated: boolean;
  readonly displayName: string | null;
}

export interface AppIdentityClient {
  getSnapshot(): Readonly<AppIdentitySnapshot>;
  subscribe(listener: () => void): () => void;
}

export interface AppNotificationRequest {
  readonly title: string;
  readonly body: string;
  readonly actionIds?: readonly string[];
}

export interface AppNotificationAction {
  readonly notificationId: string;
  readonly actionId: string;
}

export interface AppNotificationClient {
  post(request: AppNotificationRequest): Promise<string>;
  subscribeActions(listener: (action: AppNotificationAction) => void): () => void;
}

export interface AppErrorClient {
  capture(error: unknown, context: Readonly<{
    operation: string;
    /** Explicit transport classification; arbitrary TypeErrors are not network failures. */
    code?: "CONNECTION_ERROR" | "APP_NOT_RESPONDING";
    timeoutMs?: number;
    /** Retry the failed operation. The mounted owner fences late outcomes. */
    retry?: () => void | Promise<void>;
  }>): void;
}

export interface AppExternalActionClient {
  openMailto(address: string, subject?: string, body?: string): Promise<void>;
}

export interface AppShareRequest {
  readonly title: string;
  readonly text?: string;
  readonly url?: string;
}

export interface AppShareClient {
  available(): boolean;
  share(request: Readonly<AppShareRequest>): Promise<"shared" | "cancelled">;
}

export interface AppWorkAreaSnapshot {
  readonly width: number;
  readonly height: number;
  readonly devicePixelRatio: number;
}

export interface AppWorkAreaClient {
  getSnapshot(): Readonly<AppWorkAreaSnapshot>;
  subscribe(listener: () => void): () => void;
}

export interface AppSettingsAvailabilitySnapshot {
  readonly vibration: boolean;
  readonly notifications: boolean;
  readonly appNotifications: boolean;
}

export interface AppSettingsAvailabilityClient {
  getSnapshot(): Readonly<AppSettingsAvailabilitySnapshot>;
  subscribe(listener: () => void): () => void;
}

export interface AppConnectivityClient {
  getSnapshot(): boolean;
  subscribe(listener: () => void): () => void;
}

export type AppEventType = "locale.changed" | "notification.action";

export interface AppEventClient {
  subscribe(type: AppEventType, listener: (event: Readonly<Record<string, unknown>>) => void): () => void;
}

export interface AppTrackingClient {
  register(options: Readonly<Record<string, unknown>>): AppClientHandle;
}

export interface AppTextLayoutClient extends TFXFontClient {
  /** Declared backend facts; absence means geometry support is unknown. */
  readonly geometryCapabilities?: TFXTextGeometryCapabilities;
  readonly attachmentReadinessGeneration: number;
  resolveRunDelegate(request: TFXRunDelegateRequest, signal?: AbortSignal): Promise<TFXRunDelegate>;
  subscribeAttachmentReadiness(listener: (change: TFXRunDelegateReadinessChange) => void): () => void;
  segment(input: Readonly<Record<string, unknown>>): unknown;
  layout(input: Readonly<Record<string, unknown>>, containers?: readonly unknown[]): Promise<unknown>;
  measure(input: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface AppAnimationOwner extends AppClientHandle {
  readonly viewId: string;
}

export interface AppAnimationSettlement {
  readonly state: "completed" | "cancelled" | "interrupted" | "failed";
  readonly reduced: boolean;
  readonly reason?: string;
}

export interface AppAnimationHandle extends AppClientHandle {
  readonly id: string;
  readonly finished: Promise<AppAnimationSettlement>;
  readonly progress: number;
  cancel(reason?: string): void;
  seek(seconds: number): void;
  pause(): void;
  resume(): void;
}

export interface AppAnimationClient {
  createRenderer(target: object, options?: Pick<import("../../FX/AnimationFX/AFXRenderer").AFXRendererOptions, "maximumQuads" | "onRenderError">, signal?: AbortSignal): import("../../FX/AnimationFX/AFXRenderer").AFXRenderer;
  bindLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXLayer").AFXLayer;
  bindShapeLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXShapeLayer").AFXShapeLayer;
  bindGradientLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXGradientLayer").AFXGradientLayer;
  bindTextLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXTextLayer").AFXTextLayer;
  bindReplicatorLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXReplicatorLayer").AFXReplicatorLayer;
  bindEmitterLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXEmitterLayer").AFXEmitterLayer;
  bindTiledLayer(target: object, signal?: AbortSignal): import("../../FX/AnimationFX/AFXTiledLayer").AFXTiledLayer;
  acquireOwner(viewId: string): AppAnimationOwner;
  animate(target: object, definition: Readonly<Record<string, unknown>>, owner: AppAnimationOwner): AppAnimationHandle;
}

export interface AppGraphicsIdentifierIssuer {
  readonly opaque: unique symbol;
}

export interface AppImageGeometryClient {
  measure(element: HTMLElement): Readonly<{ width: number; height: number }>;
  observe(element: HTMLElement, listener: () => void): () => void;
  localPoint?(element: HTMLElement, clientX: number, clientY: number): Readonly<{ x: number; y: number }>;
}

/**
 * The application's Open panel, as NSOpenPanel: the system file chooser, scoped to this mounted
 * application. Call `open` from the click or key press that asked for it; browsers show a chooser
 * only while that user activation lasts. Read the chosen files, then `release` each reference.
 * The mount owns the panel service: `dispose` is a no-op here, kept so the client satisfies
 * `NSEOpenPanel`'s service.
 */
export interface AppFilePanelClient {
  open(request: OpenPanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelReference>>;
  save(request: SavePanelRequest, signal?: AbortSignal): Promise<FilePanelResult<FilePanelSaveTarget>>;
  release(reference: FilePanelReference, reason?: FilePanelReleaseReason): void;
  dispose(): void;
}

export interface AppImageClient {
  createGraphicsIdentifierIssuer(): AppGraphicsIdentifierIssuer;
  load(request: Readonly<Record<string, unknown>>): IFXImageResource;
  readonly geometry?: AppImageGeometryClient;
}

export interface AppWebContentSessionSnapshot {
  readonly id: string;
  readonly title: string;
  readonly state: "loading" | "ready" | "suspended" | "failed" | "closed";
  readonly navigationEpoch: number;
  readonly navigationId: string;
  readonly frameSource: string;
  readonly expectedOrigin: string;
  readonly sandbox: string;
  readonly failure?: string;
}

export interface AppWebContentNavigationAuthority {
  readonly epoch: number;
  readonly navigationId: string;
  readonly frameSource: string;
}

export interface AppWebContentSession {
  readonly id: string;
  getSnapshot(): AppWebContentSessionSnapshot;
  subscribe(listener: () => void): () => void;
  bindFrame(frame: object | null): void;
  didLoad(authority: AppWebContentNavigationAuthority): void;
  didFail(authority: AppWebContentNavigationAuthority, reason?: string): void;
  navigate(source: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<boolean>;
  postMessage(payload: unknown, correlationId: string, signal?: AbortSignal): Promise<boolean>;
  openExternal(url: string, signal?: AbortSignal): Promise<boolean>;
  dispose(): void;
}

export interface AppWebContentClient {
  createSession(request: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<AppWebContentSession>;
}

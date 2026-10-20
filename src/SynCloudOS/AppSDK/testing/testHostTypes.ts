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

import type { SynWareContextValue } from "../appContextTypes";
import type { SynWareDefinition } from "../appDefinitionTypes";
import type { AppTrustedDiagnosticsClient } from "../appTrustedClientTypes";
import type { NSEApplication, NSEApplicationClass } from "../../../NSE/Application/NSEApplication";
import type { SynWareManifestV1 } from "../manifest/manifestTypes";
import type { SynWareServiceToken } from "../runtimeContracts";
import type { PasteboardRepresentation } from "../../SynCloudOS";
import type { LFXAuthorizationStatus, LFXLocation } from "../../../FX/LocationFX/public";
import type { MIFXAuthorizationState } from "../../../FX/MIDIFX/public";
import type { VFXCaptureSettings } from "../../../FX/VideoFX/public";
import type {
  SettlementExclusionHandle,
  SettlementResult,
  SettlementState,
  SettlementWorkHandle,
  SettlementWorkInput,
} from "../../Testing/appSdkTestingPort";

export type SynWareFakeMode = "allow" | "deny" | "fail" | "interrupt";

export interface SynWareFakeCall<TOperation extends string = string> {
  readonly operation: TOperation;
  readonly at: number;
}

/** Controls are deliberately test-only. Production AppSDK context values do
 * not receive them, the underlying runtime, or any raw manager. */
export interface SynWareFakeControl<TOperation extends string = string> {
  readonly mode: SynWareFakeMode;
  allow(): void;
  deny(reason?: string): void;
  fail(error?: Error): void;
  interrupt(reason?: string): void;
  calls(): readonly SynWareFakeCall<TOperation>[];
  reset(): void;
}

/** A narrow, typed operation port for a deterministic test-only capability.
 * The runtime and adapter implementation remain host-owned. */
export interface SynWareFakePort<TOperation extends string> extends SynWareFakeControl<TOperation> {
  run(operation: TOperation, signal?: AbortSignal): Promise<void>;
}

export type SynWareFakeBrowserOperation = "browser.location" | "browser.document" | "browser.window" | "browser.navigator";
export type SynWareFakeMediaOperation = "media.match" | "media.subscribe";
export type SynWareFakeViewportOperation = "viewport.layout" | "viewport.visual" | "viewport.screen" | "viewport.work-area";
export type SynWareFakeNavigationOperation = "navigation.navigate" | "navigation.subscribe";
export type SynWareFakeStorageOperation = "storage.read" | "storage.write" | "storage.remove" | "storage.clear";
export type SynWareFakeClipboardOperation = "clipboard.read" | "clipboard.write";
export type SynWareFakeDragOperation = "drag.authorise" | "drag.begin" | "drag.drop";
/** Credential/session persistence is intentionally modelled without raw
 * browser credential authority, which belongs to the Identity boundary. */
export type SynWareFakeCredentialOperation = "credentials.read" | "credentials.write" | "credentials.remove";
export type SynWareFakeFileOperation = "file.read" | "file.write" | "file.remove";
export type SynWareFakeDocumentOperation = "document.read" | "document.write" | "document.remove";
export type SynWareFakeRecoveryOperation = "recovery.read" | "recovery.write" | "recovery.remove";
export type SynWareFakeWindowOperation = "window.open" | "window.close";
export type SynWareFakePanelOperation = "panel.open" | "panel.close";
export type SynWareFakeOverlayOperation = "overlay.present" | "overlay.dismiss";
export type SynWareFakeWorkspaceOperation = "workspace.activate" | "workspace.switch";
export type SynWareFakeServiceOperation = "service.resolve";
export type SynWareFakePermissionOperation = "permission.request";
export type SynWareFakePolicyOperation = "policy.evaluate";
export type SynWareFakeImageOperation = "image.decode" | "image.export";
export type SynWareFakeTextOperation = "text.segment" | "text.measure" | "text.layout";
export type SynWareFakeAnimationOperation = "animation.animate" | "animation.cancel";
export type SynWareFakeAudioOperation = "audio.load" | "audio.play";
export type SynWareFakeLocationOperation = "location.status" | "location.current" | "location.watch";
export type SynWareFakeMIDIOperation = "midi.authorize" | "midi.authorize-sysex";
export type SynWareFakeVideoOperation = "video.enumerate" | "video.camera" | "video.display";
export type SynWareFakeWebContentOperation = "web-content.load" | "web-content.navigate" | "web-content.message" | "web-content.external";

export interface SynWareFakeLocation extends SynWareFakeControl<SynWareFakeLocationOperation> {
  setAuthorizationStatus(status: LFXAuthorizationStatus): void;
  setLocation(location: LFXLocation): void;
  emitLocation(location: LFXLocation): void;
}

export interface SynWareFakeMIDI extends SynWareFakeControl<SynWareFakeMIDIOperation> {
  setAvailable(available: boolean): void;
  setAuthorizationResult(state: Extract<MIFXAuthorizationState, "granted" | "denied" | "unavailable">): void;
  setSysExAuthorizationResult(state: Extract<MIFXAuthorizationState, "granted" | "denied" | "unavailable">): void;
}
export interface SynWareFakeVideo extends SynWareFakeControl<SynWareFakeVideoOperation> {
  setCameraSettings(settings: VFXCaptureSettings): void;
  setDisplaySettings(settings: VFXCaptureSettings): void;
}

export interface SynWareFakeClipboard extends SynWareFakeControl<SynWareFakeClipboardOperation> {
  read(types: readonly string[], signal?: AbortSignal): Promise<readonly PasteboardRepresentation[]>;
  write(values: readonly PasteboardRepresentation[], signal?: AbortSignal): Promise<void>;
  readonly values: () => readonly { readonly type: string }[];
}

export interface SynWareFakeStorage extends SynWareFakeControl<SynWareFakeStorageOperation> {
  read(key: string, signal?: AbortSignal): Promise<string | null>;
  write(key: string, value: string, signal?: AbortSignal): Promise<void>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
  clear(signal?: AbortSignal): Promise<void>;
  entries(): readonly { readonly key: string; readonly value: string }[];
}

export interface SynWareTestClock {
  now(): number;
  set(value: string | number | Date): number;
  advance(milliseconds: number): number;
  runAll(): number;
}

export interface SynWareTestMediaClock {
  nowSeconds(): number;
  advanceSeconds(seconds: number): number;
}

export interface SynWareTestPersistence {
  getPreference(key: string, fallback?: unknown): unknown;
  setPreference(key: string, value: unknown): boolean;
  removePreference(key: string): void;
  entries(): readonly { readonly key: string; readonly value: unknown }[];
}

export interface SynWareTestRenderResult {
  readonly container: HTMLElement;
  getByRole(role: string, options?: { readonly name?: string | RegExp }): HTMLElement;
  unmount(): void;
}

export interface SynWareTestLifecycle {
  launch(): Promise<unknown>;
  activate(): Promise<unknown>;
  suspend(): Promise<unknown>;
  close(): Promise<unknown>;
  state(): string;
}

export interface SynWareTestDocumentInspection {
  records(): readonly { readonly id: string; readonly typeId: string; readonly state: string; readonly dirty: boolean }[];
}

export interface SynWareTestCommandInspection {
  inspect(): readonly { readonly id: string; readonly responderId: string }[];
}

export interface SynWareTestResources {
  active(): readonly string[];
  /** Test-owned leases deliberately model resources that production code must
   * release. They are reported before host teardown clears them. */
  acquire(label: string): SynWareTestResourceLease;
}

export interface SynWareTestResourceLease {
  readonly id: string;
  release(): void;
}

export interface SynWareTestDisposalReport {
  readonly runtimeDisposed: boolean;
  readonly remaining: readonly string[];
  readonly leaked: readonly string[];
}

export interface SynWareTestAdapters {
  readonly browser: SynWareFakePort<SynWareFakeBrowserOperation>;
  readonly media: SynWareFakePort<SynWareFakeMediaOperation>;
  readonly viewport: SynWareFakePort<SynWareFakeViewportOperation>;
  readonly navigation: SynWareFakePort<SynWareFakeNavigationOperation>;
  readonly storage: Readonly<{
    readonly local: SynWareFakeStorage;
    readonly session: SynWareFakeStorage;
  }>;
  readonly clipboard: SynWareFakeClipboard;
  readonly drag: SynWareFakePort<SynWareFakeDragOperation>;
  readonly credentials: SynWareFakePort<SynWareFakeCredentialOperation>;
  readonly files: SynWareFakePort<SynWareFakeFileOperation>;
  readonly documents: SynWareFakePort<SynWareFakeDocumentOperation>;
  readonly recovery: SynWareFakePort<SynWareFakeRecoveryOperation>;
  readonly windows: SynWareFakePort<SynWareFakeWindowOperation>;
  readonly panels: SynWareFakePort<SynWareFakePanelOperation>;
  readonly overlays: SynWareFakePort<SynWareFakeOverlayOperation>;
  readonly workspace: SynWareFakePort<SynWareFakeWorkspaceOperation>;
  readonly services: SynWareFakePort<SynWareFakeServiceOperation>;
  readonly permissions: SynWareFakePort<SynWareFakePermissionOperation>;
  readonly policy: SynWareFakePort<SynWareFakePolicyOperation>;
  readonly image: SynWareFakePort<SynWareFakeImageOperation>;
  readonly text: SynWareFakePort<SynWareFakeTextOperation>;
  readonly animation: SynWareFakePort<SynWareFakeAnimationOperation>;
  readonly audio: SynWareFakePort<SynWareFakeAudioOperation>;
  readonly location: SynWareFakeLocation;
  readonly midi: SynWareFakeMIDI;
  readonly video: SynWareFakeVideo;
  readonly webContent: SynWareFakePort<SynWareFakeWebContentOperation>;
}

export interface SynWareTestSettlement {
  getState(): SettlementState;
  subscribe(listener: () => void): () => void;
  settled(options: { readonly timeoutMs: number; readonly signal?: AbortSignal }): Promise<SettlementResult>;
  begin(input: SettlementWorkInput): SettlementWorkHandle;
  exclude(input: SettlementWorkInput): SettlementExclusionHandle;
}

export interface SynWareTestNavigation {
  openRoute(pathname: string, options?: { readonly signal?: AbortSignal }): unknown;
}

export type CreateSynWareTestHostOptions = (
  | { readonly app: Readonly<SynWareDefinition>; readonly application?: never; readonly manifest?: never }
  | { readonly application: NSEApplicationClass; readonly manifest: SynWareManifestV1; readonly app?: never }
) & {
  /** Real app-scoped providers; manifest declarations and token contracts still apply. */
  readonly services?: readonly (readonly [SynWareServiceToken<unknown>, object])[];
  /** Trusted test-host codec provision. The manifest still admits application use. */
  readonly documentTypes?: readonly import("../../Documents/documentTypes").DocumentType<any, any>[];
  /** Host-owned diagnostics only; the app must still declare diagnostics.view. */
  readonly diagnostics?: AppTrustedDiagnosticsClient;
  readonly branding?: import("../appContextTypes").SynWareSiteBranding;
  readonly now?: string | number | Date;
  readonly permissions?: readonly string[];
  readonly locale?: string;
  readonly timeZone?: string;
  /** Explicit host document; the testing kit never reads an ambient DOM. */
  readonly document?: Document;
  readonly container?: HTMLElement;
  readonly strictMode?: boolean;
  /** Selects the real production presentation path. Stage remains the
   * default; physical-window uses ApplicationWindowContent and WindowLayer. */
  readonly surface?: "stage" | "window";
  /** Test-only lazy-import gate. It delays the definition module without
   * exposing a raw loader or runtime to the test application. */
  readonly loadGate?: (signal: AbortSignal) => void | Promise<void>;
}

/** A deterministic, host-owned test seam. The runtime itself remains private;
 * only narrowly redacted diagnostics and controls are made observable. */
export interface SynWareTestHost {
  /** The launched class application, or null before launch and for function apps. */
  readonly application: NSEApplication | null;
  readonly clock: SynWareTestClock;
  readonly mediaClock: SynWareTestMediaClock;
  readonly persistence: SynWareTestPersistence;
  readonly lifecycle: SynWareTestLifecycle;
  readonly documents: SynWareTestDocumentInspection;
  readonly commands: SynWareTestCommandInspection;
  /** Never exposed to the application. Replacement expires previously issued clients. */
  readonly diagnostics: Readonly<{
    replace(provider: AppTrustedDiagnosticsClient): void;
    revoke(): void;
  }>;
  readonly mediaQueries: Readonly<{
    setMatches(query: string, matches: boolean): void;
  }>;
  readonly adapters: SynWareTestAdapters;
  readonly resources: SynWareTestResources;
  readonly settlement: SynWareTestSettlement;
  /** Host-owned route authority for testing drivers. App navigation remains
   * separately capability-gated through appContext. */
  readonly navigation: SynWareTestNavigation;
  readonly appContext: SynWareContextValue;
  /** Production-mode rendering waits for the real lazy definition loader
   * before mounting through the shared host entry renderer. */
  render(): Promise<SynWareTestRenderResult>;
  dispose(): Promise<SynWareTestDisposalReport>;
}

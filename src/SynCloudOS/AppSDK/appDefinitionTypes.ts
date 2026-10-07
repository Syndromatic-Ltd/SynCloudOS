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

import type { ComponentType } from "react";
import type { SynWareManifestV1, SynWareRuntimeManifestContext } from "./manifest/manifestTypes";
import type { SynWareRouteDefinition, SynWareRouteGraph } from "../Routing/appSdkRoutePort";
import type { AppServiceClient } from "./appClientTypes";


export type AppWindowCloseResult =
  | Readonly<{ outcome: "closed"; windowId: string }>
  | Readonly<{ outcome: "cancelled"; windowId: string }>
  | Readonly<{ outcome: "refused"; windowId: string; reason: "not-closable" | "blocked" | "delegate-refused" }>;

export interface AppWindowChromeSnapshot {
  readonly title: string;
  readonly isKey: boolean;
  readonly dirty: boolean;
  readonly movable: boolean;
  readonly resizable: boolean;
  readonly closable: boolean;
  readonly minimisable: boolean;
  readonly zoomable: boolean;
  readonly chromeMode: "system" | "custom" | "frameless";
}

export interface AppWindowChromeActions {
  close(): Promise<AppWindowCloseResult>;
  minimise(): void;
  zoom(): void;
}

export interface AppWindowChromePointerDownEvent {
  readonly button: number;
  readonly isPrimary: boolean;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: Element;
  readonly currentTarget: HTMLElement;
}

export interface AppWindowChromeProps extends AppWindowChromeActions {
  readonly title: string;
  readonly titleId: string;
  readonly isKey: boolean;
  readonly dirty: boolean;
  readonly movable: boolean;
  readonly resizable: boolean;
  readonly closable: boolean;
  readonly minimisable: boolean;
  readonly zoomable: boolean;
  createMoveRegionProps(): { onPointerDown(event: AppWindowChromePointerDownEvent): void };
}

export interface SynWareRestorationServiceResolution<TClient> {
  readonly available: boolean;
  readonly client: TClient | null;
}

export interface SynWareOwnedProjectionRequest<TModel> {
  readonly typeId: string;
  readonly initialModel: TModel;
  readonly activate?: boolean;
}

export interface SynWareOwnedProjectionResult {
  readonly documentId: string;
  readonly documentKind: "projection";
  readonly documentTypeId: string;
}

/** Host-created, app-scoped authority for restoring one exact projection.
 * It exposes neither the runtime nor global document/window managers. */
export interface SynWareOwnedDocumentRematerialiseContext {
  readonly applicationId: string;
  readonly documentId: string;
  readonly restorationKey: string | null;
  readonly signal: AbortSignal;
  readonly services: Readonly<Pick<AppServiceClient, "require" | "optional">>;
  readonly createProjection: <TModel>(request: SynWareOwnedProjectionRequest<TModel>) => Promise<SynWareOwnedProjectionResult>;
}

export type SynWareOwnedDocumentRematerialiser = (
  context: SynWareOwnedDocumentRematerialiseContext,
) => Promise<SynWareOwnedProjectionResult | null>;

export interface SynWareMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  migrate(value: unknown, context: { readonly signal: AbortSignal }): unknown | Promise<unknown>;
}

export interface SynWareBackgroundHandler {
  handle(taskId: string, context: { readonly signal: AbortSignal }): void | Promise<void>;
}

export interface SynWareBundleLoadContext extends SynWareRuntimeManifestContext {
  readonly modulePath: string;
  readonly loadModule?: () => Promise<SynCloudOSAppModule>;
}

/** Canonical JavaScript module shape produced by a SynWare application. */
export interface SynCloudOSAppModule {
  readonly default: Readonly<SynWareDefinition>;
}

export interface SynWareDefinition<
  TManifest extends SynWareManifestV1 = SynWareManifestV1,
  TRoutes extends readonly SynWareRouteDefinition[] = readonly SynWareRouteDefinition[],
> {
  readonly manifest: TManifest;
  readonly root: ComponentType;
  readonly routes?: SynWareRouteGraph<TRoutes>;
  readonly migrations?: readonly SynWareMigration[];
  /** Optional custom floating-window titlebar. Rendered for windows created
   * with `windowDefaults.chrome: "custom"` through the same mounted session. */
  readonly windowChrome?: ComponentType<AppWindowChromeProps>;
  readonly createBackgroundHandler?: () => SynWareBackgroundHandler;
  /**
   * Optional boot-time document rematerialiser for window restoration. When
   * the WindowManager restores a persisted window whose document is not
   * open, it loads the owning app's bundle and offers this hook the chance
   * to rematerialise exactly that document (e.g. Leather projections from
   * Publisher data). Runs with first-party bundle trust; the manager
   * verifies the result names a live document owned by the same app.
   */
  readonly rematerialiseOwnedDocument?: SynWareOwnedDocumentRematerialiser;
}
